/**
 * 文章分词器
 *
 * 将文章文本切分为可打字符与跳过字符。
 * 无编码字符（标点/数字/生僻字）渲染为「跳过」态，不计入可打序列也不判错。
 */

import type { CharMap } from './code';

// ─── 类型定义 ────────────────────────────────────────────

export type TokenKind = 'char' | 'punctuation' | 'whitespace' | 'uncodable';

export interface ArticleToken {
  /** 字符 */
  char: string;
  /** 类别 */
  kind: TokenKind;
  /** 是否可打（有编码且非空白） */
  isCodable: boolean;
  /** 在原文中的索引 */
  index: number;
  /** 该字符的五笔编码（若可打） */
  code?: string;
}

export interface TokenizeResult {
  tokens: ArticleToken[];
  /** 可打字符数 */
  codableCount: number;
  /** 跳过字符数 */
  skippedCount: number;
  /** 无法编码的字符列表（去重） */
  uncodableChars: string[];
}

// ─── 字符分类 ────────────────────────────────────────────

/** 判断是否为空白字符 */
function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

/** 判断是否为标点符号（中英文） */
function isPunctuation(ch: string): boolean {
  return /[\u3000-\u303F\uFF00-\uFFEF!-/:-@[-`{-~]/.test(ch);
}

/** 判断是否为中日韩统一表意文字 */
function isCJK(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||    // CJK 基本区
    (code >= 0x3400 && code <= 0x4dbf) ||    // 扩展 A
    (code >= 0xf900 && code <= 0xfaff)       // 兼容表意
  );
}

// ─── 主函数 ──────────────────────────────────────────────

/**
 * 文章分词。
 *
 * 分类规则：
 * - 有编码的汉字 → 'char'，isCodable = true
 * - 标点符号 → 'punctuation'，isCodable = false
 * - 空白 → 'whitespace'，isCodable = false
 * - 无编码的汉字 → 'uncodable'，isCodable = false
 *
 * @param text 文章文本
 * @param charMap 字编码映射
 * @returns 分词结果
 */
export function tokenizeArticle(text: string, charMap: CharMap): ArticleToken[] {
  const result = tokenizeArticleWithStats(text, charMap);
  return result.tokens;
}

/**
 * 文章分词（带统计信息）。
 */
export function tokenizeArticleWithStats(text: string, charMap: CharMap): TokenizeResult {
  const chars = Array.from(text);
  const tokens: ArticleToken[] = [];
  const uncodableSet = new Set<string>();
  let codableCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (isWhitespace(ch)) {
      tokens.push({ char: ch, kind: 'whitespace', isCodable: false, index: i });
      skippedCount++;
      continue;
    }

    if (isPunctuation(ch)) {
      tokens.push({ char: ch, kind: 'punctuation', isCodable: false, index: i });
      skippedCount++;
      continue;
    }

    const entry = charMap.get(ch);
    if (entry) {
      tokens.push({
        char: ch,
        kind: 'char',
        isCodable: true,
        index: i,
        code: entry.code,
      });
      codableCount++;
    } else {
      tokens.push({ char: ch, kind: 'uncodable', isCodable: false, index: i });
      skippedCount++;
      if (isCJK(ch)) uncodableSet.add(ch);
    }
  }

  return {
    tokens,
    codableCount,
    skippedCount,
    uncodableChars: Array.from(uncodableSet),
  };
}

/**
 * 过滤掉空白行（用于自定义文本导入）。
 */
export function stripEmptyLines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/**
 * 校验自定义文本长度（上限 5000 字）。
 */
export function validateCustomText(text: string): { ok: true } | { ok: false; error: string } {
  const cleaned = stripEmptyLines(text);
  if (cleaned.length === 0) {
    return { ok: false, error: '文本为空，请粘贴中文内容' };
  }
  if (cleaned.length > 5000) {
    return { ok: false, error: `文本超过 5000 字上限（当前 ${cleaned.length} 字）` };
  }
  return { ok: true };
}
