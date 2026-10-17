/**
 * 讲解台「执行过程」的**纯解析层**：SSE 行解析 + `event: exec` 事件折叠。
 *
 * ── 为什么单独一个模块 ──
 *
 * 本仓库前端测试环境是 vitest `environment: 'node'`：没有 jsdom，也没有 RTL。
 * SSE 解析最容易写错的地方（一行被网络切成两块、多行 data、未知事件名）
 * 全都可以用纯函数表达，因此把它们压到这里，hook 只负责 IO。
 *
 * ── 三条必须守住的东西 ──
 *
 * 1. **未知事件名丢弃**。miao-ai 承诺「事件名只增不改」，但若把不认识的事件
 *    当正文拼起来，`exec` 的 JSON 会污染讲解正文 —— 这是最典型的写错方式。
 *    本模块**只**认 `exec`，其余一律返回 null 由调用方忽略。
 * 2. **未知 kind 降级**，绝不抛错。平台允许 agent 自定义 `kind`（不设白名单），
 *    上游还可能出现 `log` / `thinking` 之外的类型。
 * 3. **`tool_result` 就地更新 `tool_call`**，不追加新行。一次调用一行，
 *    否则过程轨会变成「开始 / 结束」两行，等待期看起来反而更吵。
 *
 * ── 一个容易忽略的事实 ──
 *
 * 执行事件里的 `tool_result.output` **不是**业务结论（如 `llm.decide` 的出参是
 * 「返回了多少字符」）。结论只认 `done.output`，本模块不碰它。
 */

/** 一条工具调用在 UI 上的状态 */
export type ExecStatus = 'running' | 'ok' | 'failed';

/**
 * 过程轨里的一行 = 一次工具调用。
 *
 * `callId` 是配对键：`tool_call` 建行，`tool_result` 按它找回同一行就地更新。
 */
export interface ExecEntry {
  callId: string;
  /** 工具名原样（`tables.lookup` / `tavily.search` / `llm.decide`，也允许自定义） */
  name: string;
  status: ExecStatus;
  /** 耗时（毫秒），仅 `tool_result` 有 */
  ms?: number;
  /** 失败原因，仅失败时有 */
  error?: string;
  /** 该条内容因体积上限被截断（来自平台的 `truncated`） */
  truncated?: boolean;
}

/** 过程轨里的一条非工具事件（`log` / `thinking` / 自定义 kind） */
export interface ExecNote {
  kind: string;
  text: string;
  level?: string;
}

/** 一轮执行过程：工具调用行 + 说明条目 */
export interface ExecTrace {
  entries: ExecEntry[];
  notes: ExecNote[];
}

export const EMPTY_EXEC_TRACE: ExecTrace = { entries: [], notes: [] };

/**
 * 把一个 SSE 缓冲区切成「已完整的事件」+「未完成的尾巴」。
 *
 * 按 SSE 规范，事件以**空行**分隔；`event:` 指定名字，`data:` 可多行（用 `\n` 拼）。
 *
 * !! 必须以「完整事件块」为单位切分 !!
 *
 * 曾经的写法是「按行扫、把最后一行当尾巴留下」，结果在分包边界丢掉了已经读到的
 * `event: exec` —— 因为那一行虽然完整，但它所属的事件还没结束，而 `event` 只是个
 * 局部变量，函数一返回就没了。下一次拼回来时事件名已经丢失，`exec` 被当成
 * `message`，过程轨整块不出现。所以这里按 `\n\n` 切块：**只有带结束空行的块才解析**，
 * 其余原样留在 `rest` 里，等待下一次读取拼回。
 *
 * @returns `events` 是已完整的 `{event, data}` 列表；`rest` 是尚未收到结束空行的残余
 */
export function parseSseChunk(buffer: string): {
  events: { event: string; data: string }[];
  rest: string;
} {
  // SSE 行分隔符允许 \n / \r\n / \r，统一成 \n 再切
  const normalized = buffer.replace(/\r\n?/g, '\n');
  const blocks = normalized.split('\n\n');
  // 最后一块没有等到结束空行 → 不算完整事件，原样留给下一次
  const rest = blocks.pop() ?? '';

  const events: { event: string; data: string }[] = [];
  for (const block of blocks) {
    let event = '';
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue; // 空行 / SSE 注释（心跳）
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
        continue;
      }
      if (line.startsWith('data:')) {
        // 规范允许 `data:` 后紧跟一个空格，要剥掉
        dataLines.push(line.slice(5).replace(/^ /, ''));
      }
      // 其余字段（id: / retry:）本场景用不到，忽略
    }

    // 只有带 data 的块才是事件（纯注释块、空块跳过）
    if (dataLines.length > 0) {
      events.push({ event: event || 'message', data: dataLines.join('\n') });
    }
  }

  return { events, rest };
}

/** `event: exec` 的原始载荷（字段可能缺失，全部按 optional 处理） */
export interface RawExecEvent {
  kind?: unknown;
  seq?: unknown;
  text?: unknown;
  level?: unknown;
  call_id?: unknown;
  name?: unknown;
  ok?: unknown;
  error?: unknown;
  ms?: unknown;
  truncated?: unknown;
}

/**
 * 解析一条 `exec` 事件的 data（JSON 字符串）。
 *
 * @returns 解析不出对象时返回 null（该条丢弃，不影响其余事件）
 */
export function parseExecData(data: string): RawExecEvent | null {
  try {
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as RawExecEvent;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 平台可能不给 `ok`（见对接文档「可能缺失，缺失时按未知处理」）→ 缺失算成功 */
function statusFrom(ok: unknown): ExecStatus {
  return ok === false ? 'failed' : 'ok';
}

/**
 * 把一条 `exec` 事件折叠进当前过程轨。
 *
 * **纯函数**：返回新对象，不修改入参（reducer 依赖引用变化触发重渲染）。
 *
 * 三种情形：
 * - `tool_call`  → 追加一行 `running`；
 * - `tool_result` → 按 `call_id` 就地更新；**找不到对应 call 时照样建行**
 *   （孤儿 result，例如中途接入或事件被截断 —— 静默丢弃会让用户少看到一次调用）；
 * - 其它 kind（`log` / `thinking` / 自定义）→ 进 `notes`，与工具行分开（不可混同）。
 */
export function foldExec(trace: ExecTrace, event: RawExecEvent): ExecTrace {
  const kind = asString(event.kind);
  if (!kind) return trace; // 没有 kind 无法归类，丢掉比让上游猜更诚实

  const callId = asString(event.call_id);
  const name = asString(event.name);
  const truncated = event.truncated === true;

  if ((kind === 'tool_call' || kind === 'tool_result') && callId) {
    const label = name ?? callId;
    const status: ExecStatus = kind === 'tool_call' ? 'running' : statusFrom(event.ok);
    const ms = asNumber(event.ms);
    const error = asString(event.error) ?? undefined;

    const index = trace.entries.findIndex((e) => e.callId === callId);
    if (index < 0) {
      return {
        ...trace,
        entries: [...trace.entries, { callId, name: label, status, ms, error, truncated }],
      };
    }
    return {
      ...trace,
      entries: trace.entries.map((entry, i) =>
        i === index ? { ...entry, name: label, status, ms, error, truncated } : entry,
      ),
    };
  }

  // 非工具类：log / thinking / 自定义 kind。文本缺失时给一句兜底，绝不显示空白行
  const text = asString(event.text) ?? asString(event.error) ?? '';
  if (!text && !truncated) return trace;
  return {
    ...trace,
    notes: [
      ...trace.notes,
      {
        kind,
        text: truncated ? `${text}（内容已截断）` : text,
        level: asString(event.level) ?? undefined,
      },
    ],
  };
}

/**
 * 工具名 → 中文标签。
 *
 * **只映射已知的三个**（miao-ai 的 wubi-explainer 上报的就是这三个）；
 * 未知工具名原样返回 —— 不猜、不翻译，宁可显示 `some.tool` 也不编一个中文名。
 */
const TOOL_LABELS: Record<string, string> = {
  'tables.lookup': '查内置码表',
  'tavily.search': '联网检索',
  'llm.decide': '模型判断拆分',
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

/** 过程轨是否为空（空时 UI 不渲染这一块） */
export function isEmptyTrace(trace: ExecTrace): boolean {
  return trace.entries.length === 0 && trace.notes.length === 0;
}

/** 是否还有调用在进行中（用于「正在…」文案与呼吸态） */
export function hasRunning(trace: ExecTrace): boolean {
  return trace.entries.some((e) => e.status === 'running');
}

/** 正在进行的调用（取最后一个：串行工具链里它才是「当前这一步」） */
export function currentEntry(trace: ExecTrace): ExecEntry | null {
  for (let i = trace.entries.length - 1; i >= 0; i -= 1) {
    if (trace.entries[i].status === 'running') return trace.entries[i];
  }
  return null;
}

/** 已完成（成功/失败）的调用数 */
export function settledCount(trace: ExecTrace): number {
  return trace.entries.filter((e) => e.status !== 'running').length;
}
