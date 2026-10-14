/**
 * 词组取码讲解 —— 「这个词组为什么这么取码」的上下文打包与后校验。
 *
 * ── 与单字（aiExplain.ts）同构，差别只有三处 ──
 *
 * 1. 事实里多一层**来源**：这一位取自哪个字的第几码。
 *    词组最需要讲清的就是这件事（「编码」为什么是 xy + dc 而不是整字），
 *    所以每一位都带上 `fromChar / charIndex / charCodeIndex`。
 * 2. 每一位的候选字根来自**来源字**：用 `splitChar(来源字, 该字全码)` 取它前
 *    `take` 位的候选，而不是拿词组本身去拆（词组没有拆字这回事）。
 * 3. 词表码与按规则推导的码**可能不一致**：词表对极少数词有特殊收录
 *    （见 phraseCompose 的实测：15704 条里 3 条不符，如「踊跃」表录 kckt）。
 *    两个码都带上，让模型如实说明「以词表为准」，而不是把例外说成规则。
 *
 * ── 纪律与单字完全一致 ──
 *
 * 事实由算法算好（取码规则、每一位的键与候选字根），模型的发挥空间被限制在
 * 候选集内；结构化断言（逐位 key / radical）过核对才允许展示，散文只作展示。
 * 能被机器判定的才校验 —— 这条边界不因为「词组更长」而放宽。
 */

import { pickSuggestions, pickString, tryParseJsonObject } from '../../../../../services/aiStreamParse';
import { pickAgentOutput, type ExplainValidation, type WubiExplainResult } from './aiExplain';
import type { SplitResult } from './splitter';
import type { PhraseComposition } from './phraseCompose';

// ─── 请求 / 响应类型 ──────────────────────────────────────

/** 词级的一位取码：键、来源字、该字第几码、该键的候选字根 */
export interface WubiPhrasePosition {
  index: number;
  key: string;
  /** 这一位取自哪个字（由取码规则决定，不是模型说的） */
  fromChar: string;
  /** 来源字在词组里的位置（0 起） */
  charIndex: number;
  /** 这一位是该字的第几码（0 起） */
  charCodeIndex: number;
  /** 该键上的候选字根（模型只能从这里挑） */
  candidates: { glyph: string; name: string }[];
  /** 取码规则中的角色（键名码 / 首笔 / 识别码 / 补位 …），无则省略 */
  role?: string;
  /** 算法能确定的字根（仅「字根本身等于该字」时存在） */
  certain?: string;
}

/**
 * 发给 agent 的词级输入。
 *
 * `char` 与单字同名字段 —— 它是**锚点文本**，后端（`WubiAiService`）与追问接口
 * 都按 `char` 承载锚点，会话与元数据也按它归类；`phrase` 只是同一段文本的
 * 词级语义别名，agent 侧读到哪个都行。
 */
export interface WubiPhraseExplainParams {
  task: 'explain-phrase';
  char: string;
  phrase: string;
  /** 词表收录码 */
  code: string;
  /** 规则名，如「二字词 · 每字取前 2 码」 */
  ruleLabel: string;
  /** 按规则推导的码；有字未收录时为 null */
  derivedCode: string | null;
  /** 推导码与词表码是否一致（不一致要如实说明，不能把例外说成规则） */
  matchesTable: boolean;
  positions: WubiPhrasePosition[];
  /** 规则下不取码的中间字 */
  skippedChars: string[];
  notes: { type: string; message: string }[];
}

/** 模型的结构化断言（词级）：逐位键 + 字根，可选回填来源字 */
export interface WubiPhraseClaim {
  key: string;
  /** 字根；该位无候选时（补位）为 null */
  radical: string | null;
  /** 模型自报的来源字（可选）：给了就必须与事实一致 */
  fromChar?: string | null;
}

export interface WubiPhraseExplainResult {
  explanation: string | null;
  positions: WubiPhraseClaim[] | null;
  suggestions: string[] | null;
  model: string | null;
  traceId: string | null;
  validation: ExplainValidation | null;
  error?: string | null;
  selfCheck?: WubiExplainResult['selfCheck'];
}

// ─── 上下文打包 ──────────────────────────────────────────

/** 取来源字某一位的段（键对不上时按位序兜底：segments 与编码位一一对应） */
function segmentAt(split: SplitResult, index: number) {
  return split.segments[index] ?? null;
}

/**
 * 由词组取码推导构造模型输入。
 *
 * @param comp `composePhrase` 的结果（逐字全码 / 取几码 / 推导码 / 词表码）
 * @param splitOf 取某字全码的拆分结果（默认 `splitChar`，测试可注入）
 * @returns 至少有一位可取码位时返回参数；一位都给不出（如全词未收录）时返回 null
 */
export function buildPhraseExplainContext(
  comp: PhraseComposition,
  splitOf: (char: string, code: string) => SplitResult,
): WubiPhraseExplainParams | null {
  const positions: WubiPhrasePosition[] = [];
  const skippedChars: string[] = [];
  const notes: { type: string; message: string }[] = [];

  comp.parts.forEach((part, charIndex) => {
    if (part.take === 0) {
      skippedChars.push(part.char);
      return;
    }
    if (!part.fullCode) {
      // 未收录：不编造候选，如实说明这一位给不出来
      notes.push({
        type: 'phraseMissing',
        message: `「${part.char}」不在单字码表里，它在本词组里的取码位无法给出候选`,
      });
      return;
    }

    const split = splitOf(part.char, part.fullCode);
    // 全码短于规则要求的位数时只取到多少算多少（与 composePhrase 的 taken 一致）
    const take = Math.min(part.take, part.fullCode.length);

    for (let charCodeIndex = 0; charCodeIndex < take; charCodeIndex++) {
      const key = part.fullCode[charCodeIndex];
      const seg = segmentAt(split, charCodeIndex);
      positions.push({
        index: positions.length,
        key,
        fromChar: part.char,
        charIndex,
        charCodeIndex,
        candidates: (seg?.candidates ?? []).map((r) => ({ glyph: r.glyph, name: r.name })),
        role: seg?.role,
        certain: seg?.certain?.glyph,
      });
    }
  });

  if (positions.length === 0) return null;

  if (comp.missingChars.length > 0) {
    notes.push({
      type: 'phraseMissing',
      message: `词表里查不到这些字的单字编码：${comp.missingChars.join('、')}`,
    });
  }
  if (comp.shortParts) {
    notes.push({
      type: 'phraseShort',
      message: '有字的全码短于规则要求的位数，这一位的候选按实际存在的码位给出',
    });
  }
  if (comp.skipped > 0) {
    notes.push({
      type: 'phraseSkipped',
      message: `${comp.ruleLabel}：${skippedChars.join('、')} 在本规则下不取码`,
    });
  }
  if (comp.derivedCode !== null && !comp.matchesTable) {
    notes.push({
      type: 'phraseTableMismatch',
      message: `词表收录为 ${comp.tableCode}，按规则推导应为 ${comp.derivedCode}`
        + '（词表对极少数词有特殊收录，讲解要以词表为准，别把例外说成规则）',
    });
  }

  return {
    task: 'explain-phrase',
    char: comp.phrase,
    phrase: comp.phrase,
    code: comp.tableCode,
    ruleLabel: comp.ruleLabel,
    derivedCode: comp.derivedCode,
    matchesTable: comp.matchesTable,
    positions,
    skippedChars,
    notes,
  };
}

// ─── 后校验 ──────────────────────────────────────────────

/**
 * 校验模型的结构化断言是否落在算法给出的候选集内。
 *
 * 四条：
 * 1. 位数与**取码位**数一致；
 * 2. 第 i 位的 key 必须等于事实里的键（键是权威，模型不得改写）；
 * 3. 模型若回填了来源字，必须与规则算出的来源字一致（把「从哪个字取的」讲错，
 *    整个讲解就是错的）；不回填则不判违规 —— 来源本身由 UI 按事实渲染，
 *    这一条是**额外**的可核对断言，不是展示的前提；
 * 4. 第 i 位的 radical 必须在该位候选里；该位无候选（补位）时不许给字根。
 *
 * 任一条不过 → `ok: false`，调用方应当退回确定性视图。
 */
export function validatePhraseExplainResult(
  positions: WubiPhraseClaim[] | null,
  params: WubiPhraseExplainParams,
): ExplainValidation | null {
  if (!positions || positions.length === 0) return null;

  const violations: string[] = [];

  if (positions.length !== params.positions.length) {
    violations.push(
      `位数不符：这个词组有 ${params.positions.length} 位取码位，模型给了 ${positions.length} 位`,
    );
  }

  positions.forEach((pos, i) => {
    const expected = params.positions[i];
    if (!expected) return;

    if (pos.key !== expected.key) {
      violations.push(`第 ${i + 1} 位键位不符：应为 ${expected.key}，模型给了 ${pos.key}`);
      return; // 键都不对，字根无需再比
    }

    if (pos.fromChar != null && pos.fromChar !== expected.fromChar) {
      violations.push(
        `第 ${i + 1} 位来源字不符：应取自「${expected.fromChar}」的第 ${expected.charCodeIndex + 1} 码，`
        + `模型说是「${pos.fromChar}」`,
      );
    }

    const where = `「${expected.fromChar}」第 ${expected.charCodeIndex + 1} 码（${expected.key} 键）`;
    const allowed = expected.candidates;

    if (allowed.length === 0) {
      if (pos.radical) {
        violations.push(`第 ${i + 1} 位在${where}上没有可选字根，不应给出字根，模型给了「${pos.radical}」`);
      }
      return;
    }

    if (!pos.radical || !allowed.some((c) => c.glyph === pos.radical)) {
      const glyphs = allowed.map((c) => c.glyph).join('/');
      violations.push(
        `第 ${i + 1} 位字根「${pos.radical ?? ''}」不在${where}的候选里（${glyphs}）`,
      );
    }
  });

  return { ok: violations.length === 0, violations };
}

// ─── 结果解析 ────────────────────────────────────────────

/** 从 output 取 positions；形状不对时返回 null（而不是塞进半个对象） */
function parsePhrasePositions(
  output: Record<string, unknown> | null,
): WubiPhraseClaim[] | null {
  const raw = output?.positions;
  if (!Array.isArray(raw)) return null;

  const out: WubiPhraseClaim[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const { key, radical, from_char: fromChar } = item as Record<string, unknown>;
    if (typeof key !== 'string') return null;
    // 识别码／补位位 radical 可以是 null 或空串，但类型必须能读懂
    if (radical !== null && radical !== undefined && typeof radical !== 'string') return null;
    const normalized = typeof radical === 'string' && radical.length > 0 ? radical : null;
    out.push({
      key,
      radical: normalized,
      fromChar: typeof fromChar === 'string' ? fromChar : null,
    });
  }
  return out.length > 0 ? out : null;
}

function parsePhraseSelfCheck(
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
 * 解析 agent 返回（同步接口，`data` 是后端原样透传的 agent 输出）。
 *
 * 与单字同一条路径：JSON 优先、正则兜底；`output` 包装层由 `pickAgentOutput` 解开。
 */
export function parseWubiPhraseExplainResult(
  raw: unknown,
  params: WubiPhraseExplainParams,
  traceId?: string,
): WubiPhraseExplainResult {
  const output = pickAgentOutput(raw);
  const fallbackText = typeof raw === 'string' ? raw : '';

  const explanation = pickString(output, fallbackText, 'explanation');
  const suggestions = pickSuggestions(output, fallbackText);
  const positions = parsePhrasePositions(output);

  /*
   * trace_id 既可能在外层（后端/SSE 的包装）也可能在 agent 返回值里。
   * 只看解开包装后的对象会漏掉外层那个 —— 而排查一次失败讲解时，
   * trace id 正是唯一能把前端、后端、agent 三处日志串起来的键。
   */
  let resolvedTraceId = traceId ?? null;
  if (!resolvedTraceId) {
    const outer = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
    const value = outer?.trace_id ?? output?.trace_id;
    if (value != null) resolvedTraceId = String(value);
  }

  return {
    explanation,
    positions,
    suggestions,
    model: pickString(output, fallbackText, 'model'),
    traceId: resolvedTraceId,
    validation: validatePhraseExplainResult(positions, params),
    error: pickString(output, fallbackText, 'error'),
    selfCheck: parsePhraseSelfCheck(output),
  };
}

/** 解析 JSON 字符串形式的结果（与单字路径同一处调用形态） */
export function parseWubiPhraseExplainJson(
  json: string,
  params: WubiPhraseExplainParams,
  traceId?: string,
): WubiPhraseExplainResult {
  return parseWubiPhraseExplainResult(tryParseJsonObject(json) ?? json, params, traceId);
}

/**
 * 校验通过、可以展示的词级解释。
 *
 * 与 `isExplanationDisplayable` 同义，只是断言形状不同（radical 允许 null）。
 */
export function isPhraseExplanationDisplayable(
  result: WubiPhraseExplainResult | null,
): boolean {
  if (!result?.explanation) return false;
  return result.validation?.ok === true;
}

// ─── 展示用：逐位来源标注 ─────────────────────────────────

/** 一位的来源说明，如「第 1 位（『编』第 1 码）」 */
export function phraseOriginLabel(params: WubiPhraseExplainParams, index: number): string | null {
  const pos = params.positions[index];
  if (!pos) return null;
  return `第 ${index + 1} 位（「${pos.fromChar}」第 ${pos.charCodeIndex + 1} 码）`;
}

/** 全部取码位两两成组的来源行，如 `编 xy + 码 dc`（供 UI 展示事实） */
export function phraseOriginGroups(
  params: WubiPhraseExplainParams,
): { char: string; code: string; charIndex: number; startIndex: number }[] {
  const groups: { char: string; code: string; charIndex: number; startIndex: number }[] = [];

  for (const pos of params.positions) {
    const last = groups[groups.length - 1];
    if (last && last.charIndex === pos.charIndex) {
      last.code += pos.key;
      continue;
    }
    groups.push({ char: pos.fromChar, code: pos.key, charIndex: pos.charIndex, startIndex: pos.index });
  }

  return groups;
}
