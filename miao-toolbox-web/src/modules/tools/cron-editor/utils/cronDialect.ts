// Cron 方言转换（架构 Process Patterns：Cron 方言切换）
// 5→6：在表达式前补秒字段（默认 `0`）
// 6→5：移除秒字段（第一个）；非 0 的丢失由 UI 层弹确认处理（见 ExpressionInput）

import type { CronDialect } from '../types';

/** 在两种方言间转换表达式文本（假设表达式符合 from 方言的字段数） */
export function transformDialect(expr: string, from: CronDialect, to: CronDialect): string {
  const trimmed = expr.trim();
  if (trimmed === '') return trimmed;

  const tokens = trimmed.split(/\s+/);

  if (from === 'linux5' && to === 'spring6') {
    // 前补秒字段 0
    return `0 ${tokens.join(' ')}`;
  }

  if (from === 'spring6' && to === 'linux5') {
    // 移除秒字段（第一个）
    return tokens.slice(1).join(' ');
  }

  return trimmed;
}
