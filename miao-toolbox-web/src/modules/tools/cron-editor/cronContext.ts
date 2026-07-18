// Cron 编辑器 — Context 类型定义（架构 §5）
import { createContext } from 'react';
import type { CronDialect, CronExpression, CronState, ValidationResult } from './types';

export interface CronContextValue {
  state: CronState;
  /** 唯一写入入口：设置表达式字符串（FR-3 单一数据源） */
  setExpression: (expr: string) => void;
  /** 切换方言（5 位 / 6 位），内部自动转换表达式 */
  setDialect: (d: CronDialect) => void;
  /** 派生：解析结果（解析失败为 null） */
  parsed: CronExpression | null;
  /** 派生：校验结果（语法错误 + 语义警告） */
  validation: ValidationResult;
}

export const CronContext = createContext<CronContextValue | undefined>(undefined);
