/**
 * 词组取码讲解（查码 Tab 用）。
 *
 * ── 86 版五笔的词组取码规则 ──
 *
 *   2 字：每字取前 2 码              汉语 = ic + yg = icyg
 *   3 字：前两字各取第 1 码，末字取前 2 码   中国人 = k + l + ww = klww
 *   4 字：每字取第 1 码              中国人民 = k + l + w + n = klwn
 *  ≥5 字：第 1、2、3 字各取第 1 码 + 末字第 1 码   中华人民共和国 = k + w + w + l = kwwl
 *
 * ── 为什么是「推导 + 并列」，而不是「断言规则正确」──
 *
 * 对本模块词表（15704 条）实测符合率 99.98%：
 *   桶2 10552/10558、桶3 3021/3024、桶4+ 2118/2122（共 3 条不符）。
 * 那 3 条是词表自身的特殊收录（如「踊跃」表录 kckt、按规则应为 khkh）。
 *
 * 所以本模块只**算出推导码**，把「词表码」原样带上，由 UI 并列展示：
 * 一致就确认规则，不一致就如实说明 —— 学员照着练的是词表，
 * 把例外说成「规则」等于教错东西。
 */

import type { CharMap } from './code';

// ─── 规则 ────────────────────────────────────────────────

/**
 * 按词长给出「每个字取几码」。
 *
 * 长度与返回数组等长；0 表示该字在本规则下不取码（多字词的中间字）。
 * 词长 < 2 不属于词组，返回空数组由调用方跳过。
 */
export function takesForLength(length: number): number[] {
  if (length < 2) return [];
  if (length === 2) return [2, 2];
  if (length === 3) return [1, 1, 2];
  if (length === 4) return [1, 1, 1, 1];
  // ≥5：前三字各 1 码 + 末字 1 码，中间字不取码
  return [...Array(3).fill(1), ...Array(length - 4).fill(0), 1];
}

/** 规则名（用于讲解行的小标题） */
export function ruleLabelFor(length: number): string {
  if (length === 2) return '二字词 · 每字取前 2 码';
  if (length === 3) return '三字词 · 前两字首码 + 末字前 2 码';
  if (length === 4) return '四字词 · 每字首码';
  if (length >= 5) return '多字词 · 前三字首码 + 末字首码';
  return '';
}

// ─── 讲解结果 ────────────────────────────────────────────

export interface ComposePart {
  /** 该字 */
  char: string;
  /** 该字全码；未收录为 null */
  fullCode: string | null;
  /** 规则要求取几码（0 = 本词不取该字） */
  take: number;
  /** 实际取到的码（`fullCode` 的前 `take` 位；未收录或 take=0 时为空串） */
  taken: string;
}

export interface PhraseComposition {
  phrase: string;
  length: number;
  /** 规则名，如「二字词 · 每字取前 2 码」 */
  ruleLabel: string;
  /** 逐字取码明细（含不取码的字，便于完整展示词面） */
  parts: ComposePart[];
  /** 本规则下不取码的字有几个（多字词的中间字） */
  skipped: number;
  /** 按规则推出的编码；有字未收录时为 null */
  derivedCode: string | null;
  /** 词表里收录的编码 */
  tableCode: string;
  /** 推导与词表是否一致（`derivedCode` 为 null 时恒为 false） */
  matchesTable: boolean;
  /** 词表未收录的字（无法推导的原因） */
  missingChars: string[];
  /** 是否有字的码长不足规则要求的位数（此时推导码不足 4 位） */
  shortParts: boolean;
}

/**
 * 推导一个词组的编码构成。
 *
 * @param phrase 词组原文（仅用于取每个字，调用方保证 ≥2 字）
 * @param tableCode 词表里收录的编码（原样带出，用于比对）
 * @param charMap 单字码表
 */
export function composePhrase(
  phrase: string,
  tableCode: string,
  charMap: CharMap,
): PhraseComposition {
  const chars = Array.from(phrase);
  const takes = takesForLength(chars.length);

  const parts: ComposePart[] = chars.map((char, i) => {
    const take = takes[i] ?? 0;
    const fullCode = charMap.get(char)?.code ?? null;
    // 码长不足时只能取到多少算多少：宁可显示短一截，也不要凭空补位
    const taken = fullCode && take > 0 ? fullCode.slice(0, take) : '';
    return { char, fullCode, take, taken };
  });

  const missingChars = parts
    .filter((p) => p.fullCode === null)
    .map((p) => p.char);

  const shortParts = parts.some(
    (p) => p.take > 0 && p.fullCode !== null && p.fullCode.length < p.take,
  );

  const derivedCode = missingChars.length === 0
    ? parts.map((p) => p.taken).join('')
    : null;

  return {
    phrase,
    length: chars.length,
    ruleLabel: ruleLabelFor(chars.length),
    parts,
    skipped: parts.filter((p) => p.take === 0).length,
    derivedCode,
    tableCode,
    matchesTable: derivedCode !== null && derivedCode === tableCode,
    missingChars,
    shortParts,
  };
}
