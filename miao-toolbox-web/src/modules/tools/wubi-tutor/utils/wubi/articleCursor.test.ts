/**
 * 文章练习「当前位置」解析单测。
 *
 * 重点覆盖区间边界：整篇编码被摊平成一维序列，`totalTyped` 落在哪个
 * 字符的 [start, end) 里就是「正在打哪个字」。差一位的症状是
 * 「打完一个字后焦点条仍停在这个字」或「最后一个字打完后焦点条空掉」，
 * 在界面上只是一闪而过，肉眼很难抓到。
 */

import { describe, it, expect } from 'vitest';
import { resolveArticleCursor } from './articleCursor';
import type { ArticleToken } from './articleTokenizer';

/** 可打字符 */
const han = (char: string, code: string, index = 0): ArticleToken => ({
  char, kind: 'char', isCodable: true, index, code,
});

/** 不可打字符（标点 / 空白） */
const punct = (char: string, index = 0): ArticleToken => ({
  char, kind: 'punctuation', isCodable: false, index,
});

describe('resolveArticleCursor', () => {
  it('按可打字符累加区间，不可打字符不占位', () => {
    // 中(khk,3) ，(不可打) 国(lgyi,4)
    const tokens = [han('中', 'khk', 0), punct('，', 1), han('国', 'lgyi', 2)];
    const { spans, totalKeys } = resolveArticleCursor(tokens, []);

    expect(totalKeys).toBe(7);
    expect(spans[0]).toMatchObject({ start: 0, end: 3 });
    expect(spans[1]).toMatchObject({ start: -1, end: -1 }); // 标点不占位
    expect(spans[2]).toMatchObject({ start: 3, end: 7 });
  });

  it('定位当前字与下一个字', () => {
    const tokens = [han('中', 'khk', 0), han('国', 'lgyi', 1), han('人', 'wwww', 2)];

    // 第 0~2 位属于「中」
    const atStart = resolveArticleCursor(tokens, []);
    expect(atStart.current?.token.char).toBe('中');
    expect(atStart.next?.token.char).toBe('国');
    expect(atStart.codeTyped).toBe(0);
    expect(atStart.codeTotal).toBe(3);

    const mid = resolveArticleCursor(tokens, ['k', 'h']);
    expect(mid.current?.token.char).toBe('中');
    expect(mid.codeTyped).toBe(2);

    // 第 3 位开始属于「国」——边界必须右移一位，否则焦点会停在「中」
    const boundary = resolveArticleCursor(tokens, ['k', 'h', 'k']);
    expect(boundary.current?.token.char).toBe('国');
    expect(boundary.codeTyped).toBe(0);
    expect(boundary.next?.token.char).toBe('人');
  });

  it('typedCodes 只取当前字的那一段', () => {
    const tokens = [han('中', 'khk', 0), han('国', 'lgyi', 1)];

    const { typedCodes, codeTyped } = resolveArticleCursor(
      tokens,
      ['k', 'h', 'k', 'l', 'g'], // 「中」打满 + 「国」打了 2 位
    );

    expect(codeTyped).toBe(2);
    expect(typedCodes).toEqual(['l', 'g']); // 不含「中」的 k h k
  });

  it('整篇打完后 current 为 null（焦点条应隐藏）', () => {
    const tokens = [han('中', 'khk', 0), han('国', 'lgyi', 1)];

    const done = resolveArticleCursor(tokens, ['k', 'h', 'k', 'l', 'g', 'y', 'i']);
    expect(done.current).toBeNull();
    expect(done.next).toBeNull();
    expect(done.typedCodes).toEqual([]);
    expect(done.codeTotal).toBe(0);
  });

  it('最后一个字进行中时 next 为 null（没有可预览的下一个字）', () => {
    const tokens = [han('中', 'khk', 0), han('国', 'lgyi', 1)];

    const last = resolveArticleCursor(tokens, ['k', 'h', 'k', 'l']);
    expect(last.current?.token.char).toBe('国');
    expect(last.next).toBeNull();
  });

  it('空文章不崩溃', () => {
    const empty = resolveArticleCursor([], []);
    expect(empty.totalKeys).toBe(0);
    expect(empty.current).toBeNull();
    expect(empty.next).toBeNull();
  });

  it('全部由不可打字符组成时不产生当前字', () => {
    const onlyPunct = resolveArticleCursor([punct('，'), punct('。')], []);
    expect(onlyPunct.totalKeys).toBe(0);
    expect(onlyPunct.current).toBeNull();
  });
});
