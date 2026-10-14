/**
 * 长文分段。
 *
 * ── 为什么需要 ──
 *
 * 文章模式原先是「整篇 = 一道题」，于是：
 *   · 一篇 5000 字的自定义文本必须一口气打完，中间无法中断；
 *   · 中途退出后整篇作废，续做只能从第一个字重来。
 *
 * 分段之后，长文被切成若干「读完一段就结算」的短题，
 * 中断点落在段边界上，复用现成的 `INTERRUPTED_SESSION_KEY` 续打机制即可。
 *
 * ── 切分规则（按优先级）──
 *
 * 1. 优先在**句末标点**后断开 —— 绝不把一句话劈成两半；
 * 2. 单句本身超长时退化为按字数硬切，但**只在 token 边界切**：
 *    切半个字会让 `answerKeys` 与 `tokens` 错位，症状是「打到后面全错」；
 * 3. 纯标点 / 空白 token 跟随所在段，不单独成段，也不计入字数。
 *
 * ── 一个不变式（测试会守住）───
 *
 * 所有段拼起来必须**逐 token 等于**原文分词结果 —— 一个字都不能丢。
 * 丢字是这类切分最危险的 bug：用户会打到某个位置就卡住，且极难复现。
 */

import type { ArticleToken } from './articleTokenizer';

/** 默认段长（可打字数）。短于此则整篇不分段。 */
export const DEFAULT_SEGMENT_MAX_CHARS = 120;

/** 优先在这些标点之后断句 */
export const DEFAULT_SENTENCE_ENDERS = '。！？；…';

export interface ArticleSegment {
  /** 段序号，0 起 */
  index: number;
  /** 该段的全部 token（含标点与空白，保证正文可读） */
  tokens: ArticleToken[];
  /** 该段可打字数 */
  codableCount: number;
}

export interface SegmentOptions {
  /** 单段可打字数上限；短于此则不分段 */
  maxCharsPerSegment: number;
  /** 优先在这些标点后断句，默认 '。！？；…' */
  sentenceEnders?: string;
}

/**
 * 把 token 序列切成若干段。
 *
 * 复杂度 O(n)：单趟扫描 + 每个断点一次小范围回看。
 *
 * @param tokens 原文分词结果（`tokenizeArticle` 的输出）
 * @param maxCharsPerSegment 单段可打字数上限；<= 0 视为不分段
 */
export function segmentArticleTokens(
  tokens: ArticleToken[],
  maxCharsPerSegment: number,
  sentenceEnders: string = DEFAULT_SENTENCE_ENDERS,
): ArticleSegment[] {
  if (tokens.length === 0) return [];
  if (maxCharsPerSegment <= 0) {
    return [{ index: 0, tokens: [...tokens], codableCount: countCodable(tokens) }];
  }

  /*
   * 先标记「可以断在这里」的位置。
   * 标记点是**句末标点之后**（index = 该标点下标 + 1），
   * 这样标点留在上一段的末尾，读起来才自然。
   */
  const enders = new Set(Array.from(sentenceEnders));
  const breakAfter = new Set<number>();
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.kind === 'punctuation' && enders.has(t.char)) breakAfter.add(i + 1);
  }

  const segments: ArticleSegment[] = [];
  let start = 0;
  let codable = 0;
  /*
   * 允许超出上限的比例：宁可多等半句，也不要为了凑整数把句子劈开。
   * 1.6 倍 ≈ 「再等一个短句」的量级。
   */
  const slack = Math.max(8, Math.floor(maxCharsPerSegment * 0.6));

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.isCodable) codable += 1;

    if (codable < maxCharsPerSegment) continue;

    // 已达上限：先找最近的句末标点断点（不超出 slack 才用）
    let cut = -1;
    for (let j = i + 1; j <= i + slack && j < tokens.length; j += 1) {
      if (breakAfter.has(j)) {
        cut = j;
        break;
      }
    }
    // 没找到合适的句末，就在当前 token 之后硬切（token 边界，绝不切半个字）
    if (cut === -1) cut = i + 1;

    /*
     * 把切点之后**紧跟的非可打 token** 吸收进本段。
     *
     * 少了这一步，「中国。」在上限 2 时会被切成「中国」+「。」两段 ——
     * 标点单独成段，读起来像丢了东西；而按定义，句末标点属于它前面的句子。
     * 只吸收紧邻的一段，不会把整篇标点吞进同一段。
     */
    while (cut < tokens.length && !tokens[cut].isCodable) cut += 1;

    segments.push(makeSegment(tokens, start, cut, segments.length));
    start = cut;
    // 重新统计新段已有的可打字数（cut 与 i 之间可能已包含若干字）
    codable = 0;
    for (let j = cut; j <= i; j += 1) {
      if (tokens[j].isCodable) codable += 1;
    }
    // i 已被划入上一段，从下一枚 token 重新累计
    i = cut - 1;
  }

  if (start < tokens.length) {
    segments.push(makeSegment(tokens, start, tokens.length, segments.length));
  }

  // 防御：理论上不会出现空段，但作者字段被改动时不该让下游拿到空数组
  return segments.filter((s) => s.tokens.length > 0);
}

function countCodable(tokens: ArticleToken[]): number {
  let n = 0;
  for (const t of tokens) if (t.isCodable) n += 1;
  return n;
}

function makeSegment(
  tokens: ArticleToken[],
  from: number,
  to: number,
  index: number,
): ArticleSegment {
  const slice = tokens.slice(from, to);
  return { index, tokens: slice, codableCount: countCodable(slice) };
}

/**
 * 决定一篇文本要不要分段。
 *
 * 抽出来是为了让「不分段」这条路径只有一处判定：
 * 题源里如果写成 `maxCharsPerSegment && ...` 这种写法，
 * 阈值语义会散落在两个文件里，改阈值时容易漏改一处。
 */
export function shouldSegment(codableChars: number, maxCharsPerSegment?: number): boolean {
  if (!maxCharsPerSegment || maxCharsPerSegment <= 0) return false;
  return codableChars > maxCharsPerSegment;
}