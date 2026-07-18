// Cron 解析器（架构 Decision 1：Parser 层）
// 职责：将字段 token 数组解析为结构化 CronExpression（展开数值 + 特殊字符）。
// 纯函数，无 React 依赖。字段级错误携带 fieldIndex 以便 UI 定位标红。

import type { CronDialect, CronExpression, CronField, FieldDef } from '../types';
import { FIELD_DEFS, FIELD_ORDER_5, FIELD_ORDER_6 } from '../types';
import { tokenize } from './cronTokenizer';

export type ParseResult =
  | { ok: true; expr: CronExpression }
  | { ok: false; fieldIndex: number; error: string };

interface FieldParse {
  values: number[];
  special?: string;
  specialValue?: number;
  nth?: number;
  error?: string;
}

function range(min: number, max: number): number[] {
  const out: number[] = [];
  for (let i = min; i <= max; i++) out.push(i);
  return out;
}

function steppedRange(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let i = min; i <= max; i += step) out.push(i);
  return out;
}

/** 将名称（如 JAN）或数字字符串转换为数值；非法返回 null */
function toNumberToken(raw: string, def: FieldDef): number | null {
  const upper = raw.toUpperCase();
  if (def.names && upper in def.names) return def.names[upper];
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  return null;
}

/** 解析单个字段为数值集合（或特殊字符标记） */
function parseField(raw: string, def: FieldDef): FieldParse {
  const text = raw.trim();
  if (text === '') return { values: [], error: `${def.label}字段不能为空` };

  // 不指定（Quartz 的 ?）：等价于 *
  if (text === '?') return { values: [], special: '?' };
  // 通配
  if (text === '*') return { values: range(def.min, def.max), special: '*' };

  // 特殊字符 L / W / #
  if (text.includes('L') || text.includes('W') || text.includes('#')) {
    return parseSpecialField(text, def);
  }

  // 普通字段：可能含 , - /
  const parts = text.split(',');
  const values = new Set<number>();
  for (const part of parts) {
    const r = parsePart(part.trim(), def);
    if (r.error) return { values: [], error: r.error };
    r.values.forEach((v) => values.add(v));
  }
  return { values: Array.from(values).sort((a, b) => a - b) };
}

/** 解析单个逗号分隔项（支持 单值 / 范围 / 通配步长 等写法） */
function parsePart(part: string, def: FieldDef): { values: number[]; error?: string } {
  let base = part;
  let step = 1;

  const slashIdx = part.indexOf('/');
  if (slashIdx >= 0) {
    base = part.slice(0, slashIdx);
    const stepStr = part.slice(slashIdx + 1);
    if (!/^\d+$/.test(stepStr)) {
      return { values: [], error: `${def.label}字段 '${part}' 步长无效` };
    }
    step = parseInt(stepStr, 10);
    if (step <= 0) return { values: [], error: `${def.label}字段 '${part}' 步长必须为正整数` };
  }

  if (base === '*') {
    return { values: steppedRange(def.min, def.max, step) };
  }

  if (base.includes('-')) {
    const [aStr, bStr] = base.split('-');
    const a = toNumberToken(aStr.trim(), def);
    const b = toNumberToken(bStr.trim(), def);
    if (a === null || b === null) {
      return { values: [], error: `${def.label}字段 '${part}' 范围无效` };
    }
    if (a < def.min || a > def.max || b < def.min || b > def.max) {
      return { values: [], error: `${def.label}字段值超出范围 (${def.min}-${def.max})` };
    }
    if (a > b) {
      return { values: [], error: `${def.label}字段 '${part}' 范围起点大于终点` };
    }
    return { values: steppedRange(a, b, step) };
  }

  // 单值（带步长时表示 a..max/step）
  const v = toNumberToken(base, def);
  if (v === null) {
    return { values: [], error: `${def.label}字段 '${part}' 不是有效数字或名称` };
  }
  if (v < def.min || v > def.max) {
    return { values: [], error: `${def.label}字段值 ${v} 超出范围 (${def.min}-${def.max})` };
  }
  if (slashIdx >= 0) {
    return { values: steppedRange(v, def.max, step) };
  }
  return { values: [v] };
}

/** 解析含特殊字符 L / W / # 的字段 */
function parseSpecialField(text: string, def: FieldDef): FieldParse {
  // LW：日字段最后一个工作日
  if (text === 'LW') {
    if (def.type !== 'day') return { values: [], error: `特殊字符 LW 仅适用于日字段` };
    return { values: [], special: 'LW' };
  }

  // L：最后一天（日字段=最后一天；星期字段=最后一天/周六）
  if (text === 'L') {
    if (!def.allowSpecial.includes('L')) {
      return { values: [], error: `特殊字符 L 不适用于${def.label}字段` };
    }
    return { values: [], special: 'L' };
  }

  // dL：最后一个 d（如 5L 最后一个周五）
  if (text.endsWith('L')) {
    if (!def.allowSpecial.includes('L')) {
      return { values: [], error: `特殊字符 L 不适用于${def.label}字段` };
    }
    const prefix = text.slice(0, -1);
    const n = toNumberToken(prefix, def);
    if (n === null) return { values: [], error: `${def.label}字段 '${text}' 格式无效` };
    if (n < def.min || n > def.max) {
      return { values: [], error: `${def.label}字段值 ${n} 超出范围 (${def.min}-${def.max})` };
    }
    return { values: [], special: 'L', specialValue: n };
  }

  // dW：最近工作日（仅日字段，如 15W）
  if (text.endsWith('W')) {
    if (def.type !== 'day') return { values: [], error: `特殊字符 W 仅适用于日字段` };
    const prefix = text.slice(0, -1);
    const n = toNumberToken(prefix, def);
    if (n === null || n < def.min || n > def.max) {
      return { values: [], error: `${def.label}字段 '${text}' 格式无效` };
    }
    return { values: [], special: 'W', specialValue: n };
  }

  // d#n：第 n 个星期 d（仅星期字段，如 2#1）
  if (text.includes('#')) {
    if (!def.allowSpecial.includes('#')) {
      return { values: [], error: `特殊字符 # 不适用于${def.label}字段` };
    }
    const [dStr, nStr] = text.split('#');
    const d = toNumberToken(dStr, def);
    const n = parseInt(nStr, 10);
    if (d === null || !/^\d+$/.test(nStr) || n < 1 || n > 5) {
      return { values: [], error: `${def.label}字段 '${text}' 格式无效（# 后为 1-5）` };
    }
    if (d < def.min || d > def.max) {
      return { values: [], error: `${def.label}字段值 ${d} 超出范围 (${def.min}-${def.max})` };
    }
    return { values: [], special: '#', specialValue: d, nth: n };
  }

  return { values: [], error: `${def.label}字段 '${text}' 包含无法识别的特殊字符` };
}

/**
 * 将单个字段原始 token 展开为数值集合（供可视化构建器多选模式派生勾选项）。
 * 特殊字符（* / ? / L / W / #）返回 special 标记、values 为空；解析失败返回 error。
 */
export function expandFieldValues(
  raw: string,
  def: FieldDef,
): { values: number[]; special: string | undefined; error?: string } {
  const fp = parseField(raw.trim(), def);
  return { values: fp.values, special: fp.special, error: fp.error };
}

/** 将表达式解析为 CronExpression */
export function parseExpression(expression: string, dialect: CronDialect): ParseResult {
  if (expression.trim() === '') {
    // 空表达式非结构错误，由上层按"为空"处理
    return { ok: false, fieldIndex: -1, error: '' };
  }

  const { tokens, error } = tokenize(expression, dialect);
  if (error) {
    // 字段数量不符属于结构错误，定位到 -1
    return { ok: false, fieldIndex: -1, error };
  }

  const order = dialect === 'linux5' ? FIELD_ORDER_5 : FIELD_ORDER_6;
  const fields: CronField[] = [];

  for (let i = 0; i < order.length; i++) {
    const def = FIELD_DEFS[order[i]];
    const fp = parseField(tokens[i], def);
    if (fp.error) {
      return { ok: false, fieldIndex: i, error: fp.error };
    }
    fields.push({
      type: def.type,
      raw: tokens[i],
      values: fp.values,
      special: fp.special,
      specialValue: fp.specialValue,
      nth: fp.nth,
    });
  }

  return { ok: true, expr: { dialect, fields, raw: expression } };
}
