/**
 * 练习中断现场（快照）。
 *
 * ── 它在解决什么 ──
 *
 * 练习到一半刷新页面，会话直接没了，只能从模式选择器重来。用户要的是
 * 「接着刚才那一轮继续」。这里存的就是「刚才那一轮练到哪儿了」。
 *
 * ── 为什么不能存题目 ──
 *
 * 题源是「闭包 + 内部可变状态」（`internal: { pool, used: new Set() }`），
 * `Set` 没法 JSON 序列化，所以「把题源快照下来」这条路走不通。
 *
 * 换一个思路：**存题目序列的「生成方式」而不是序列本身**。
 * 题源的全部随机性都走可注入的发生器（见 `utils/wubi/rng.ts`），
 * 于是「同一种子 + 同样次数的 next()」必然复现同一题序与同一份内部状态。
 * 恢复时重建题源、空转到第 N 题即可 —— 一个字段都不用序列化。
 *
 * ── 为什么必须有 TTL ──
 *
 * 快照本质是「刚才」。隔夜回来接着打，速度指标会失真得离谱：
 * 分子是当时累计的用时，分母却横跨一整晚。超过 TTL 一律当作没有，
 * 让它自然过期，比恢复出一个荒谬的成绩更诚实。
 */

import type { SessionCounters } from './session';

export const SNAPSHOT_VERSION = 1;

/** 中断现场的有效期（12 小时） */
export const SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * 可恢复的模式白名单。
 *
 * 不在其中的只有「课程闯关」—— 它的题源依赖 `lesson + stage` 两个对象，
 * 且关卡本身是短程任务，中断后重进成本低。与其为它做一套对象解析，
 * 不如明确地不支持：**白名单之外一律不提示「继续」**，而不是恢复出一个错的东西。
 */
export const RESTORABLE_KINDS = [
  'key-drill',
  'radical-identify',
  'radical-sequence',
  'char-code',
  'wrong-chars',
  'simplified-code',
  'phrase-code',
  'article',
  'custom-article',
] as const;

export type RestorableKind = (typeof RESTORABLE_KINDS)[number];

/** 会话累计量：恢复时原样搬运，不重算。与会话语义共用一份定义，避免两处漂移。 */
export type SnapshotCounters = SessionCounters;

export interface PracticeSnapshot {
  version: number;
  /** 写入时刻，用于 TTL 判定 */
  savedAt: number;
  modeKind: RestorableKind;
  /**
   * 模式参数（分区 / 方向 / 词组长度 / 文章 id / 自定义文本 / 错字集）。
   *
   * 这里**只做结构校验**（扁平、值为原始类型），取值是否合法交给消费方 ——
   * 参数的唯一消费者是 `buildSource`，它本来就对每个字段有明确的取值域。
   */
  params: Record<string, string | number | boolean | string[]>;
  /** 本轮题序种子：恢复的钥匙 */
  seed: number;
  /** 已完成的题数（恢复到第几题） */
  completed: number;
  /**
   * 中断时当前题已输入的键。
   *
   * 对 char-code 只是「丢几个键」，但对**文章模式是全部进度**：
   * 文章把整篇作为一道题（`total: 1`），逐字推进的位置完全由它承载
   * （`articleCursor.ts`）。少了它，文章打一半刷新就会从头开始。
   */
  inputKeys: string[];
  counters: SnapshotCounters;
  /** 已练习时长（毫秒，**不含离开页面的时间**） */
  elapsedMs: number;
}

export interface BuildSnapshotInput {
  modeKind: string;
  params: Record<string, string | number | boolean | string[]>;
  seed: number;
  completed: number;
  /** 当前题已输入的键（文章模式的全部进度） */
  inputKeys: string[];
  counters: SnapshotCounters;
  elapsedMs: number;
  now: number;
}

/**
 * 字符串数组的长度上限。
 * 文章可以很长（整篇可打字数 × 编码长度），所以给得宽松；
 * 但必须有上限 —— 否则一份被写坏的文件能把 localStorage 塞爆。
 */
const MAX_KEY_COUNT = 50_000;

/** 键列表：数组、每个元素都是单个字符、长度有界 */
function isKeyList(v: unknown): v is string[] {
  return Array.isArray(v)
    && v.length <= MAX_KEY_COUNT
    && v.every((k) => typeof k === 'string' && k.length === 1);
}

/** 判断是否为可恢复的模式 */
export function isRestorableKind(kind: string): kind is RestorableKind {
  return (RESTORABLE_KINDS as readonly string[]).includes(kind);
}

/**
 * 构造快照。
 *
 * 模式不可恢复时返回 `null` —— 调用方据此决定「不写快照」，
 * 而不是写一份将来恢复不了的垃圾。
 */
export function buildSnapshot(input: BuildSnapshotInput): PracticeSnapshot | null {
  if (!isRestorableKind(input.modeKind)) return null;
  if (!Number.isFinite(input.seed) || !Number.isFinite(input.elapsedMs)) return null;
  if (!Number.isInteger(input.completed) || input.completed < 0) return null;
  if (!isKeyList(input.inputKeys)) return null;

  return {
    version: SNAPSHOT_VERSION,
    savedAt: input.now,
    modeKind: input.modeKind,
    params: input.params,
    seed: input.seed >>> 0,
    completed: input.completed,
    inputKeys: [...input.inputKeys],
    counters: input.counters,
    elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
  };
}

export function serializeSnapshot(snapshot: PracticeSnapshot): string {
  return JSON.stringify(snapshot);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 参数值只允许原始类型（或字符串数组）：恢复时要能原样喂给 buildSource */
function isParamValue(v: unknown): v is string | number | boolean | string[] {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return true;
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isCounters(v: unknown): v is SnapshotCounters {
  if (!isPlainObject(v)) return false;

  const numbers = [
    'completedCount', 'totalKeystrokes', 'errorKeystrokes',
    'correctCharCount', 'wrongQuestionCount', 'maxCombo',
  ];
  if (!numbers.every((k) => typeof v[k] === 'number' && Number.isFinite(v[k]))) return false;

  const stringLists = ['wrongChars', 'attemptedChars', 'wrongKeys'];
  if (!stringLists.every(
    (k) => Array.isArray(v[k]) && (v[k] as unknown[]).every((x) => typeof x === 'string'),
  )) return false;

  /*
   * keyErrors 必须一起带上：易混字根分析（成绩页）靠它出数据。
   * 漏掉不会崩，只会让刷新过的会话给出**偏少的错误配对**——
   * 数据看起来正常，却是不全的，这类「静默失真」最难发现。
   */
  const keyErrors = v.keyErrors;
  return Array.isArray(keyErrors) && keyErrors.every((e) => (
    isPlainObject(e) && typeof e.expected === 'string' && typeof e.actual === 'string'
  ));
}

/**
 * 解析并校验快照；任何一项不合法都返回 `null`。
 *
 * 校验从严的理由：这份数据来自 localStorage，可能被用户改过、被旧版本写过、
 * 被并发页签写坏。**一个字段越界就能让恢复出来的会话错乱**（比如 completed
 * 大于总题数），而那时界面看起来是正常的 —— 宁可当作没有，重新开始。
 */
export function parseSnapshot(raw: string | null, now: number): PracticeSnapshot | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) return null;

  // 版本不符：直接丢弃。不做「尽力兼容」—— 旧字段的含义可能已经变了
  if (parsed.version !== SNAPSHOT_VERSION) return null;

  if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return null;
  if (now - parsed.savedAt > SNAPSHOT_TTL_MS) return null;
  // 时钟回拨（savedAt 在未来）：同样不可信，丢弃
  if (parsed.savedAt - now > 60_000) return null;

  if (typeof parsed.modeKind !== 'string' || !isRestorableKind(parsed.modeKind)) return null;

  if (typeof parsed.seed !== 'number' || !Number.isFinite(parsed.seed)) return null;
  if (!Number.isInteger(parsed.completed) || (parsed.completed as number) < 0) return null;

  if (typeof parsed.elapsedMs !== 'number' || !Number.isFinite(parsed.elapsedMs)) return null;
  if ((parsed.elapsedMs as number) < 0) return null;

  if (!isCounters(parsed.counters)) return null;

  /*
   * inputKeys 缺失即判无效，而不是「当作空」——
   * 空与缺失在文章模式下完全是两回事：空 = 从头开始，缺失 = 这份快照
   * 是旧版本写的，恢复它等于悄悄把用户的文章进度抹掉。
   * 宁可丢弃快照、正常开新一轮，也不要给一个「看着恢复了其实归零」的结果。
   */
  if (!isKeyList(parsed.inputKeys)) return null;

  if (!isPlainObject(parsed.params)) return null;
  const params: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of Object.entries(parsed.params)) {
    if (!isParamValue(value)) return null;
    params[key] = value;
  }

  return {
    version: SNAPSHOT_VERSION,
    savedAt: parsed.savedAt,
    modeKind: parsed.modeKind,
    params,
    seed: (parsed.seed as number) >>> 0,
    completed: parsed.completed as number,
    inputKeys: parsed.inputKeys,
    counters: parsed.counters,
    elapsedMs: parsed.elapsedMs as number,
  };
}

/** 供 UI 展示「上次练到哪儿了」时使用；与持久化无关，故不放进快照结构 */
export function isSnapshotExpired(snapshot: PracticeSnapshot, now: number): boolean {
  return now - snapshot.savedAt > SNAPSHOT_TTL_MS;
}
