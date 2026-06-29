/**
 * JSON 智能容错修复
 *
 * 处理 6 种常见 JSON 语法错误：
 * 1. 单引号 → 双引号
 * 2. 尾随逗号移除
 * 3. // 行注释移除
 * 4. /* *‍/ 块注释移除
 * 5. 未引用的 key 加双引号
 * 6. 布尔值/null 大小写修复
 *
 * 修复是纯文本操作，不依赖 AST。
 * 修复后必须通过 JSON.parse 验证，否则返回错误。
 */

import type { RepairAction, RepairResult } from '../types';

// ─── 修复规则 ──────────────────────────────────────────

/** 移除 // 行注释 */
function removeLineComments(input: string): { result: string; count: number } {
  let count = 0;
  const lines = input.split('\n');
  const result = lines.map((line) => {
    // 在字符串外的 // 才是注释
    const commentIdx = findCommentStart(line);
    if (commentIdx >= 0) {
      count++;
      return line.slice(0, commentIdx).trimEnd();
    }
    return line;
  });
  return { result: result.join('\n'), count };
}

/** 在一行中找到字符串外的 // 位置 */
function findCommentStart(line: string): number {
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === stringChar) inString = false;
    } else {
      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
      } else if (ch === '/' && line[i + 1] === '/') {
        return i;
      }
    }
  }
  return -1;
}

/** 移除 /* *‍/ 块注释 */
function removeBlockComments(input: string): { result: string; count: number } {
  let count = 0;
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';

  while (i < input.length) {
    const ch = input[i];

    if (inString) {
      result += ch;
      if (ch === '\\') {
        i++;
        if (i < input.length) result += input[i];
      } else if (ch === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      result += ch;
      i++;
      continue;
    }

    if (ch === '/' && i + 1 < input.length && input[i + 1] === '*') {
      count++;
      const end = input.indexOf('*/', i + 2);
      if (end >= 0) {
        // 替换注释为空格（保持位置，避免合并相邻 token）
        const comment = input.slice(i, end + 2);
        const newlines = (comment.match(/\n/g) || []).length;
        result += ' '.repeat(newlines > 0 ? 0 : 1) + '\n'.repeat(newlines);
        i = end + 2;
      } else {
        // 未闭合注释，移除到末尾
        result += ' ';
        i = input.length;
      }
      continue;
    }

    result += ch;
    i++;
  }

  return { result, count };
}

/** 单引号 → 双引号 */
function fixSingleQuotes(input: string): { result: string; count: number } {
  let count = 0;
  let result = '';
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === "'") {
      // 找到匹配的结束单引号
      let j = i + 1;
      let content = '';
      while (j < input.length) {
        if (input[j] === '\\') {
          content += input[j] + input[j + 1];
          j += 2;
          continue;
        }
        if (input[j] === "'") break;
        content += input[j];
        j++;
      }
      if (j < input.length) {
        // 成对单引号 → 双引号
        // 转义内容中的双引号
        const escaped = content.replace(/"/g, '\\"');
        result += '"' + escaped + '"';
        count++;
        i = j + 1;
        continue;
      }
    }

    result += ch;
    i++;
  }

  return { result, count };
}

/** 尾随逗号移除：}, → }  ], → ] */
function removeTrailingCommas(input: string): { result: string; count: number } {
  let count = 0;
  // 匹配 , 后面紧跟 } 或 ]，中间可有空白和换行
  const result = input.replace(/,\s*([}\]])/g, (_match, bracket) => {
    count++;
    return bracket;
  });
  return { result, count };
}

/** 未引用的 key 加双引号 */
function fixUnquotedKeys(input: string): { result: string; count: number } {
  let count = 0;
  // 匹配 { 或 , 后面的裸 key（字母/下划线/数字开头的标识符）后面跟 :
  // 不匹配已在引号内的
  const result = input.replace(
    /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    (_match, prefix, key) => {
      count++;
      return `${prefix}"${key}":`;
    },
  );
  return { result, count };
}

/** 布尔值/null 大小写修复 */
function fixCaseValues(input: string): { result: string; count: number } {
  let count = 0;
  let result = input;

  // 修复 True/TRUE/TrUe 等 → true
  const trueMatches = result.match(/\bTrue\b|\bTRUE\b/g);
  if (trueMatches) {
    count += trueMatches.length;
    result = result.replace(/\bTrue\b|\bTRUE\b/g, 'true');
  }

  // 修复 False/FALSE 等 → false
  const falseMatches = result.match(/\bFalse\b|\bFALSE\b/g);
  if (falseMatches) {
    count += falseMatches.length;
    result = result.replace(/\bFalse\b|\bFALSE\b/g, 'false');
  }

  // 修复 Null/NULL 等 → null
  const nullMatches = result.match(/\bNull\b|\bNULL\b/g);
  if (nullMatches) {
    count += nullMatches.length;
    result = result.replace(/\bNull\b|\bNULL\b/g, 'null');
  }

  return { result, count };
}

// ─── 主函数 ────────────────────────────────────────────

/**
 * 智能容错修复 JSON 文本。
 *
 * 按优先级顺序执行 6 条修复规则。
 * 修复后通过 JSON.parse 验证，验证通过返回修复结果，否则返回错误。
 *
 * @param raw 原始 JSON 文本（含语法错误）
 * @returns 成功返回 { repaired, fixes }，失败返回 { error }
 */
export function jsonRepair(raw: string): RepairResult | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: '请输入 JSON 文本' };
  }

  let current = trimmed;
  const fixes: RepairAction[] = [];

  // 规则 1: 移除行注释（先移除注释，避免干扰后续规则）
  const lineCommentResult = removeLineComments(current);
  if (lineCommentResult.count > 0) {
    current = lineCommentResult.result;
    fixes.push({ type: 'line-comment', description: '移除 // 行注释', count: lineCommentResult.count });
  }

  // 规则 2: 移除块注释
  const blockCommentResult = removeBlockComments(current);
  if (blockCommentResult.count > 0) {
    current = blockCommentResult.result;
    fixes.push({ type: 'block-comment', description: '移除 /* */ 块注释', count: blockCommentResult.count });
  }

  // 规则 3: 单引号 → 双引号
  const singleQuoteResult = fixSingleQuotes(current);
  if (singleQuoteResult.count > 0) {
    current = singleQuoteResult.result;
    fixes.push({ type: 'single-quotes', description: '单引号替换为双引号', count: singleQuoteResult.count });
  }

  // 规则 4: 未引用的 key 加双引号
  const unquotedKeyResult = fixUnquotedKeys(current);
  if (unquotedKeyResult.count > 0) {
    current = unquotedKeyResult.result;
    fixes.push({ type: 'unquoted-key', description: '为未引用的 key 加双引号', count: unquotedKeyResult.count });
  }

  // 规则 5: 尾随逗号移除
  const trailingCommaResult = removeTrailingCommas(current);
  if (trailingCommaResult.count > 0) {
    current = trailingCommaResult.result;
    fixes.push({ type: 'trailing-comma', description: '移除尾随逗号', count: trailingCommaResult.count });
  }

  // 规则 6: 布尔值/null 大小写修复
  const caseResult = fixCaseValues(current);
  if (caseResult.count > 0) {
    current = caseResult.result;
    fixes.push({ type: 'case-fix', description: '修复布尔值/null 大小写', count: caseResult.count });
  }

  // 验证修复结果
  if (fixes.length === 0) {
    return { error: '未检测到可修复的语法错误' };
  }

  try {
    JSON.parse(current);
  } catch {
    return { error: '修复后仍无法解析，JSON 可能严重损坏' };
  }

  return { repaired: current, fixes };
}

/**
 * 检测 JSON 文本是否存在可修复的错误（不实际修复，仅判断）。
 * 用于决定是否显示"修复"按钮。
 */
export function canRepair(raw: string): boolean {
  // 如果 JSON.parse 成功，不需要修复
  try {
    JSON.parse(raw.trim());
    return false;
  } catch {
    // 解析失败，尝试修复看是否可行
  }

  const result = jsonRepair(raw);
  return !('error' in result);
}
