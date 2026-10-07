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
