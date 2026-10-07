import { describe, it, expect } from 'vitest';
import { composePhrase, takesForLength, ruleLabelFor } from './phraseCompose';
import { buildCharMap } from './code';

/**
 * 取码讲解的单测。
 *
 * 用**合成码表**（甲=abcd 之类），而不是真实码表：
 * 这里要锁的是「规则怎么取码」，与具体某个字的编码无关 ——
 * 后者属于数据正确性，已由词表符合率实测覆盖（见 phraseCompose.ts 文件头）。
 */
const CHAR_MAP = buildCharMap([
  ['甲', 'abcd', 1, 'a'],
  ['乙', 'efgh', 2, 'ef'],
  ['丙', 'ijkl', 3, 'ijk'],
  ['丁', 'mnop', 0],
  ['戊', 'qr', 0],      // 码长只有 2：用来测「码长不足」
]);

describe('takesForLength — 五笔词组取码位数', () => {
  it('二字词：每字 2 码', () => {
    expect(takesForLength(2)).toEqual([2, 2]);
  });

  it('三字词：前两字各 1 码，末字 2 码', () => {
    expect(takesForLength(3)).toEqual([1, 1, 2]);
  });

  it('四字词：每字 1 码', () => {
    expect(takesForLength(4)).toEqual([1, 1, 1, 1]);
  });

  it('五字及以上：前三字各 1 码 + 末字 1 码，中间字不取码', () => {
    expect(takesForLength(5)).toEqual([1, 1, 1, 0, 1]);
    expect(takesForLength(6)).toEqual([1, 1, 1, 0, 0, 1]);
    expect(takesForLength(8)).toEqual([1, 1, 1, 0, 0, 0, 0, 1]);
  });

  it('任何词长的取码总位数都是 4', () => {
    for (const len of [2, 3, 4, 5, 6, 8]) {
      expect(takesForLength(len).reduce((a, b) => a + b, 0)).toBe(4);
    }
  });

  it('少于 2 字不算词组，返回空', () => {
    expect(takesForLength(1)).toEqual([]);
    expect(takesForLength(0)).toEqual([]);
  });
});

describe('ruleLabelFor — 规则名', () => {
  it('各词长都有对应说明', () => {
    expect(ruleLabelFor(2)).toContain('每字取前 2 码');
    expect(ruleLabelFor(3)).toContain('末字前 2 码');
    expect(ruleLabelFor(4)).toContain('每字首码');
    expect(ruleLabelFor(5)).toContain('末字首码');
  });

  it('不支持的词长返回空串（调用方据此不渲染）', () => {
    expect(ruleLabelFor(1)).toBe('');
  });
});

describe('composePhrase — 逐字取码', () => {
  it('二字词：甲 ab + 乙 ef', () => {
    const c = composePhrase('甲乙', 'abef', CHAR_MAP);
    expect(c.derivedCode).toBe('abef');
    expect(c.matchesTable).toBe(true);
    expect(c.parts.map((p) => p.taken)).toEqual(['ab', 'ef']);
    expect(c.parts.map((p) => p.fullCode)).toEqual(['abcd', 'efgh']);
  });

  it('三字词：甲 a + 乙 e + 丙 ij', () => {
    const c = composePhrase('甲乙丙', 'aeij', CHAR_MAP);
    expect(c.derivedCode).toBe('aeij');
    expect(c.matchesTable).toBe(true);
  });

  it('四字词：四字各取首码', () => {
    const c = composePhrase('甲乙丙丁', 'aeim', CHAR_MAP);
    expect(c.derivedCode).toBe('aeim');
    expect(c.parts.map((p) => p.take)).toEqual([1, 1, 1, 1]);
  });

  it('多字词：中间字不取码，并统计出来供界面说明', () => {
    const c = composePhrase('甲乙丙丁甲丁', 'aein', CHAR_MAP);
    // 甲 a + 乙 e + 丙 i + 末字（丁）m
    expect(c.derivedCode).toBe('aeim');
    expect(c.skipped).toBe(2);
    // 不取码的字仍保留在 parts 里（界面要展示完整词面）
    expect(c.parts).toHaveLength(6);
    expect(c.parts.map((p) => p.take)).toEqual([1, 1, 1, 0, 0, 1]);
  });

  it('推导与词表不一致时如实并列，不硬说成规则', () => {
    const c = composePhrase('甲乙', 'zzzz', CHAR_MAP);
    expect(c.derivedCode).toBe('abef');
    expect(c.matchesTable).toBe(false);
    // 词表码原样带出，供界面显示「词表收录为 …」
    expect(c.tableCode).toBe('zzzz');
  });

  it('有字未收录 → 不推导，并列出缺字', () => {
    const c = composePhrase('甲龍', 'abcd', CHAR_MAP);
    expect(c.derivedCode).toBeNull();
    expect(c.matchesTable).toBe(false);
    expect(c.missingChars).toEqual(['龍']);
  });

  it('某字码长不足时只取到多少算多少，绝不凭空补位', () => {
    // 戊 的全码只有 2 位（qr），二字词要求每字取 2 码 —— 恰好够；
    // 用三字词让末字取 2 码，戊 够用；真正不够的是「要求 2 位但只有 1 位」的情况
    const shortMap = buildCharMap([['甲', 'abcd', 0], ['戊', 'q', 0]]);
    const c = composePhrase('甲戊', 'abq', shortMap);
    expect(c.shortParts).toBe(true);
    // 关键：推导码只有 3 位，而不是补成 4 位
    expect(c.derivedCode).toBe('abq');
    expect(c.derivedCode).toHaveLength(3);
  });
});
