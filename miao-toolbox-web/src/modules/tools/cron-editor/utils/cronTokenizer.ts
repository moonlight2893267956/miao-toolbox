// Cron 分词器（架构 Decision 1：Tokenizer 层）
// 职责：将表达式字符串按空白拆分为字段 token 数组，并校验字段数量。
// 纯函数，无 React 依赖。

import type { CronDialect } from '../types';

export interface TokenizeResult {
  /** 字段 token（已去除首尾空白与多余空白），空表达式时为 [] */
  tokens: string[];
  /** 字段数量不符时的结构错误描述；数量正确或表达式为空时为 undefined */
  error?: string;
}

/** 将表达式按空白拆分为字段 token 数组，并校验字段数量是否符合方言 */
export function tokenize(expression: string, dialect: CronDialect): TokenizeResult {
  const expected = dialect === 'linux5' ? 5 : 6;
  const tokens = expression
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    // 空表达式不视为结构错误，由上层按"为空"处理（等待用户输入）
    return { tokens: [] };
  }

  if (tokens.length !== expected) {
    const modeLabel = dialect === 'linux5' ? '5 位 Linux' : '6 位含秒';
    return {
      tokens,
      error: `表达式应包含 ${expected} 个字段（当前为 ${modeLabel} 模式），实际为 ${tokens.length} 个`,
    };
  }

  return { tokens };
}
