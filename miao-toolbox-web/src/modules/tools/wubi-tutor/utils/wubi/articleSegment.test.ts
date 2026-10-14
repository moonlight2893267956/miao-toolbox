/**
 * 长文分段单测。
 *
 * 最重要的一条是「拼起来必须逐 token 等于原文分词结果」——
 * 分段丢字是这类切分最危险的 bug：用户打到某个位置就卡住，且几乎无法复现。
 */

import { describe, it, expect } from 'vitest';
import { tokenizeArticle, type ArticleToken } from './articleTokenizer';
import {
  segmentArticleTokens,
  shouldSegment,
  DEFAULT_SEGMENT_MAX_CHARS,
  type ArticleSegment,
} from './articleSegment';
import { buildCharMap, type CharMap } from './code';

const CHAR_MAP: CharMap = buildCharMap([
  ['中', 'khk', 1],
  ['国', 'lgyi', 1, 'l'],
  ['你', 'wqiy', 1, 'wq'],
  ['好', 'vbg', 1, 'vb'],
  ['人', 'wwww', 1, 'w'],
  ['民', 'yeva', 2, 'ye'],
]);

function tokensOf(text: string): ArticleToken[] {
  return tokenizeArticle(text, CHAR_MAP);
}

/** 各段拼起来是否逐 token 严格等于原文（分段的不变式） */
function assertNoTokenLost(segments: ArticleSegment[], original: ArticleToken[]): void {
  const rejoined = segments.flatMap((s) => s.tokens);
  expect(
    rejoined.map((t) => t.char).join(''),
    '分段后再拼接必须与原文完全一致',
  ).toBe(original.map((t) => t.char).join(''));
  expect(rejoined).toHaveLength(original.length);
}

describe('shouldSegment', () => {
  it('未传上限 / 上限 <= 0 时不分段', () => {
    expect(shouldSegment(999, undefined)).toBe(false);
    expect(shouldSegment(999, 0)).toBe(false);
    expect(shouldSegment(999, -5)).toBe(false);
  });

  it('可打字数未超上限时不分段（等号也不分）', () => {
    expect(shouldSegment(100, 100)).toBe(false);
    expect(shouldSegment(101, 100)).toBe(true);
  });

  it('默认段长为正数', () => {
    expect(DEFAULT_SEGMENT_MAX_CHARS).toBeGreaterThan(0);
  });
});

describe('segmentArticleTokens', () => {
  it('空文本返回空数组', () => {
    expect(segmentArticleTokens([], 10)).toEqual([]);
  });

  it('未超上限 → 整篇一段，且一个 token 都不少', () => {
    const tokens = tokensOf('中国你好。');
    const segments = segmentArticleTokens(tokens, 100);

    expect(segments).toHaveLength(1);
    expect(segments[0].codableCount).toBe(4);
    assertNoTokenLost(segments, tokens);
  });

  it('上限 <= 0 时同样返回整篇一段', () => {
    const tokens = tokensOf('中国你好。');
    const segments = segmentArticleTokens(tokens, 0);
    expect(segments).toHaveLength(1);
    assertNoTokenLost(segments, tokens);
  });

  it('长文切段后 token 一个都不丢（核心不变式）', () => {
    const text = '中国你好。'.repeat(30); // 150 token / 120 可打字
    const tokens = tokensOf(text);
    const segments = segmentArticleTokens(tokens, 40);

    expect(segments.length).toBeGreaterThan(1);
    assertNoTokenLost(segments, tokens);
    // 段序号必须连续
    expect(segments.map((s) => s.index)).toEqual(segments.map((_, i) => i));
    // 没有空段
    for (const s of segments) {
      expect(s.tokens.length).toBeGreaterThan(0);
    }
  });

  it('各段可打字数不超过上限 + 断句余量', () => {
    const text = '中国你好。'.repeat(30);
    const segments = segmentArticleTokens(tokensOf(text), 40);
    const slack = Math.max(8, Math.floor(40 * 0.6));

    for (const s of segments) {
      expect(s.codableCount).toBeLessThanOrEqual(40 + slack);
    }
  });

  it('优先在句末标点之后断开（标点留在上一段末尾）', () => {
    // 每句 4 个可打字字 + 1 个句号；上限 8 → 应在第 2 句的句号后断
    const tokens = tokensOf('中国好人。你好中国。人中国好，中国人好。');
    const segments = segmentArticleTokens(tokens, 8);

    expect(segments.length).toBeGreaterThan(1);
    assertNoTokenLost(segments, tokens);

    // 除最后一段外，每段都应以句末标点收尾
    for (const s of segments.slice(0, -1)) {
      const last = s.tokens[s.tokens.length - 1];
      expect(last.char, `段未以句末标点收尾，而是「${last.char}」`).toBe('。');
    }
  });

  it('完全没有句末标点时按 token 边界硬切，也不丢字', () => {
    const tokens = tokensOf('中国好人中国人民'); // 12 个可打字字，无标点
    const segments = segmentArticleTokens(tokens, 5);

    expect(segments.length).toBeGreaterThan(1);
    assertNoTokenLost(segments, tokens);
    // 硬切时每段可打字数应当贴着上限（不靠余量）
    for (const s of segments) {
      expect(s.codableCount).toBeLessThanOrEqual(5);
    }
  });

  it('标点不单独成段，也不计入 codableCount', () => {
    const tokens = tokensOf('中国。');
    const segments = segmentArticleTokens(tokens, 2);

    expect(segments).toHaveLength(1);
    expect(segments[0].tokens.map((t) => t.char).join('')).toBe('中国。');
    expect(segments[0].codableCount).toBe(2);
  });

  it('缺码字计入段内 token 但不计入 codableCount', () => {
    // 「淼」不在 CHAR_MAP 里 → uncodable
    const tokens = tokensOf('中国淼好');
    expect(tokens.filter((t) => t.kind === 'uncodable')).toHaveLength(1);

    const segments = segmentArticleTokens(tokens, 100);
    expect(segments).toHaveLength(1);
    expect(segments[0].codableCount).toBe(3);
    expect(segments[0].tokens).toHaveLength(4);
  });

  it('单个超长句也能切（超过 slack 时退回硬切）', () => {
    const text = '中国好人中国人民你好中国'.repeat(4);
    const tokens = tokensOf(text);
    const segments = segmentArticleTokens(tokens, 10);

    assertNoTokenLost(segments, tokens);
    expect(segments.length).toBeGreaterThan(1);
  });
});