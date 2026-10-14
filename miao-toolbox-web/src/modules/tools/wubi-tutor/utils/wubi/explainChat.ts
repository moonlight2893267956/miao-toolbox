/**
 * 查码讲解台 —— 多轮会话的**纯状态模型**。
 *
 * ── 为什么单独一个模块 ──
 *
 * 本仓库的前端测试环境是 vitest `environment: 'node'`：没有 jsdom，也没有
 * React Testing Library。**组件渲染测不了**，能测的只有纯逻辑。
 * 于是把「哪些轮次、什么状态、过期了怎么办、陈旧响应要不要丢」全部压在这里，
 * 用 useReducer 驱动 UI —— 逻辑有单测，组件只负责画。
 *
 * ── 会话的边界（与 agent 的约定）──
 *
 * 一个会话锚定**一个锚点文本**：单个汉字（拆字讲解）或词组（取码讲解）。
 * agent 在 followup.py 里会拒绝「锚点与上一轮不一致」的追问（避免串味），
 * 所以换锚点就是换会话：线程按锚点文本缓存，切回已讲解过的锚点直接恢复，
 * 不重复请求 —— 这既省额度，也让「我刚才看的那个字怎么拆的」不用重新等一遍。
 *
 * 锚点是「字」还是「词组」只影响**展示与入口**（词组没有拆分演示、要显示取码
 * 规则），状态机本身不关心：线程键一直是字符串，`kind` / `ruleLabel` 只是从
 * 首轮参数里带出来的展示信息。
 */

import type {
  ExplainRevision,
  ExplainTurnPayload,
  FollowupKind,
  TurnVerification,
  WubiExplainParams,
} from './aiExplain';
import type { WubiPhraseExplainParams } from './phraseExplain';

/** 首轮参数：单字拆字（explain-split）或词组取码（explain-phrase） */
export type ExplainParams = WubiExplainParams | WubiPhraseExplainParams;

/** 一轮的角色：用户提问 / AI 回答 / 系统提示（如「会话已过期」） */
export type ExplainTurnRole = 'user' | 'assistant' | 'notice';

export interface ExplainChatTurn {
  /** 稳定 id（用于 React key 与「本轮是否最新」判断） */
  id: string;
  /** 后端轮次号；系统提示轮为 0 */
  turn: number;
  role: ExplainTurnRole;
  /** 用户提问原文（assistant 轮的「问」在哪） */
  question?: string;
  /** 正文（notice 轮即提示语） */
  text: string;
  /** 回答类型；首轮为 anchor，notice 为 notice */
  kind: FollowupKind | 'anchor' | 'notice';
  /** revise 轮是否被采纳 */
  accepted?: boolean | null;
  /** 位次修正（已按首轮候选集核对） */
  revision?: ExplainRevision | null;
  /** 本轮结论基于第几轮（agent 自报，用于「基于第 N 轮」标签） */
  basedOnTurn?: number | null;
  /** 可核对的引用出处 */
  citations: string[];
  /** 未经交叉核验的断言 */
  newClaims: string[];
  /** 模型不可用时的确定性降级回答 */
  fallback?: boolean;
  /** 可信度判定（首轮为「候选集核对」结果） */
  verification?: TurnVerification;
  /** 该轮的失败原因（agent 自报或网络错误） */
  error?: string | null;
  /**
   * 系统提示轮的类别。
   *
   * 有它才能按类别**替换**而不是堆叠：重试首轮失败时，上一次的失败提示必须被
   * 新的替代（否则一次次重试会在面板里堆出一堵失败墙，用户看不到最新原因，
   * 「重试讲解」按钮也被越推越远）。
   */
  noticeKind?: 'anchor-fail' | 'answer-fail' | 'expired' | 'cancel' | 'info';
  /** 失败轮是第几次尝试（>1 时界面会标出来，让用户知道已经重试过） */
  attempt?: number;
  /**
   * 首轮失败发生在哪一侧。
   *
   * `validation` = **本地字根表核对没过**（agent 的断言与 86 版候选不符）：
   *   重试通常还是同一处不符，界面必须把「重试没用，可看拆分」讲清楚，
   *   否则用户会一直点重试。
   * `upstream`   = 网络/服务侧问题：重试是有意义的。
   */
  failReason?: 'validation' | 'upstream';
  /** 失败轮：重试时要重发的问题（首轮失败为 undefined） */
  retryQuestion?: string;
}

export type ExplainThreadStatus = 'idle' | 'loading' | 'asking' | 'ready' | 'error';

export interface ExplainThread {
  /** 锚点文本：单个汉字或词组原文 */
  char: string;
  /** 全码（单字）或词表码（词组），锚点栏展示用 */
  code: string;
  /**
   * 锚点类型：`char` 单个汉字 / `phrase` 词组。
   *
   * 由首轮参数的 `task` 决定，只用于展示决策（词组不渲染「拆分」入口、
   * 要显示取码规则），状态流转与它无关。
   */
  kind: 'char' | 'phrase';
  /** 词组的取码规则名（单字为 null），锚点栏展示用 */
  ruleLabel: string | null;
  /**
   * 首轮的上下文（编码 + 逐位候选字根）。
   *
   * 这是本会话的**不变量**：追问轮的可信度核对、快捷追问的生成都依赖它，
   * 所以线程自带一份，不依赖组件重新计算。
   */
  params: ExplainParams | null;
  /**
   * 迄今已核实的逐位字根（首轮来自通过核对的断言，之后随每轮 positions 更新）。
   *
   * 两个用途：生成快捷追问；以及**比出模型路径下的改位**
   * （模型只回 kind=reasoned，改没改位全看这里与响应里 positions 的差异）。
   */
  positions: (string | null)[];
  /** 平台会话 ID；为 null 表示多轮未启用或已失效 */
  conversationId: string | null;
  /** 历史被平台裁剪（上下文过长） */
  historyTruncated: boolean;
  status: ExplainThreadStatus;
  /** 整体错误（首轮失败等） */
  error: string | null;
  turns: ExplainChatTurn[];
  /** 已问过的问题（快捷追问去重） */
  asked: string[];
  /** 首轮累计尝试次数（重试不叠提示，但要让用户看到「已经试过几次」） */
  anchorAttempts: number;
}

export interface ExplainChatState {
  /** 当前锚定的字 */
  activeChar: string | null;
  /** 按字缓存的线程 */
  threads: Record<string, ExplainThread>;
}

export const INITIAL_EXPLAIN_CHAT_STATE: ExplainChatState = {
  activeChar: null,
  threads: {},
};

export type ExplainChatAction =
  /** 选中一个锚点（字或词组）：换锚点会新建线程（同锚点则原样保留，不重启） */
  | { type: 'SELECT_CHAR'; char: string; code: string; params: ExplainParams }
  /** 首轮开始请求 */
  | { type: 'ANCHOR_START'; char: string }
  | {
      type: 'ANCHOR_OK';
      char: string;
      text: string;
      verification: TurnVerification;
      positions: (string | null)[];
      conversationId: string | null;
      turn: number | null;
      historyTruncated?: boolean;
    }
  | { type: 'ANCHOR_FAIL'; char: string; message: string; reason?: 'validation' | 'upstream' }
  /** 追问发出 */
  | { type: 'ASK'; char: string; question: string }
  | { type: 'ANSWER_OK'; char: string; payload: ExplainTurnPayload; turn: number | null }
  | { type: 'ANSWER_FAIL'; char: string; question: string; message: string }
  /** 会话已失效：清掉会话 ID 并留一条提示（由调用方决定是否重放首轮） */
  | { type: 'CONVERSATION_EXPIRED'; char: string; text?: string }
  /** 系统提示轮（不占用轮次） */
  | { type: 'NOTICE'; char: string; text: string }
  /** 用户取消等待：结束 loading/asking 态并留一条提示 */
  | { type: 'CANCEL'; char: string; text?: string }
  /** 重开：清空当前字的线程并回到首轮加载态 */
  | { type: 'RESTART'; char: string }
  | { type: 'RESET' };

export function explainChatReducer(
  state: ExplainChatState,
  action: ExplainChatAction,
): ExplainChatState {
  switch (action.type) {
    case 'SELECT_CHAR': {
      if (state.activeChar === action.char && state.threads[action.char]) {
        // 同字重选：保留线程（连同已问过的追问与候选集不变量）
        return state;
      }
      const existing = state.threads[action.char];
      if (existing) {
        return { ...state, activeChar: action.char };
      }
      return {
        ...state,
        activeChar: action.char,
        threads: {
          ...state.threads,
          [action.char]: createThread(action.char, action.code, action.params),
        },
      };
    }

    case 'ANCHOR_START':
      return patch(state, action.char, (t) => ({
        ...t,
        status: 'loading',
        error: null,
        // 重试开始：上一次的失败提示先收掉，避免与骨架并列造成「还在失败」的错觉
        turns: withoutNotices(t.turns, 'anchor-fail'),
      }));

    case 'ANCHOR_OK':
      return patch(state, action.char, (t) => ({
        ...t,
        status: 'ready',
        error: null,
        conversationId: action.conversationId ?? t.conversationId,
        historyTruncated: action.historyTruncated ?? t.historyTruncated,
        positions: action.positions,
        anchorAttempts: 0,
        turns: [
          ...t.turns,
          {
            id: turnId(t, 'anchor'),
            turn: action.turn ?? answeredTurnCount(t) + 1,
            role: 'assistant',
            text: action.text,
            kind: 'anchor',
            citations: [],
            newClaims: [],
            verification: action.verification,
          },
        ],
      }));

    case 'ANCHOR_FAIL':
      return patch(state, action.char, (t) => ({
        ...t,
        status: 'error',
        error: action.message,
        anchorAttempts: t.anchorAttempts + 1,
        // 只保留最新一条失败提示（附尝试次数）：重试是同一个动作，不该留下历史残影
        turns: [
          ...withoutNotices(t.turns, 'anchor-fail'),
          {
            id: turnId(t, 'anchor-error'),
            turn: 0,
            role: 'notice',
            text: '这次没能生成讲解：' + action.message,
            kind: 'notice',
            noticeKind: 'anchor-fail',
            attempt: t.anchorAttempts + 1,
            failReason: action.reason ?? 'upstream',
            citations: [],
            newClaims: [],
            error: action.message,
          },
        ],
      }));

    case 'ASK':
      return patch(state, action.char, (t) => ({
        ...t,
        status: 'asking',
        asked: t.asked.includes(action.question) ? t.asked : [...t.asked, action.question],
        turns: [
          ...t.turns,
          {
            id: turnId(t, 'ask'),
            turn: 0,
            role: 'user',
            question: action.question,
            text: action.question,
            kind: 'notice',
            citations: [],
            newClaims: [],
          },
        ],
      }));

    case 'ANSWER_OK':
      return patch(state, action.char, (t) => ({
        ...t,
        status: 'ready',
        // 逐位字根随本轮结论推进：下一轮的改位对比就以它为基准
        positions: action.payload.positions ?? t.positions,
        turns: [
          ...t.turns,
          {
            id: turnId(t, 'answer'),
            turn: action.turn ?? answeredTurnCount(t) + 1,
            role: 'assistant',
            text: action.payload.text,
            kind: action.payload.kind,
            accepted: action.payload.accepted,
            revision: action.payload.revision,
            basedOnTurn: action.payload.basedOnTurn,
            citations: action.payload.citations,
            newClaims: action.payload.newClaims,
            fallback: action.payload.fallback,
            verification: action.payload.verification,
            error: action.payload.error,
          },
        ],
      }));

    case 'ANSWER_FAIL':
      return patch(state, action.char, (t) => ({
        ...t,
        status: 'ready',
        turns: [
          ...t.turns,
          {
            id: turnId(t, 'answer-error'),
            turn: 0,
            role: 'notice',
            text: '这次追问没能回答：' + action.message,
            kind: 'notice',
            noticeKind: 'answer-fail',
            citations: [],
            newClaims: [],
            error: action.message,
            retryQuestion: action.question,
          },
        ],
      }));

    case 'CONVERSATION_EXPIRED':
      // 会话失效：清掉 ID，留一条提示；是否重放首轮由调用方决定
      return patch(state, action.char, (t) => ({
        ...t,
        conversationId: null,
        turns: [
          ...t.turns,
          {
            id: turnId(t, 'expired'),
            turn: 0,
            role: 'notice',
            text: action.text ?? '上一次会话已失效，已为你重新开始讲解。',
            kind: 'notice',
            noticeKind: 'expired',
            citations: [],
            newClaims: [],
          },
        ],
      }));

    case 'NOTICE':
      return patch(state, action.char, (t) => ({
        ...t,
        turns: [
          ...t.turns,
          {
            id: turnId(t, 'notice'),
            turn: 0,
            role: 'notice',
            text: action.text,
            kind: 'notice',
            noticeKind: 'info',
            citations: [],
            newClaims: [],
          },
        ],
      }));

    case 'CANCEL':
      // 取消后不能留在 loading/asking：否则输入框会永远禁用
      return patch(state, action.char, (t) => ({
        ...t,
        status: t.status === 'loading' || t.status === 'asking' ? 'ready' : t.status,
        turns: [
          ...t.turns,
          {
            id: turnId(t, 'cancel'),
            turn: 0,
            role: 'notice',
            text: action.text ?? '已取消本次回答。',
            kind: 'notice',
            noticeKind: 'cancel',
            citations: [],
            newClaims: [],
          },
        ],
      }));

    case 'RESTART':
      return patch(state, action.char, (t) => ({
        ...t,
        status: 'loading',
        error: null,
        conversationId: null,
        positions: [],
        historyTruncated: false,
        anchorAttempts: 0,
        turns: [],
        // 历史已清空：快捷追问的去重依据也必须清，否则同一问题再也推荐不出来
        asked: [],
      }));

    case 'RESET':
      return INITIAL_EXPLAIN_CHAT_STATE;

    default:
      return state;
  }
}

// ─── 纯工具函数 ──────────────────────────────────────────

function createThread(char: string, code: string, params: ExplainParams): ExplainThread {
  const isPhrase = params.task === 'explain-phrase';
  return {
    char,
    code,
    kind: isPhrase ? 'phrase' : 'char',
    ruleLabel: isPhrase ? params.ruleLabel : null,
    params,
    positions: [],
    conversationId: null,
    historyTruncated: false,
    status: 'idle',
    error: null,
    turns: [],
    asked: [],
    anchorAttempts: 0,
  };
}

/** 去掉某类系统提示轮（重试时用它替换上一次的失败提示，而不是越堆越多） */
function withoutNotices(turns: ExplainChatTurn[], kind: ExplainChatTurn['noticeKind']): ExplainChatTurn[] {
  return turns.filter((t) => !(t.role === 'notice' && t.noticeKind === kind));
}

/**
 * 只对**已存在的线程**生效。
 *
 * 这条守卫是「陈旧响应」的兜底：用户切到别的字之后，上一个字的响应才回来 ——
 * 此时它不该凭空造出一个线程（那会让界面跳回用户已经离开的字）。
 * 调用方另外用请求令牌拦截，这里再挡一层，两层都不贵。
 */
function patch(
  state: ExplainChatState,
  char: string,
  fn: (thread: ExplainThread) => ExplainThread,
): ExplainChatState {
  const thread = state.threads[char];
  if (!thread) return state;
  return { ...state, threads: { ...state.threads, [char]: fn(thread) } };
}

let seq = 0;
function turnId(thread: ExplainThread, tag: string): string {
  seq += 1;
  return `${tag}-${thread.turns.length}-${seq}`;
}

/** 把正文切成句子，供逐句渐入；空行与超长行都原样保留 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？；!?;])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 抢占判定。
 *
 * 一个用户在「等这个字回答」的时候点了另一个字（查码台旁边就是字表，这是最自然的操作）：
 * 新请求会 abort 掉旧请求，而旧请求的 catch 因为请求令牌过期直接 return ——
 * 如果不主动复位，**那个字的线程会永远停在 loading/asking**：切回去看到的是永不结束的
 * 骨架或「正在结合上文回答…」，输入框与「新会话」全被禁用，只有点「取消」才能救回来。
 *
 * @returns 需要复位的字（没有或就是同一个字时为 null）
 */
export function preemptedChar(prevChar: string | null | undefined, nextChar: string): string | null {
  return prevChar && prevChar !== nextChar ? prevChar : null;
}

/** 取某字的线程（不存在返回 null） */
export function threadFor(state: ExplainChatState, char: string | null): ExplainThread | null {
  if (!char) return null;
  return state.threads[char] ?? null;
}

/** 取当前锚定字的线程 */
export function activeThread(state: ExplainChatState): ExplainThread | null {
  return threadFor(state, state.activeChar);
}

/** 线程是否已有可展示的首轮讲解 */
export function hasAnchorAnswer(thread: ExplainThread | null): boolean {
  if (!thread) return false;
  return thread.turns.some((t) => t.kind === 'anchor' && Boolean(t.text));
}

/**
 * 已完成的后端轮次数。
 *
 * 派生而不是存字段：手写计数迟早会和 turns 对不上（尤其是「会话过期后重放首轮」
 * 这类会把轮次重新算过一遍的路径）。轮次号在界面上只是「第 N 轮」的展示，
 * 从已有轮次里数出来最不容易错。
 */
export function answeredTurnCount(thread: ExplainThread | null): number {
  if (!thread) return 0;
  return thread.turns.filter((t) => t.role === 'assistant' && t.turn > 0).length;
}

/** 是否正在等待回答（首轮或追问） */
export function isBusy(thread: ExplainThread | null): boolean {
  return thread?.status === 'loading' || thread?.status === 'asking';
}

/** 最后一轮 AI 回答（用于「仅对最新一轮做渐入」） */
export function latestAssistantTurnId(thread: ExplainThread | null): string | null {
  if (!thread) return null;
  for (let i = thread.turns.length - 1; i >= 0; i -= 1) {
    if (thread.turns[i].role === 'assistant') return thread.turns[i].id;
  }
  return null;
}
