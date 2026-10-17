/**
 * 讲解台的**流式传输层**：签名 + POST + 读流 + 中止。
 *
 * ── 为什么单独抽出来 ──
 *
 * `useWubiAI` 里已经有令牌/抢占/过期重放等一堆状态机逻辑，再把「HMAC 签名、
 * fetch、ReadableStream 解码、SSE 分包」塞进去会变成一坨难以测试的巨物。
 * 这里只做 IO，不碰 React 状态；解析用纯函数 `execStream.ts`（可单测）。
 *
 * ── 为什么不能用 EventSource ──
 *
 * 本端点是 `POST` + 需要 `Authorization` + 需要 HMAC 签名 + 需要可中止。
 * EventSource 只支持 GET 且不能自定义请求头，一条都不满足。
 *
 * ── 为什么流式失败要能被调用方感知 ──
 *
 * 流式是**可选增强**：握手失败、读流中断、上游报错，任何一步都可能让流不可用。
 * 这里把「流建立阶段」「流中的 error 事件」「网络异常」分别归一成 `StreamFailure`，
 * 调用方据此决定是否回退同步端点 —— 不能静默吞掉，否则用户会看到一次没有结果的等待。
 */

import { getAccessToken, getSigningKey } from '../../../../../contexts/AuthContext';
import {
  foldExec,
  parseExecData,
  parseSseChunk,
  type ExecTrace,
} from './execStream';

/** 流式请求的整体超时（与同步路径同口径：后端 read-timeout 200s，agent 最坏 ~145s） */
export const STREAM_TIMEOUT_MS = 240_000;

/** SSE 事件的最小集合：其余事件名一律丢弃（`token` 也丢，正文不做打字机） */
const EXEC_EVENT = 'exec';
const DONE_EVENT = 'done';
const ERROR_EVENT = 'error';
const CONVERSATION_EVENT = 'conversation';

/** 流式过程中的回调。每个回调都是可选的：调用方只关心它需要的那些。 */
export interface ExplainStreamHandlers {
  /** 每收到一条执行事件就回调一次（**就地折叠后的**完整轨迹） */
  onExec?: (trace: ExecTrace) => void;
  /** 收到 `conversation` 事件（带会话 id 与轮次号） */
  onConversation?: (payload: {
    conversationId: string | null;
    turn: number | null;
    historyTruncated: boolean;
  }) => void;
  /** 收到 `done` 事件：`output` 是**唯一可信**的结构化结果 */
  onDone: (payload: { output: Record<string, unknown> | null; traceId: string | null }) => void;
}

/** 流式失败：调用方据此决定回退同步还是直接报错 */
export class StreamFailure extends Error {
  /** 业务错误码（来自 `event: error` 的 `code`，或传输层的伪码） */
  readonly code: string;
  /** 是否值得回退到同步端点重试一次 */
  readonly retriable: boolean;

  constructor(code: string, message: string, retriable = true) {
    super(message);
    this.name = 'StreamFailure';
    this.code = code;
    this.retriable = retriable;
  }
}

/**
 * 不可回退的失败码：这些是**确定性答复**，同步端点会得到同样的结果，
 * 再打一次只是白等一个 read-timeout（最多 200s）。
 */
const NON_RETRIABLE_CODES = new Set([
  'AI_CONVERSATION_FORBIDDEN',
  'AI_QUOTA_EXCEEDED',
  'AI_AGENT_DISABLED',
  'AI_AGENT_NOT_CONFIGURED',
]);

const hmacSha256 = async (key: string, data: string): Promise<string> => {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/** 组装带 HMAC 签名的请求头（签名覆盖 timestamp+nonce+body，与 axios 拦截器同算法） */
async function signedHeaders(body: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const signingKey = getSigningKey();
  if (signingKey && token) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    headers['X-Request-Timestamp'] = timestamp;
    headers['X-Request-Nonce'] = nonce;
    headers['X-Request-Signature'] = await hmacSha256(signingKey, timestamp + nonce + body);
  }
  return headers;
}

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * 消费一条讲解 SSE 流。
 *
 * 语义约定（与 miao-ai 的对接文档一致）：
 * - `exec`   → 折叠进过程轨并回调（**唯一的「过程可见」来源**）；
 * - `token`  → **丢弃**（正文不做打字机，避免先露出未校验内容）；
 * - `done`   → 回调 `output`（结论只认这里）；
 * - `error`  → 抛 {@link StreamFailure}；
 * - 其余事件名 → 丢弃（平台承诺「只增不改」，丢弃即可向前兼容）。
 *
 * @param signal 中止信号（用户取消 / 抢占 / 超时）
 * @throws StreamFailure 流建立失败、流中 error、网络异常
 */
export async function consumeExplainStream(
  url: string,
  body: Record<string, unknown>,
  handlers: ExplainStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  const payload = JSON.stringify(body);
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: await signedHeaders(payload),
      body: payload,
      credentials: 'include',
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err; // 主动中止：交给调用方按「取消」处理，不算失败
    throw new StreamFailure('', '连不上 AI 讲解服务（网络异常或服务未启动）', true);
  }

  if (!response.ok) {
    // 后端在建立流之前的失败会以 HTTP 状态码返回（与同步端点同一套错误壳）
    const { code, message } = await readErrorBody(response);
    throw new StreamFailure(
      code,
      message || `AI 讲解服务异常（${response.status}）`,
      !NON_RETRIABLE_CODES.has(code),
    );
  }

  if (!response.body) {
    throw new StreamFailure('', 'AI 讲解服务没有返回数据流', true);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let trace: ExecTrace = { entries: [], notes: [] };
  let sawDone = false;

  /*
   * !! abort 必须自己接住 !!
   *
   * `fetch` 的 signal 只用于**建立连接**阶段；流已经开始后调 `abort()`，
   * `reader.read()` 不会自己 reject —— 它会一直挂在那里等下一个 chunk。
   * 现象是用户点了「取消」但界面永远停在等待态（而且连接不释放）。
   * 所以这里显式监听 abort，并 cancel reader 让挂起的 read 立刻返回。
   */
  const onAbort = () => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const { events, rest } = parseSseChunk(buffer);
      buffer = rest;

      for (const event of events) {
        if (event.event === EXEC_EVENT) {
          const raw = parseExecData(event.data);
          if (!raw) continue; // 解析不出的单条丢弃，不影响其余事件
          trace = foldExec(trace, raw);
          handlers.onExec?.(trace);
          continue;
        }
        if (event.event === DONE_EVENT) {
          const parsed = safeJson(event.data);
          sawDone = true;
          handlers.onDone({
            output: toRecord(parsed?.output),
            traceId: typeof parsed?.trace_id === 'string' ? parsed.trace_id : null,
          });
          continue;
        }
        if (event.event === ERROR_EVENT) {
          const parsed = safeJson(event.data);
          const code = typeof parsed?.code === 'string' ? parsed.code : '';
          const message =
            typeof parsed?.message === 'string' && parsed.message
              ? parsed.message
              : 'AI 讲解服务出错';
          throw new StreamFailure(code, message, !NON_RETRIABLE_CODES.has(code));
        }
        if (event.event === CONVERSATION_EVENT) {
          const parsed = safeJson(event.data);
          handlers.onConversation?.({
            conversationId:
              typeof parsed?.conversation_id === 'string' ? parsed.conversation_id : null,
            turn: typeof parsed?.turn === 'number' ? parsed.turn : null,
            historyTruncated: parsed?.history_truncated === true,
          });
          continue;
        }
        // token / 未知事件：丢弃（正文不做打字机；未知事件丢弃是跨仓库约定）
      }
    }
  } catch (err) {
    if (err instanceof StreamFailure) throw err;
    // 主动中止：原样上抛让调用方按「取消」处理，不包装成失败
    if (signal.aborted) throw abortError(signal);
    throw new StreamFailure('', 'AI 讲解的连接中断了', true);
  } finally {
    signal.removeEventListener('abort', onAbort);
    // 提前退出（error / abort）时释放底层连接，避免连接悬挂
    reader.cancel().catch(() => undefined);
  }

  /*
   * 先判中止：`reader.cancel()` 会让挂起的 `read()` resolve 成 `done: true`，
   * 循环是**正常退出**的 —— 若直接落到下面的 `!sawDone` 判断，用户点了「取消」
   * 却会看到「AI 讲解没有返回完整结果，请重试」，把主动取消说成了服务故障。
   */
  if (signal.aborted) throw abortError(signal);

  if (!sawDone) {
    // 流结束了却没有 done：结果是不可信的，必须当作失败（不能拿半截过程冒充完成）
    throw new StreamFailure('', 'AI 讲解没有返回完整结果，请重试', true);
  }
}

/**
 * 归一化「主动中止」的错误对象。
 *
 * 为什么不在 catch 里直接 rethrow：abort 时 `reader.read()` 可能抛 `TypeError`
 * （cancel 引起）或什么都不抛（循环正常结束），两种都不该被当成「服务出错」。
 * 统一抛一个带 `name: 'AbortError'` 的错误，调用方的 `readError` 据此识别为取消。
 */
function abortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const err = new Error('已取消本次回答。');
  err.name = 'AbortError';
  return err;
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    return toRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

/** 从后端的统一错误壳 `{code, message}` 里取码与文案；取不到时给空码 */
async function readErrorBody(response: Response): Promise<{ code: string; message: string }> {
  try {
    const parsed = toRecord(await response.json());
    return {
      code: typeof parsed?.code === 'string' ? parsed.code : '',
      message: typeof parsed?.message === 'string' ? parsed.message : '',
    };
  } catch {
    return { code: '', message: '' };
  }
}
