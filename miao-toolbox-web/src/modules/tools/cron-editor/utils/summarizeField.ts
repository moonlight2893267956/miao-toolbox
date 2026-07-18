// Cron 字段值摘要（供气泡条 / 列表项使用，避免长列表撑爆 UI）
// 返回简短摘要（≤ ~16 字符）与完整 raw（用于 tooltip / 高级输入）。
import type { FieldDef } from '../types';
import { expandFieldValues } from './cronParser';

const UNIT_LABELS: Record<FieldDef['type'], string> = {
  second: '秒',
  minute: '分',
  hour: '时',
  day: '日',
  month: '月',
  weekday: '周',
};

export interface FieldSummary {
  /** 气泡 / 列表用的简短摘要（最多约 16 字符） */
  summary: string;
  /** 完整原始 raw（用于 title 提示） */
  full: string;
}

/** 逗号列表最大直接展开项数；超过则改为 "N 个值" */
const MAX_INLINE = 5;

/** 文本中是否包含 L / W / # 特殊字符（按 Quartz 语义） */
function hasSpecial(text: string): boolean {
  return /[L#W]/.test(text);
}

export function summarizeField(raw: string, def: FieldDef): FieldSummary {
  const text = (raw ?? '').trim();
  const full = text || '*';

  // 1. 空 / 通配 / 不指定
  if (text === '' || text === '*' || text === '?') {
    return { summary: `每 ${UNIT_LABELS[def.type]}`, full };
  }

  // 2. 特殊字符：原样展示
  if (hasSpecial(text)) {
    return { summary: text, full: text };
  }

  // 3. 步进：*/5 → "每 5 分"；0-59/3 → "每 3 分"
  if (text.includes('/')) {
    const [base, step] = text.split('/');
    if (step && /^\d+$/.test(step)) {
      if (base === '*' || base === `${def.min}-${def.max}`) {
        return { summary: `每 ${step} ${UNIT_LABELS[def.type]}`, full: text };
      }
      // 区间步进：1-30/3
      if (base.includes('-')) {
        const [a, b] = base.split('-');
        return { summary: `${a}-${b}/${step}`, full: text };
      }
      return { summary: `${base}/${step}`, full: text };
    }
  }

  // 4. 尝试展开
  const { values, error } = expandFieldValues(text, def);
  if (error || values.length === 0) {
    // 解析失败或无值，原样截断
    return {
      summary: text.length > 12 ? `${text.slice(0, 11)}…` : text,
      full: text,
    };
  }

  // 5. 连续区间：显示 a-b
  const min = values[0];
  const max = values[values.length - 1];
  if (values.length >= 3 && values.length === max - min + 1) {
    return { summary: `${min}–${max}`, full: text };
  }

  // 6. 短列表：直接展开
  if (values.length <= MAX_INLINE) {
    return { summary: values.join(','), full: text };
  }

  // 7. 长列表：摘要
  return { summary: `${values.length} 个值`, full: text };
}
