/**
 * 查码讲解台 —— 多轮会话 Hook。
 *
 * 调用后端 `/api/wubi/ai/explain`（首轮）与 `/api/wubi/ai/followup`（追问），
 * 二者都是**同步**接口：后端经 `MiaoAiClient` 转发到 miao-ai 的 `wubi-explainer`，
 * 并在平台侧维护会话（`conversationId` 由后端创建并随响应回来）。密钥不出后端：
 * 浏览器只跟自家 `/api` 说话。
 *
 * ── 为什么不用 SSE 流式 ──
 *
 * agent 的流式只是把**已经算好的**正文按块吐出来（见 agent.py 的 `_stream_result`），
 * 真实等待发生在决策与校验那一步 —— 流式不能把它变快，只是让等待看起来有事发生。
 * 而拆字讲解要给出**结构化断言**交给前端逐条核对，先看到半截 JSON 反而更糟。
 * 所以本次采用「同步 + 骨架 + 分阶段提示 + 可取消」，流式留作后续增强。
 *
 * ── 三层纪律 ──
 *
 * 1. **AI 是可选增强**：任何失败都不影响查码、拆分演示与练习；界面如实说明原因。
 * 2. **陈旧响应必须丢**：用户换了字之后回来的旧响应不能写进当前线程
 *    （请求令牌 + reducer 里的「线程存在才生效」双重守卫）。
 * 3. **能被机器判定的才承认**：首轮要过候选集核对（`isExplanationDisplayable`），
 *    追问轮的修正主张要落在该位候选集内（`verifyTurn`）。
 */

import { useReducer, useCallback, useRef, useState } from 'react';
import axiosInstance from '../../../../../services/axiosInstance';
import {
  buildExplainContext,
  isExplanationDisplayable,
  parseFollowupTurn,
  parseWubiExplainResult,
} from './aiExplain';
import {
  isPhraseExplanationDisplayable,
  parseWubiPhraseExplainJson,
  type WubiPhraseExplainParams,
} from './phraseExplain';
import {
  INITIAL_EXPLAIN_CHAT_STATE,
  activeThread,
  answeredTurnCount,
  explainChatReducer,
  hasAnchorAnswer,
  isBusy,
  preemptedChar,
  type ExplainChatState,
  type ExplainParams,
  type ExplainThread,
} from './explainChat';
import type { SplitResult } from './splitter';
import type { KeyError } from './session';

/**
 * 前端的等待上限。
 *
 * 后端给 wubi-explainer 配的 read-timeout 是 200s（agent 内部最坏 ~145s：两次尝试、
 * 每次模型 70s）。前端必须盖住后端，否则会在 agent 还在算的时候先断 ——
 * 用户看到的是「AI 不可用」，而答案马上就好。所以给到 240s，并配一个「取消」。
 */
const REQUEST_TIMEOUT_MS = 240_000;

/** 视为「AI 讲解整体不可用」的错误码（配置问题，重试无意义） */
const UNAVAILABLE_CODES = new Set(['AI_AGENT_NOT_CONFIGURED', 'AI_AGENT_DISABLED']);

/** 会话失效类错误码：自动开新会话并重放首轮 */
const EXPIRED_CODES = new Set([
  'AI_CONVERSATION_EXPIRED',
  'AI_CONVERSATION_NOT_FOUND',
  'AI_CONVERSATION_FORBIDDEN',
]);

interface ApiError {
  code: string;
  message: string;
}

export interface UseWubiExplainChatResult {
  state: ExplainChatState;
  /** 当前锚点（字或词组）的线程 */
  thread: ExplainThread | null;
  activeChar: string | null;
  /** AI 配置性不可用时的原因（非空即整块停用，并如实展示） */
  aiUnavailable: string | null;
  /** 一次性提示（会话过期、多轮未启用等） */
  notice: string | null;
  dismissNotice: () => void;
  /** 选中一个字。auto=false 时只切换锚点，不自动请求 */
  selectChar: (char: string, code: string, split: SplitResult, opts?: { auto?: boolean; mistake?: KeyError }) => void;
  /**
   * 选中一个词组（取码讲解）。上下文由 `buildPhraseExplainContext` 造好 ——
   * 词组没有「拆字结果」，所以这里直接收参数，不走 `selectChar` 的 split 入参。
   */
  selectPhrase: (params: WubiPhraseExplainParams, opts?: { auto?: boolean }) => void;
  /** 手动开始/重试首轮讲解 */
  startExplain: () => void;
  /** 追问 */
  ask: (question: string) => void;
  /** 新会话：清空当前字的线程并重跑首轮 */
  restart: () => void;
  /** 取消正在进行的请求 */
  cancel: () => void;
  /** 是否正在等待回答 */
  busy: boolean;
  /** 是否已有可展示的首轮讲解 */
  hasAnswer: boolean;
  /** 已完成轮次数 */
  turnCount: number;
  /** 多轮追问是否可用（后端回了会话 ID 才可用） */
  followupEnabled: boolean;
}

export function useWubiExplainChat(): UseWubiExplainChatResult {
  const [state, dispatch] = useReducer(explainChatReducer, INITIAL_EXPLAIN_CHAT_STATE);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState<string | null>(null);

  /**
   * 最新的 state 快照。
   *
   * 回调里要读「这个字是否已有线程」「线程的候选集」，但它们不能进 useCallback
   * 的依赖 —— 那会让每次状态变化都重建回调，进而把组件的 effect 也带着重跑。
   * 用一个 ref 读最新值。
   */
  const stateRef = useRef(state);
  stateRef.current = state;

  /** 请求令牌：只有最新一次请求的响应才允许写回状态 */
  const tokenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** 在途请求归属：抢占时据此复位被放弃的那个字 */
  const inFlightRef = useRef<{ token: number; char: string } | null>(null);

  /**
   * 开一次请求：发令牌、抢占上一个在途请求、必要时复位被抢占的那个字。
   *
   * !! 为什么必须复位 !!
   * 新请求 abort 掉旧请求后，旧请求的 catch 会因令牌过期直接 return（不派发任何 action）。
   * 如果不主动把那个字的线程拨回 ready，它会永远停在 loading/asking：
   * 切回去看到的是永不结束的骨架或「正在结合上文回答…」，输入框与「新会话」全被禁用。
   */
  const beginRequest = useCallback((char: string) => {
    const token = ++tokenRef.current;
    const abandoned = preemptedChar(inFlightRef.current?.char, char);
    if (abandoned) {
      dispatch({
        type: 'CANCEL',
        char: abandoned,
        text: '已切换到其它字，本次回答已取消。',
      });
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = { token, char };
    return { token, signal: controller.signal };
  }, []);

  const post = useCallback(
    async (url: string, body: Record<string, unknown>, signal: AbortSignal) =>
      axiosInstance.post(url, body, {
        timeout: REQUEST_TIMEOUT_MS,
        signal,
        // 讲解台会在右栏自己说明失败原因（含配额/上游不可用），
        // 再弹一条「请刷新页面重试」既重复，也和「稍后重试即可」的真实处置相反
        skipGlobalErrorToast: true,
      }),
    [],
  );

  /**
   * 首轮讲解：拿候选集打包好的上下文去问 agent。
   *
   * @returns 本轮生效的会话 ID（拿不到就是 null）。**必须回传它**：
   *  「会话过期 → 重放首轮 → 重发该问题」这条链路上，重放刚拿到的会话 ID
   *  还没进 stateRef（dispatch 不立即更新 ref），追问若去读 ref 会读到 null。
   */
  const runAnchor = useCallback(
    async (
      char: string,
      params: ExplainParams,
      conversationId: string | null,
    ): Promise<string | null> => {
      const { token, signal } = beginRequest(char);
      dispatch({ type: 'ANCHOR_START', char });

      try {
        const res = await post('/api/wubi/ai/explain', {
          ...params,
          ...(conversationId ? { conversationId } : {}),
        }, signal);
        if (token !== tokenRef.current) return null;

        const data = unwrapApiData(res.data);
        const json = JSON.stringify(data);

        /*
         * 两条并列的解析路径：单字（explain-split）与词组（explain-phrase）。
         * 分开写而不是合成一个泛型，是因为两者的**断言形状不同** ——
         * 词组的 radical 允许为 null（该位无候选），单字不允许；
         * 合成一处迟早会把某一侧的边界放宽。
         */
        let displayable = false;
        let text: string | null = null;
        let positions: (string | null)[] = [];
        let failureReason = '解释未通过与字根表的核对';

        if (params.task === 'explain-phrase') {
          const parsed = parseWubiPhraseExplainJson(json, params);
          displayable = isPhraseExplanationDisplayable(parsed);
          text = parsed.explanation;
          positions = (parsed.positions ?? []).map((p) => p.radical);
          failureReason = explainFailureReason(parsed);
        } else {
          const parsed = parseWubiExplainResult(json, params);
          displayable = isExplanationDisplayable(parsed);
          text = parsed.explanation;
          positions = (parsed.positions ?? []).map((p) => p.radical);
          failureReason = explainFailureReason(parsed);
        }

        if (!displayable) {
          dispatch({
            type: 'ANCHOR_FAIL',
            char,
            // 本地核对不过 ≠ 网络问题：界面据此告诉用户「重试通常仍是同一处不符」
            reason: 'validation',
            message: failureReason,
          });
          return null;
        }

        const nextConversationId = readString(data, 'conversationId') ?? conversationId;
        dispatch({
          type: 'ANCHOR_OK',
          char,
          text: text ?? '',
          verification: 'ok',
          positions,
          conversationId: nextConversationId,
          turn: readNumber(data, 'turn'),
          historyTruncated: data?.historyTruncated === true,
        });
        setAiUnavailable(null);
        return nextConversationId;
      } catch (err: unknown) {
        if (token !== tokenRef.current) return null;
        const { code, message } = readError(err);
        if (UNAVAILABLE_CODES.has(code)) setAiUnavailable(message);
        dispatch({ type: 'ANCHOR_FAIL', char, message, reason: 'upstream' });
        return null;
      } finally {
        // 已结束的请求不再算「在途」：否则下一次选字会朝它误发一条「已取消」提示
        if (inFlightRef.current?.token === token) inFlightRef.current = null;
      }
    },
    [post],
  );

  /** 追问：只发 char + question + conversationId，历史由平台注入 */
  const runFollowup = useCallback(
    async (
      char: string,
      question: string,
      conversationIdOverride?: string | null,
    ): Promise<ApiError | null> => {
      const thread = stateRef.current.threads[char];
      if (!thread?.params) return null;
      const conversationId = conversationIdOverride ?? thread.conversationId;
      if (!conversationId) {
        // 不该发生（调用方先查过），但真发生了也要收场：留在「正在回答」比报错更糟
        const message = '会话信息已丢失，请点「新会话」重新开始讲解。';
        dispatch({ type: 'ANSWER_FAIL', char, question, message });
        return { code: '', message };
      }

      const params = thread.params;
      const { token, signal } = beginRequest(char);

      try {
        const res = await post('/api/wubi/ai/followup', { char, question, conversationId }, signal);
        if (token !== tokenRef.current) return null;

        const data = unwrapApiData(res.data);
        // 带上当前位置：模型路径的改位只能靠「上一轮 vs 本轮」的差异比出来
        const payload = parseFollowupTurn(data, params, thread.positions);
        dispatch({ type: 'ANSWER_OK', char, payload, turn: readNumber(data, 'turn') });
        setAiUnavailable(null);
        return null;
      } catch (err: unknown) {
        if (token !== tokenRef.current) return null;
        const apiError = readError(err);
        if (UNAVAILABLE_CODES.has(apiError.code)) setAiUnavailable(apiError.message);
        return apiError;
      } finally {
        if (inFlightRef.current?.token === token) inFlightRef.current = null;
      }
    },
    [post],
  );

  /**
   * 选中一个锚点（单字或词组）：建/恢复线程，必要时自动开讲。
   *
   * 单字与词组在这里合流 —— 两者的差别只在**首轮参数怎么造**（单字由
   * `buildExplainContext` 从拆字结果造，词组由 `buildPhraseExplainContext` 造），
   * 之后的「恢复已有线程 / 失败态重试 / auto 开关 / AI 不可用就不发」完全一致。
   */
  const selectAnchor = useCallback(
    (anchor: string, code: string, params: ExplainParams, opts?: { auto?: boolean }) => {
      const existing = stateRef.current.threads[anchor];
      const effective = existing?.params ?? params;

      dispatch({ type: 'SELECT_CHAR', char: anchor, code, params: effective });

      // 已判定「AI 整体不可用」（agent 未配置/未启用）时不再自动发请求：
      // 选字照常切换锚点与事实栏，但要发也是注定 503 的一次往返
      if (aiUnavailable) return;

      // 已有线程且不是失败态 → 直接恢复，不重复请求（省额度，也省一次十几秒的等待）
      if (existing && existing.status !== 'error') return;
      if (existing && existing.status === 'error') {
        void runAnchor(anchor, effective, existing.conversationId);
        return;
      }
      if (opts?.auto === false) return;
      void runAnchor(anchor, effective, null);
    },
    [runAnchor, aiUnavailable],
  );

  const selectChar = useCallback(
    (char: string, code: string, split: SplitResult, opts?: { auto?: boolean; mistake?: KeyError }) => {
      selectAnchor(char, code, buildExplainContext(split, opts?.mistake), opts);
    },
    [selectAnchor],
  );

  const selectPhrase = useCallback(
    (params: WubiPhraseExplainParams, opts?: { auto?: boolean }) => {
      selectAnchor(params.char, params.code, params, opts);
    },
    [selectAnchor],
  );

  const startExplain = useCallback(() => {
    const s = stateRef.current;
    const thread = s.activeChar ? s.threads[s.activeChar] : null;
    if (!thread?.params || isBusy(thread)) return;
    void runAnchor(thread.char, thread.params, thread.conversationId);
  }, [runAnchor]);

  const ask = useCallback(
    (raw: string) => {
      const question = raw.trim();
      const s = stateRef.current;
      const char = s.activeChar;
      const thread = char ? s.threads[char] : null;
      if (!question || !char || !thread?.params || isBusy(thread)) return;

      if (!thread.conversationId) {
        // 多轮没开（agent 未声明 conversation.enabled）：说清楚，不要发一个注定失败的请求
        setNotice('本次讲解是单轮的：当前会话未启用多轮追问，换字或重新开始即可再讲一次。');
        return;
      }

      dispatch({ type: 'ASK', char, question });

      void (async () => {
        const error = await runFollowup(char, question);
        if (!error) return;

        if (EXPIRED_CODES.has(error.code)) {
          // 会话过期在平台上很常见（默认 TTL 1 小时）：自动开新会话、重放首轮、再问一次
          dispatch({
            type: 'CONVERSATION_EXPIRED',
            char,
            text: '上一次会话已失效，已自动开始新会话并重放讲解。',
          });
          const replayed = await runAnchor(char, thread.params!, null);
          if (!replayed) {
            // 重放首轮都没成：问题不能就这么消失，必须留下可重试的记录
            dispatch({
              type: 'ANSWER_FAIL',
              char,
              question,
              message: '重新开始讲解失败，请点「重试讲解」后再问一次',
            });
            return;
          }
          // 用刚拿到的会话 ID 显式追问：此刻 stateRef 里还是旧的 null。
          // !! 返回值不能丢 !! —— runFollowup 只在成功时派发 ANSWER_OK，
          // 失败只把 ApiError 交回调用方；丢掉它，用户轮后面就既无回答也无失败记录。
          const second = await runFollowup(char, question, replayed);
          if (second) dispatch({ type: 'ANSWER_FAIL', char, question, message: second.message });
          return;
        }
        dispatch({ type: 'ANSWER_FAIL', char, question, message: error.message });
      })();
    },
    [runAnchor, runFollowup],
  );

  const restart = useCallback(() => {
    const s = stateRef.current;
    const thread = s.activeChar ? s.threads[s.activeChar] : null;
    if (!thread?.params) return;
    dispatch({ type: 'RESTART', char: thread.char });
    setNotice(null);
    void runAnchor(thread.char, thread.params, null);
  }, [runAnchor]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    tokenRef.current += 1;
    inFlightRef.current = null;
    const s = stateRef.current;
    const thread = s.activeChar ? s.threads[s.activeChar] : null;
    if (thread) {
      dispatch({ type: 'CANCEL', char: thread.char, text: '已取消本次回答。' });
    }
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const thread = activeThread(state);

  return {
    state,
    thread,
    activeChar: state.activeChar,
    aiUnavailable,
    notice,
    dismissNotice,
    selectChar,
    selectPhrase,
    startExplain,
    ask,
    restart,
    cancel,
    busy: isBusy(thread),
    hasAnswer: hasAnchorAnswer(thread),
    turnCount: answeredTurnCount(thread),
    followupEnabled: Boolean(thread?.conversationId),
  };
}

// ─── 纯工具 ─────────────────────────────────────────────

/**
 * 剥掉后端的 `ApiResponse` 包装，拿到 agent 的原始输出。
 *
 * 后端统一返回 `{code, data, requestId}`；但 agent 输出本身也有可能出现
 * `output` 包装层（历史原因）。两种都吃得下，拿不到就打回原样交给解析器判断 ——
 * 这里的职责只是「别把包装层当成 agent 的字段」。
 */
function unwrapApiData(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const data = record.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return record;
}

function readString(data: Record<string, unknown> | null, key: string): string | null {
  const value = data?.[key];
  return typeof value === 'string' && value ? value : null;
}

function readNumber(data: Record<string, unknown> | null, key: string): number | null {
  const value = data?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 从 axios 错误里取统一响应体的 code / message；没有响应体时翻译成中文 */
function readError(err: unknown): ApiError {
  const response = (err as { response?: { data?: { code?: unknown; message?: unknown } } })?.response;
  const code = typeof response?.data?.code === 'string' ? response.data.code : '';

  if (code) {
    const message =
      (typeof response?.data?.message === 'string' && response.data.message) ||
      'AI 讲解暂时不可用';
    return { code, message };
  }

  /*
   * 没有统一响应体 = 根本没走到后端（超时 / 断网 / 请求被中止）。
   *
   * 这一层必须翻译：axios 的原生消息是英文的（"timeout of 240000ms exceeded"、
   * "Network Error"），直接弹给用户既看不懂，也给不出下一步动作。
   */
  const raw = err as { code?: string; message?: string };
  if (raw?.code === 'ECONNABORTED' || /timeout/i.test(raw?.message ?? '')) {
    return { code: '', message: 'AI 讲解超时了（可稍后重试，或先换个字看讲解）' };
  }
  if (!response) {
    return { code: '', message: '连不上 AI 讲解服务（网络异常或服务未启动）' };
  }
  return { code: '', message: raw?.message || 'AI 讲解暂时不可用' };
}

/**
 * 首轮不可展示时给用户一个可读的原因（三级兜底 + 定位到哪一步）。
 *
 * 只显示「没通过核对」而不说原因，等于把排查成本转给用户 ——
 * 而这三种原因的处理方式完全不同：前端核对不通过 = agent 挑错了字根；
 * agent 自校验不通过 = 同上且能看到原因；agent 的 error = 服务侧问题。
 *
 * 三条都空时**不能**直接回通用文案：那正是「解析层静默失败」的形态
 * （模型给了正文却没给可校验的断言），一句「没通过核对」既不告诉用户
 * 是模型的问题还是我们的问题，也没有任何可排查的线索。
 */
function explainFailureReason(result: {
  explanation?: string | null;
  positions?: unknown[] | null;
  validation?: { violations: string[] } | null;
  selfCheck?: { violations?: string[] } | null;
  error?: string | null;
} | null): string {
  const specific =
    result?.validation?.violations[0] ??
    result?.selfCheck?.violations?.[0] ??
    result?.error;
  if (specific) return specific;

  if (!result?.explanation) return '模型没有给出讲解正文';
  if (!result?.positions) return '模型没有给出逐位断言（positions），无法与码表核对';
  return '解释未通过与字根表的核对';
}
