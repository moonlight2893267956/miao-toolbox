/**
 * 文章练习的「当前位置」解析。
 *
 * 从整篇 token 列表 + 已输入编码推出焦点条要展示的东西：
 * 当前字、下一个字、本字编码进度。
 *
 * 抽成纯函数是因为这段逻辑的边界最容易错：整篇文章的编码被摊平成一维
 * 序列，每个字符占据 [start, end) 区间，`totalTyped` 落在哪个区间就是
 * 「正在打哪个字」。差一位就会出现「打完一个字后焦点条跳到下一个字」
 * 或者「最后一个字打完后焦点条空掉」这类问题，而这些在界面上只是
 * 一闪而过，很难靠肉眼发现。
 */

import type { ArticleToken } from './articleTokenizer';

export interface ArticleSpan {
  token: ArticleToken;
  /** 该字符在整篇编码中的起始位；不可打字符为 -1 */
  start: number;
  /** 结束位（不含）；不可打字符为 -1 */
  end: number;
}

export interface ArticleCursor {
  /** 每个字符的编码区间（含不可打字符，便于正文按序渲染） */
  spans: ArticleSpan[];
  /** 当前正在输入的字符；整篇打完时为 null */
  current: ArticleSpan | null;
  /** 当前字之后第一个可打字符（预览用） */
  next: ArticleSpan | null;
  /** 当前字已输入的编码（按输入顺序原样返回） */
  typedCodes: string[];
  /** 当前字编码总长度 */
  codeTotal: number;
  /** 当前字已输入位数 */
  codeTyped: number;
  /** 整篇可打编码总数 */
  totalKeys: number;
}

/**
 * @param tokens 整篇分词结果
 * @param inputKeys 已输入的编码（整篇顺序）
 */
export function resolveArticleCursor(
  tokens: ArticleToken[],
  inputKeys: string[],
): ArticleCursor {
  const spans: ArticleSpan[] = [];
  let cursor = 0;

  for (const token of tokens) {
    if (token.isCodable && token.code) {
      const start = cursor;
      const end = start + token.code.length;
      spans.push({ token, start, end });
      cursor = end;
    } else {
      spans.push({ token, start: -1, end: -1 });
    }
  }

  const totalKeys = cursor;
  const totalTyped = inputKeys.length;

  // 半开区间：totalTyped === end 时该字已打完，焦点应落到下一个字
  const current = spans.find(
    (s) => s.start >= 0 && totalTyped >= s.start && totalTyped < s.end,
  ) ?? null;

  const next = current
    ? spans.find((s) => s.start >= current.end) ?? null
    : null;

  return {
    spans,
    current,
    next,
    typedCodes: current ? inputKeys.slice(current.start, totalTyped) : [],
    codeTotal: current ? current.end - current.start : 0,
    codeTyped: current ? totalTyped - current.start : 0,
    totalKeys,
  };
}
