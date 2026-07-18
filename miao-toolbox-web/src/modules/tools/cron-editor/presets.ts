// Cron 预设模板（Story 1.3 / FR-7 常用模板快速选择）
// 模板基准为 5 位标准 Linux 表达式；6 位方言由 PresetBar 经 transformDialect 前补秒字段。
import type { CronDialect } from './types';
import { transformDialect } from './utils/cronDialect';

/** 单个预设模板 */
export interface CronPreset {
  /** 模板唯一 key */
  key: string;
  /** 展示标签 */
  label: string;
  /** 简短描述（用于 title / 辅助文案） */
  desc: string;
  /** 5 位标准表达式基准 */
  expr5: string;
}

/** 常用预设模板（≥ 6 项，覆盖 FR-7 AC1） */
export const CRON_PRESETS: CronPreset[] = [
  { key: 'every-minute', label: '每分钟', desc: '每分钟的第 0 秒执行', expr5: '* * * * *' },
  { key: 'every-hour', label: '每小时', desc: '每小时的第 0 分 0 秒', expr5: '0 * * * *' },
  { key: 'daily-midnight', label: '每天零点', desc: '每天 00:00 执行', expr5: '0 0 * * *' },
  { key: 'workday-9am', label: '工作日9点', desc: '周一至周五 09:00 执行', expr5: '0 9 * * 1-5' },
  { key: 'monday-midnight', label: '每周一零点', desc: '每周一 00:00 执行', expr5: '0 0 * * 1' },
  { key: 'monthly-1st', label: '每月1号零点', desc: '每月 1 号 00:00 执行', expr5: '0 0 1 * *' },
];

/**
 * 将预设模板按目标方言转换为实际写入的表达式。
 * linux5 → 直接用基准；spring6 → 前补秒字段（默认 0）。
 */
export function presetToExpression(preset: CronPreset, dialect: CronDialect): string {
  return transformDialect(preset.expr5, 'linux5', dialect);
}

/**
 * 判断当前表达式是否等于某个模板（考虑方言：spring6 时还原 5 位比较）。
 * 用于模板 chip 的 active 高亮。
 */
export function matchPreset(expression: string, dialect: CronDialect, preset: CronPreset): boolean {
  const trimmed = expression.trim();
  if (trimmed === '') return false;
  const base5 = dialect === 'spring6' ? transformDialect(trimmed, 'spring6', 'linux5') : trimmed;
  return base5 === preset.expr5;
}
