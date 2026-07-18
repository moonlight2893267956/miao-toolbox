// Cron 字段可视化配置（架构 Additional Requirements：FieldEditor 配置驱动，FieldConfig 定义在 fieldOptions.ts）
// 每个字段定义三类编辑模式所需的元数据：快捷选项 / 多选值集 / 展示标签。
import type { FieldDef, FieldType } from './types';
import { FIELD_DEFS } from './types';

/** 字段编辑模式 */
export type FieldEditorMode = 'quick' | 'multi' | 'advanced';

/** 单个快捷选项（下拉/按钮选择） */
export interface FieldQuickOption {
  /** 展示文案（含可读描述） */
  label: string;
  /** 写入表达式的 raw token，例如每5分钟(/5)、9与18、或通配(*) */
  value: string;
}

/** 字段可视化配置 */
export interface FieldConfig {
  type: FieldType;
  /** 快捷模式可用选项 */
  quickOptions: FieldQuickOption[];
  /** 多选模式可选值集合（升序）；特殊字符字段传空数组（仅高级模式可填） */
  multiValues: number[];
  /** 值展示文案（如月份 1→1月、星期 0→周日）；缺省用数字本身 */
  valueLabel?: (v: number) => string;
}

function range(min: number, max: number): number[] {
  const out: number[] = [];
  for (let i = min; i <= max; i++) out.push(i);
  return out;
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/** 各字段配置（覆盖 6 类字段；5 位模式不使用 second） */
export const FIELD_CONFIGS: Record<FieldType, FieldConfig> = {
  second: {
    type: 'second',
    quickOptions: [
      { label: '每秒 (*)', value: '*' },
      { label: '第 0 秒 (0)', value: '0' },
      { label: '每隔5秒 (*/5)', value: '*/5' },
      { label: '每隔10秒 (*/10)', value: '*/10' },
      { label: '每半分 (0,30)', value: '0,30' },
    ],
    multiValues: range(0, 59),
  },
  minute: {
    type: 'minute',
    quickOptions: [
      { label: '每分钟 (*)', value: '*' },
      { label: '第 0 分 (0)', value: '0' },
      { label: '每隔5分钟 (*/5)', value: '*/5' },
      { label: '每隔15分钟 (*/15)', value: '*/15' },
      { label: '每半时 (0,30)', value: '0,30' },
    ],
    multiValues: range(0, 59),
  },
  hour: {
    type: 'hour',
    quickOptions: [
      { label: '每小时 (*)', value: '*' },
      { label: '9点 (9)', value: '9' },
      { label: '18点 (18)', value: '18' },
      { label: '每隔2小时 (*/2)', value: '*/2' },
      { label: '白天 (9-18)', value: '9-18' },
    ],
    multiValues: range(0, 23),
  },
  day: {
    type: 'day',
    quickOptions: [
      { label: '每天 (*)', value: '*' },
      { label: '1号 (1)', value: '1' },
      { label: '15号 (15)', value: '15' },
      { label: '最后一天 (L)', value: 'L' },
      { label: '工作日 (LW)', value: 'LW' },
    ],
    multiValues: range(1, 31),
  },
  month: {
    type: 'month',
    quickOptions: [
      { label: '每月 (*)', value: '*' },
      { label: '1月 (1)', value: '1' },
      { label: '6月 (6)', value: '6' },
      { label: '12月 (12)', value: '12' },
      { label: '年初末 (1,12)', value: '1,12' },
    ],
    multiValues: range(1, 12),
    valueLabel: (v) => MONTH_LABELS[v - 1] ?? String(v),
  },
  weekday: {
    type: 'weekday',
    quickOptions: [
      { label: '每天 (*)', value: '*' },
      { label: '工作日 (1-5)', value: '1-5' },
      { label: '周末 (0,6)', value: '0,6' },
      { label: '周一 (1)', value: '1' },
      { label: '周日 (0)', value: '0' },
    ],
    multiValues: range(0, 7),
    valueLabel: (v) => WEEKDAY_LABELS[v] ?? String(v),
  },
};

/** 便捷：取字段定义 */
export function getFieldDef(type: FieldType): FieldDef {
  return FIELD_DEFS[type];
}
