// Cron 字段 token 派生（供可视化构建器读取各字段 raw）
// 表达式字段数符合方言时原样返回；为空或字段数不符时回退为全 `*`（构建器默认视图）。
import type { CronDialect } from '../types';
import { tokenize } from './cronTokenizer';

/** 返回与方言字段数一致的位置数组；无法解析时以 `*` 填充 */
export function getFieldTokens(expression: string, dialect: CronDialect): string[] {
  const expected = dialect === 'linux5' ? 5 : 6;
  const { tokens } = tokenize(expression, dialect);
  if (tokens.length === expected) return tokens;
  return Array<string>(expected).fill('*');
}
