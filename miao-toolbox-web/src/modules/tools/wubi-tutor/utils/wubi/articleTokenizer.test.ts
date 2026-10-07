/**
 * 文章分词器单测
 */

import { describe, it, expect } from 'vitest';
import {
  tokenizeArticle,
  tokenizeArticleWithStats,
  stripEmptyLines,
  validateCustomText,
} from './articleTokenizer';
import { buildCharMap, type CharMap } from './code';

const CHAR_MAP: CharMap = buildCharMap([
  ['中', 'k', 1], ['国', 'l', 1], ['你', 'wq', 2], ['好', 'vb', 2],
  ['是', 'j', 1], ['的', 'r', 1], ['一', 'g', 1],
]);

describe('tokenizeArticle', () => {
  it('可打字符标记 isCodable', () => {
    const tokens = tokenizeArticle('中国', CHAR_MAP);
    expect(tokens).toHaveLength(2);
    expect(tokens[0].isCodable).toBe(true);
    expect(tokens[0].char).toBe('中');
    expect(tokens[0].code).toBe('k');
    expect(tokens[1].isCodable).toBe(true);
  });

  it('标点被标记为 punctuation 且不可打', () => {
    const tokens = tokenizeArticle('中，国', CHAR_MAP);
    const punct = tokens.find((t) => t.char === '，');
    expect(punct).toBeDefined();
    expect(punct!.kind).toBe('punctuation');
    expect(punct!.isCodable).toBe(false);
  });

  it('空白被标记为 whitespace', () => {
    const tokens = tokenizeArticle('中 国', CHAR_MAP);
    const ws = tokens.find((t) => t.char === ' ');
    expect(ws).toBeDefined();
    expect(ws!.kind).toBe('whitespace');
  });

  it('无编码汉字标记为 uncodable', () => {
    const tokens = tokenizeArticle('中龘国', CHAR_MAP);
    const uncodable = tokens.find((t) => t.char === '龘');
    expect(uncodable).toBeDefined();
    expect(uncodable!.kind).toBe('uncodable');
    expect(uncodable!.isCodable).toBe(false);
  });

  it('保留原文索引', () => {
    const tokens = tokenizeArticle('中国', CHAR_MAP);
    expect(tokens[0].index).toBe(0);
    expect(tokens[1].index).toBe(1);
  });

  it('全角标点识别', () => {
    const tokens = tokenizeArticle('。！？；：', CHAR_MAP);
    expect(tokens.every((t) => t.kind === 'punctuation')).toBe(true);
  });

  it('半角标点识别', () => {
    const tokens = tokenizeArticle('.,!?;:', CHAR_MAP);
    expect(tokens.every((t) => t.kind === 'punctuation')).toBe(true);
  });

  it('空文本返回空数组', () => {
    expect(tokenizeArticle('', CHAR_MAP)).toHaveLength(0);
  });
});

describe('tokenizeArticleWithStats', () => {
  it('正确统计可打与跳过数量', () => {
    const result = tokenizeArticleWithStats('中国，你好！', CHAR_MAP);

    expect(result.codableCount).toBe(4);   // 中国你好
    expect(result.skippedCount).toBe(2);   // ，！
    expect(result.tokens).toHaveLength(6);
  });

  it('收集无编码汉字列表', () => {
    const result = tokenizeArticleWithStats('中龘国', CHAR_MAP);
    expect(result.uncodableChars).toContain('龘');
  });

  it('标点不计入 uncodableChars', () => {
    const result = tokenizeArticleWithStats('中，国', CHAR_MAP);
    expect(result.uncodableChars).toHaveLength(0);
  });

  it('全可打时 skippedCount 为 0', () => {
    const result = tokenizeArticleWithStats('中国', CHAR_MAP);
    expect(result.skippedCount).toBe(0);
    expect(result.codableCount).toBe(2);
  });

  it('全不可打时 codableCount 为 0', () => {
    const result = tokenizeArticleWithStats('，！？', CHAR_MAP);
    expect(result.codableCount).toBe(0);
    expect(result.skippedCount).toBe(3);
  });
});

describe('stripEmptyLines', () => {
  it('移除空行', () => {
    expect(stripEmptyLines('第一行\n\n第二行')).toBe('第一行\n第二行');
  });

  it('移除全空白行', () => {
    expect(stripEmptyLines('第一行\n   \n第二行')).toBe('第一行\n第二行');
  });

  it('保留单行', () => {
    expect(stripEmptyLines('只有一行')).toBe('只有一行');
  });

  it('全空文本返回空串', () => {
    expect(stripEmptyLines('\n\n  \n')).toBe('');
  });
});

describe('validateCustomText', () => {
  it('正常文本通过', () => {
    expect(validateCustomText('中国你好')).toEqual({ ok: true });
  });

  it('空文本被拒绝', () => {
    const result = validateCustomText('');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('文本为空');
  });

  it('全空白文本被拒绝', () => {
    const result = validateCustomText('\n\n   \n');
    expect(result.ok).toBe(false);
  });

  it('超过 5000 字被拒绝', () => {
    const longText = '中'.repeat(5001);
    const result = validateCustomText(longText);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('5000');
  });

  it('正好 5000 字通过', () => {
    const text = '中'.repeat(5000);
    expect(validateCustomText(text)).toEqual({ ok: true });
  });
});
