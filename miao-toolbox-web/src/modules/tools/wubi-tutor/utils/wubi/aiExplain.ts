/**
 * 「这个字为什么这么拆」—— AI 解释的**上下文打包**与**后校验**。
 *
 * ── 定位：AI 只讲已知事实，不产生事实 ──
 *
 * 练习室手里握着模型不知道的确定数据：这个字的编码、每个码位对应哪个键、
 * 该键上有哪些字根、用户刚才把哪个键按成了哪个键。AI 的活儿是**把这些串成人话**。
 *
 * 所以这里不把「拆分」交给模型去发明，而是：
 * 1. `buildExplainContext` 把算法已经算出的候选集打包成输入 ——
 *    模型的发挥空间被**限制在候选集内**；
 * 2. `validateExplainResult` 校验模型的结构化断言是否落在候选集内 ——
 *    落在外面就判失败，由 UI 退回确定性视图。
 *
 * !! 为什么校验的是「结构化字段」而不是散文 !!
 *
 * 单个汉字的字根字形（如「一」「日」）会作为普通词出现在散文里
 * （「一般」「日期」）。若拿散文去匹配字形，必然大量误报 —— 误报会让
 * 好答案被丢弃，比不校验更糟。
 * 因此要求模型把断言放进结构化字段（每一位的 key / radical），
 * 散文只作为展示。**能被机器判定的部分才校验**，这条边界要守住。
 *
 * 模型契约（后端 wubi-explainer agent 需按此返回）：
 * ```json
 * {
 *   "explanation": "……",
 *   "positions": [{ "key": "j", "radical": "日" }, ...],
 *   "suggestions": ["……"]
 * }
 * ```
 */

import {
  cleanStreamText,
  pickString,
  pickSuggestions,
  tryParseJsonObject,
} from '../../../../../services/aiStreamParse';
import type { SplitResult } from './splitter';
import type { KeyError } from './session';

// ─── 请求 / 响应类型 ──────────────────────────────────────

/**
 * 发给 agent 的输入。
 *
 * 刻意**只带算法已算出的东西**：带编码、带每一位的键与该键的候选字根、
 * 带用户的实际错误。模型因此无法说出一个不在该键上的字根。
 */
export interface WubiExplainParams {
  task: 'explain-split';
  char: string;
  code: string;
  /** 逐位：这一位是哪个键，该键上有哪些候选字根（含名称） */
  positions: {
    index: number;
    key: string;
    /** 取码规则中的角色（键名码 / 首笔 / 识别码 / 补位 …），无则省略 */
    role?: string;
    candidates: { glyph: string; name: string }[];
    /** 算法能确定的字根（仅「字根本身等于该字」时存在） */
    certain?: string;
  }[];
  /** 已有的标注（键名字 / 成字字根 / 识别码 / 简码）*/
  notes: { type: string; message: string }[];
  /** 用户这次的错误（可选）：期望键 → 实际键 */
  error?: { expected: string; actual: string };
}

/** 模型的结构化断言，正是要被校验的部分 */
export interface WubiExplainPosition {
  key: string;
  radical: string;
}

/**
 * 「逐位候选」的最小形状：单字（`WubiExplainParams`）与词组
 * （`WubiPhraseExplainParams`）的首轮参数都满足它。
 *
 * 追问链路上的纯函数（差异比对、候选核对、改位构造）只需要 `code` 与
 * `positions`，按这个形状收参就能让两种锚点共用同一套判定 —— 否则词组要复制
 * 一份「追问可信度」逻辑，两份迟早会走歪。
 */
export interface PositionsParamsLike {
  code: string;
  positions: {
    key: string;
    candidates: { glyph: string; name: string }[];
  }[];
}

export interface WubiExplainResult {
  explanation: string | null;
  positions: WubiExplainPosition[] | null;
  suggestions: string[] | null;
  model: string | null;
  traceId: string | null;
  /** 后校验结果；`null` 表示模型没给结构化断言（无从校验） */
  validation: ExplainValidation | null;
  /**
   * agent 自报的错误（如「模型未配置」「自校验未通过」「输入不合法」）。
   *
   * !! 必须带出来，不能丢 !!
   * agent 侧失败时（模型没能在候选里挑对、输出不是合法 JSON、依赖没装好），
   * 它会把自己的原因放在这里返回。丢掉的话前端只剩一句「没通过与字根表的核对」——
   * 用户既不知道是模型答错还是服务没配好，我也无从排查。
   */
  error?: string | null;
  /** agent 的自校验明细（含 violations 列表，是调提示词的一手依据） */
  selfCheck?: { ok?: boolean; attempts?: number; violations?: string[] } | null;
}

export interface ExplainValidation {
  ok: boolean;
  /** 人类可读的违规说明（用于日志与 UI 提示，不直接展示给用户） */
  violations: string[];
}

// ─── 上下文打包 ──────────────────────────────────────────

/**
 * 由拆字结果构造模型输入。
 *
 * 候选字根**原样带上全部**，不做预筛 —— 预筛会把「模型的判断力」变成
 * 「我们的判断力」，而挑字根本来就是算法做不到的那一步。
 */
export function buildExplainContext(
  split: SplitResult,
  error?: KeyError,
): WubiExplainParams {
  return {
    task: 'explain-split',
    char: split.char,
    code: split.code,
    positions: split.segments.map((seg, index) => ({
      index,
      key: seg.key,
      role: seg.role,
      candidates: seg.candidates.map((r) => ({ glyph: r.glyph, name: r.name })),
      certain: seg.certain?.glyph,
    })),
    notes: split.notes.map((n) => ({ type: n.type, message: n.message })),
    error: error ? { expected: error.expected, actual: error.actual } : undefined,
  };
}

// ─── 后校验 ──────────────────────────────────────────────

/**
 * 校验模型的结构化断言是否落在算法给出的候选集内。
 *
 * 三条：
 * 1. 位数与编码位数一致；
 * 2. 第 i 位的 key 必须等于编码第 i 位（编码是权威，模型不得改写）；
 * 3. 第 i 位的 radical 必须在该位的候选字根里（补位位为空数组，不许给字根）。
 *
 * 任一条不过 → `ok: false`，调用方应当**退回确定性视图**，
 * 而不是把没校验通过的解释展示给用户。
 */
export function validateExplainResult(
  positions: WubiExplainPosition[] | null,
  params: WubiExplainParams,
): ExplainValidation | null {
  if (!positions || positions.length === 0) return null;

  const violations: string[] = [];
  const codeChars = params.code.split('');

  if (positions.length !== codeChars.length) {
    violations.push(`位数不符：编码 ${codeChars.length} 位，模型给了 ${positions.length} 位`);
  }

  positions.forEach((pos, i) => {
    const expectedKey = codeChars[i];
    if (expectedKey === undefined) return;

    if (pos.key !== expectedKey) {
      violations.push(`第 ${i + 1} 位键位不符：应为 ${expectedKey}，模型给了 ${pos.key}`);
      return; // 键都不对，字根无需再比
    }

    const allowed = params.positions[i]?.candidates ?? [];
    // 补位位候选为空：该键不代表任何字根，给字根即为编造
    if (allowed.length === 0) {
      violations.push(`第 ${i + 1} 位是补位，不应给出字根，模型给了「${pos.radical}」`);
      return;
    }

    if (!allowed.some((c) => c.glyph === pos.radical)) {
      const glyphs = allowed.map((c) => c.glyph).join('/');
      violations.push(
        `第 ${i + 1} 位字根「${pos.radical}」不在 ${expectedKey} 键的候选里（${glyphs}）`,
      );
    }
  });

  return { ok: violations.length === 0, violations };
}

// ─── 结果解析（交给 useSignedAiStream） ───────────────────

/**
 * 解析流式累积文本。
 * 与 Cron / 正则两个工具同一套：JSON 优先、正则兜底。
 */
export function parseWubiExplainResult(
  full: string,
  params: WubiExplainParams,
  traceId?: string,
): WubiExplainResult {
  const clean = cleanStreamText(full);
  const output = unwrapOutput(tryParseJsonObject(clean));

  const explanation = pickString(output, clean, 'explanation');
  const suggestions = pickSuggestions(output, clean);
  const model = pickString(output, clean, 'model');

  let resolvedTraceId = traceId ?? null;
  if (!resolvedTraceId && output?.trace_id) resolvedTraceId = String(output.trace_id);

  const positions = parsePositions(output);

  return {
    explanation,
    positions,
    suggestions,
    model,
    traceId: resolvedTraceId,
    validation: validateExplainResult(positions, params),
    error: pickString(output, clean, 'error'),
    selfCheck: parseSelfCheck(output),
  };
}

/** 取 agent 的自校验明细；形状不对就当没有（不因此影响主流程） */
function parseSelfCheck(
  output: Record<string, unknown> | null,
): WubiExplainResult['selfCheck'] {
  const raw = output?.self_check;
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;
  const violations = Array.isArray(obj.violations) ? obj.violations.map(String) : undefined;

  return {
    ok: typeof obj.ok === 'boolean' ? obj.ok : undefined,
    attempts: typeof obj.attempts === 'number' ? obj.attempts : undefined,
    violations,
  };
}

/**
 * 解开可能存在的 `output` 包装层。
 *
 * 平台把 agent 的返回值放进 SSE 的 `output` 事件，而 `useSignedAiStream` 收到
 * `output` 事件时会把**整个 payload** 序列化进累积文本 —— 于是这里拿到的可能是
 * `{ output: {…agent 返回值…}, trace_id }`，而不是 agent 的返回值本身。
 *
 * 两种形状都要吃得下：只认一种的话，解释会**永远解析不出来而且失败得很安静**
 * （不报错，只是判定为不可展示，看起来像「模型没给结构化断言」）。
 */
function unwrapOutput(obj: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!obj) return null;
  const inner = obj.output;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return obj;
}

/** 从 output 取 positions；形状不对时返回 null（而不是塞进半个对象） */
function parsePositions(
  output: Record<string, unknown> | null,
): WubiExplainPosition[] | null {
  const raw = output?.positions;
  if (!Array.isArray(raw)) return null;

  const out: WubiExplainPosition[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const { key, radical } = item as Record<string, unknown>;
    if (typeof key !== 'string' || typeof radical !== 'string') return null;
    out.push({ key, radical });
  }
  return out.length > 0 ? out : null;
}

/**
 * 校验通过、可以展示的解释。
 *
 * 把「能不能展示」这条判断收成一个函数，UI 不必自己拼条件 ——
 * 少一处手写条件就少一处「忘了校验就直接渲染」的机会。
 */
export function isExplanationDisplayable(result: WubiExplainResult | null): boolean {
  if (!result?.explanation) return false;
  // 没有结构化断言时不展示：无从校验等于给了模型自由发挥的空间
  return result.validation?.ok === true;
}

// ─── 追问轮：把 agent 的富结构解析成可渲染的一轮 ──────────
//
// 首轮（拆字讲解）沿用上面的 parseWubiExplainResult；追问轮则是另一套形状：
// agent 在 followup.py 里给出了 kind / accepted / citations / new_claims /
// position_revisions，并在讲解正文里把这些拼成了人话。
//
// !! 为什么追问轮不能复用 isExplanationDisplayable !!
//
// 那条判断要求「positions 每一位都有 key 与 radical」。但**识别码位**在 agent
// 的 positions 里 radical 为 null（识别码不是字根），于是整轮会被判为不可展示 ——
// 而追问轮本来就不该靠 positions 判定可信度：它的可信度来自「有没有可核对的引用」
// 与「修正主张是否落在候选集内」。这两条都是能被机器判定的，所以照旧只承认它们。

/** agent 的追问类型（对应 wubi/followup.py 的 followup.kind） */
export type FollowupKind = 'reasoned' | 'why' | 'revise' | 'unknown';

/**
 * 一轮的可信度判定。
 *
 * - `ok`         —— 有可核对的依据，或结论来自本会话已核实的事实
 * - `unverified` —— 没能核对（模型没给引用、本轮只是澄清、正文为空）
 * - `failed`     —— 核对不通过（修正主张落在候选集外）：结论必须标成不可信
 */
export type TurnVerification = 'ok' | 'unverified' | 'failed';

/** 追问轮里的位次修正（「不对，第 2 位应该是土」） */
export interface ExplainRevision {
  /** 0 起的位序 */
  index: number;
  /** 该位的键位（来自首轮参数，取不到时为 null） */
  key: string | null;
  /** 上一轮的结论（可能是字根，也可能是 null＝识别码/未确定） */
  from: string | null;
  /** 本轮主张的字根 */
  to: string;
  /** 该位的候选字根（用于展示与前端独立核对） */
  candidates: string[];
}

/** 解析后的追问轮 */
export interface ExplainTurnPayload {
  kind: FollowupKind;
  /** 讲解正文（失败时为空） */
  text: string;
  /** 可核对的引用出处，形如「第 1 轮 positions[0].reason」 */
  citations: string[];
  /** 超出历史事实、未经交叉核验的断言 */
  newClaims: string[];
  /** 位次修正（仅 revise 轮有） */
  revision: ExplainRevision | null;
  /**
   * 本轮结论的逐位字根（agent 回传的 positions；取不到为 null）。
   *
   * 它是**下一轮做差异对比的基准**：模型路径下的改位不会带
   * `followup.accepted/glyph`，只有 positions 变了 —— 没有它就无法把
   * 「第 2 位从刀改成了九」这件事显示成对照。
   */
  positions: (string | null)[] | null;
  /** revise 轮是否被采纳 */
  accepted: boolean | null;
  /** 本轮结论基于第几轮 */
  basedOnTurn: number | null;
  /** 模型不可用，走了确定性降级回答 */
  fallback: boolean;
  /** agent 是否真的回答了（false = 只做了澄清/要求补充） */
  answered: boolean;
  /** agent 自报的说明性错误（如「第 3 位候选里没有土」） */
  error: string | null;
  verification: TurnVerification;
}

/** 取某一位的候选字根；位序越界返回空数组（不抛） */
export function candidatesFor(params: PositionsParamsLike, index: number): string[] {
  return params.positions[index]?.candidates.map((c) => c.glyph) ?? [];
}

/**
 * 解开可能的 `output` 包装层，返回 agent 的输出对象。
 *
 * 与 `unwrapOutput` 同一件事，但入参可能是任意形状（后端包装、SSE payload、
 * agent 原样输出），所以这里多兜一层类型判断。
 */
export function pickAgentOutput(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return unwrapOutput(raw as Record<string, unknown>);
}

/**
 * 解析一轮追问。入参 `raw` 可以是 agent 输出，也可以是被 output 包了一层的结果。
 *
 * @param prevPositions 上一轮结论的逐位字根（线程里的当前位置）。
 *   **模型路径的改位只能靠它比出来**：agent 在 `followup` 里只给
 *   kind=reasoned，改没改位全在 `positions` 的差异上。
 */
export function parseFollowupTurn(
  raw: unknown,
  params: PositionsParamsLike,
  prevPositions: (string | null)[] = [],
): ExplainTurnPayload {
  const output = pickAgentOutput(raw);
  const followup = asRecord(output?.followup);

  const kind = normalizeKind(followup?.kind);
  const text = typeof output?.explanation === 'string' ? output.explanation.trim() : '';
  const citations = toStringArray(output?.citations);
  const newClaims = toStringArray(output?.new_claims);
  const answered = followup?.answered !== false;
  const fallback = followup?.fallback === true;
  const accepted = typeof followup?.accepted === 'boolean' ? followup.accepted : null;
  const basedOnTurn = toNumber(followup?.based_on_turn);
  const rawError = typeof output?.error === 'string' ? output.error.trim() : '';
  const positions = parsePositionRadicals(output?.positions, params);

  // 显式修正（确定性路径）优先；否则用 positions 的差异推出改位（模型路径）
  const revision =
    buildRevision(followup, params) ?? diffRevision(positions, prevPositions, params);

  return {
    kind,
    text,
    citations,
    newClaims,
    revision,
    positions,
    accepted,
    basedOnTurn,
    fallback,
    answered,
    error: rawError || null,
    verification: verifyTurn({ kind, text, citations, accepted, revision, answered, fallback }),
  };
}

/**
 * 取 agent 返回的逐位字根。
 *
 * 识别码位的 `radical` 为 null（识别码不是字根），这是正常的；
 * 位数与编码不符时判为不可用（宁可没有基准，也不要错位的基准）。
 */
function parsePositionRadicals(
  raw: unknown,
  params: PositionsParamsLike,
): (string | null)[] | null {
  /*
   * 基准是**取码位数**（positions 的项数），不是 code 的字符数：词组里某个字的
   * 全码短于规则要求的位数时（phraseCompose 的 shortParts），取码位会比词表码短 ——
   * 拿 code.length 比会把这种词组的追问基准整体判为不可用。
   */
  if (!Array.isArray(raw) || raw.length !== params.positions.length) return null;
  return raw.map((item) => {
    const record = asRecord(item);
    const radical = record?.radical;
    return typeof radical === 'string' && radical ? radical : null;
  });
}

/**
 * 由「上一轮 vs 本轮」的逐位差异推出改位。
 *
 * 只认**第一处**变化：一轮里改两位是极罕见且难以在界面上并排说清的，
 * 而多报会让用户以为改了很多处。首处变化之外的内容仍在正文里。
 */
function diffRevision(
  next: (string | null)[] | null,
  prev: (string | null)[],
  params: PositionsParamsLike,
): ExplainRevision | null {
  if (!next) return null;
  for (let i = 0; i < next.length; i += 1) {
    const to = next[i];
    const from = prev[i] ?? null;
    if (to && to !== from) {
      return {
        index: i,
        key: params.positions[i]?.key ?? null,
        from,
        to,
        candidates: candidatesFor(params, i),
      };
    }
  }
  return null;
}

/**
 * 可信度判定表（尽量只用能被机器判定的条件）：
 *
 * | 情形 | 判定 | 理由 |
 * |---|---|---|
 * | 正文为空 / agent 说没回答 | unverified | 没有可承认的结论 |
 * | 改位后的字根不在该位候选中 | failed | 主张越出候选集，无论谁提的都不能信 |
 * | revise + accepted | ok / failed | 主张的字根是否在该位候选集内，可核 |
 * | revise + 被拒 | ok | 拒绝迁就候选集之外的主张，是正确行为 |
 * | reasoned | 有引用 ok，无引用 unverified | 引用必须能指回历史字段 |
 * | why | ok | 结论直接来自本会话已核实的首轮事实 |
 * | fallback（确定性降级） | ok | agent 明确说明未新增任何事实 |
 */
export function verifyTurn(input: {
  kind: FollowupKind;
  text: string;
  citations: string[];
  accepted: boolean | null;
  revision: ExplainRevision | null;
  answered: boolean;
  fallback: boolean;
}): TurnVerification {
  if (!input.answered || !input.text) return 'unverified';
  if (input.fallback) return 'ok';
  if (input.revision && !input.revision.candidates.includes(input.revision.to)) {
    // 被拒的修正不带这个判定：拒绝迁就候选集之外的主张本身是正确行为
    return input.accepted === false ? 'ok' : 'failed';
  }

  if (input.kind === 'revise') {
    if (input.accepted !== true) return 'ok';
    if (!input.revision) return 'failed';
    return input.revision.candidates.includes(input.revision.to) ? 'ok' : 'failed';
  }
  if (input.kind === 'reasoned') {
    return input.citations.length > 0 ? 'ok' : 'unverified';
  }
  if (input.kind === 'why') return 'ok';
  return 'unverified';
}

function buildRevision(
  followup: Record<string, unknown> | null,
  params: PositionsParamsLike,
): ExplainRevision | null {
  if (!followup) return null;
  const index = toNumber(followup.index);
  const glyph = typeof followup.glyph === 'string' ? followup.glyph : '';
  if (index === null || index < 0 || !glyph) return null;

  const from = typeof followup.previous_radical === 'string' ? followup.previous_radical : null;
  return {
    index,
    key: params.positions[index]?.key ?? null,
    from,
    to: glyph,
    candidates: candidatesFor(params, index),
  };
}

function normalizeKind(value: unknown): FollowupKind {
  return value === 'reasoned' || value === 'why' || value === 'revise' || value === 'unknown'
    ? value
    : 'reasoned';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
