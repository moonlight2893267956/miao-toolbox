// Cron 表达式编辑器 — 共享类型定义（架构 §5 状态形状 + Decision 命名约束）

/** Cron 方言：5 位标准 Linux / 6 位含秒（Spring） */
export type CronDialect = 'linux5' | 'spring6';

/** 字段类型（有序） */
export type FieldType = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'weekday';

/** 字段定义（范围 + 允许的特殊字符 + 中文标签） */
export interface FieldDef {
  type: FieldType;
  /** 中文标签，用于错误消息与图例 */
  label: string;
  min: number;
  max: number;
  /** 该字段语义上支持的特殊字符 */
  allowSpecial: string[];
  /** 名称映射（如 JAN-DEC / SUN-SAT），仅用于解析 */
  names?: Record<string, number>;
}

/** 5 位字段顺序（分钟 小时 日 月 星期） */
export const FIELD_ORDER_5: FieldType[] = ['minute', 'hour', 'day', 'month', 'weekday'];
/** 6 位字段顺序（秒 分钟 小时 日 月 星期） */
export const FIELD_ORDER_6: FieldType[] = ['second', 'minute', 'hour', 'day', 'month', 'weekday'];

/** 字段定义表 */
export const FIELD_DEFS: Record<FieldType, FieldDef> = {
  second: { type: 'second', label: '秒', min: 0, max: 59, allowSpecial: [] },
  minute: { type: 'minute', label: '分钟', min: 0, max: 59, allowSpecial: [] },
  hour: { type: 'hour', label: '小时', min: 0, max: 23, allowSpecial: [] },
  day: { type: 'day', label: '日', min: 1, max: 31, allowSpecial: ['L', 'W'] },
  month: {
    type: 'month',
    label: '月',
    min: 1,
    max: 12,
    allowSpecial: [],
    names: { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 },
  },
  weekday: {
    type: 'weekday',
    label: '星期',
    min: 0,
    max: 7,
    allowSpecial: ['L', '#'],
    names: { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 },
  },
};

/** 单个字段解析结果 */
export interface CronField {
  type: FieldType;
  /** 原始字段文本，例如通配步进写法 */
  raw: string;
  /** 展开后的数值数组（特殊字符字段可能为空） */
  values: number[];
  /** 特殊字符标记，如 '*' / '?' / 'L' / 'W' / '#' */
  special?: string;
  /** 特殊字符携带的数值（如 `5L` 的 5、`2#1` 的 2） */
  specialValue?: number;
  /** `#` 的第几个（如 `2#1` 的 1） */
  nth?: number;
}

/** 解析后的 Cron 表达式 AST */
export interface CronExpression {
  dialect: CronDialect;
  fields: CronField[];
  raw: string;
}

/** 单条阻断性错误（带字段定位） */
export interface ValidationError {
  /** 出错字段下标（与 fields 对齐）；结构错误为 -1 */
  fieldIndex: number;
  message: string;
}

/** 单条非阻断性警告 */
export interface ValidationWarning {
  message: string;
  fieldIndex?: number;
}

/** 校验结果 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/** Cron 编辑器状态（架构 §5：expression 为唯一写入入口，其余派生） */
export interface CronState {
  expression: string;
  dialect: CronDialect;
}

export type CronAction =
  | { type: 'CRON_SET_EXPRESSION'; payload: string }
  | { type: 'CRON_SET_DIALECT'; payload: CronDialect };
