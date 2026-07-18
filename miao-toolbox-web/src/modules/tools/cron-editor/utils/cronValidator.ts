// Cron 校验器（架构 Decision 1：Validator 层）
// 职责：语法合法性（范围）校验 + 语义可疑组合警告。
// 纯函数，无 React 依赖。语法错误阻断（valid=false），语义警告不阻断（warnings）。

import type { CronDialect, CronExpression, ValidationResult, ValidationWarning } from '../types';
import { parseExpression } from './cronParser';

/** 每月天数（非闰年；2 月取 28，闰年判断在语义警告中无需精确） */
function daysInMonth(month: number): number {
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
}

/** 月中文标签 */
function monthLabel(month: number): string {
  return `${month}月`;
}

/** 判断字段是否为"限定"（非通配/不指定/特殊日字符） */
function isRestricted(field: { values: number[]; special?: string } | undefined): boolean {
  if (!field) return false;
  if (field.special && ['*', '?', 'L', 'W'].includes(field.special)) return false;
  return field.values.length > 0;
}

/** 计算语义警告（不阻断） */
function semanticWarnings(expr: CronExpression): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const monthField = expr.fields.find((f) => f.type === 'month');
  const dayField = expr.fields.find((f) => f.type === 'day');
  const weekdayField = expr.fields.find((f) => f.type === 'weekday');

  // 1) 日与月同时限定，且某些命中月天数不足以容纳该日 → 提示该月不会触发
  if (monthField && dayField && isRestricted(monthField) && isRestricted(dayField)) {
    const monthSet = monthField.values;
    for (const d of dayField.values) {
      const impossibleEverywhere = monthSet.every((m) => d > daysInMonth(m));
      if (impossibleEverywhere) {
        const label = monthSet.length === 1 ? monthLabel(monthSet[0]) : `${monthSet.map(monthLabel).join('/')}`;
        warnings.push({
          message: `${label}没有${d}号，该表达式在${label}不会触发`,
        });
      }
    }
  }

  // 2) 日与星期同时限定 → 标准 cron 取并集（任一满足即触发），易踩坑
  if (dayField && weekdayField && isRestricted(dayField) && isRestricted(weekdayField)) {
    warnings.push({
      message: '同时指定「日」和「星期」时，标准 Cron 取两者并集（任一满足即触发）；若需「且」关系请改用其它写法',
    });
  }

  return warnings;
}

/** 校验表达式，返回语法错误与语义警告 */
export function validate(expression: string, dialect: CronDialect): ValidationResult {
  const trimmed = expression.trim();
  if (trimmed === '') {
    // 空表达式视为待输入，无错误无警告
    return { valid: true, errors: [], warnings: [] };
  }

  const parsed = parseExpression(expression, dialect);
  if (!parsed.ok) {
    return {
      valid: false,
      errors: [{ fieldIndex: parsed.fieldIndex, message: parsed.error }],
      warnings: [],
    };
  }

  const warnings = semanticWarnings(parsed.expr);
  return { valid: true, errors: [], warnings };
}
