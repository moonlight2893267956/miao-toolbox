// Cron 语法速查表数据（FR-17 / Story 2.2）
// 纯静态数据：不依赖 React / 表达式状态，可独立复用。
// 适用字段标签与 types.ts 的 FIELD_DEFS.label 体系一致。

export interface CheatSheetEntry {
  /** 特殊字符符号 */
  symbol: string;
  /** 含义（中文） */
  meaning: string;
  /** 示例片段 */
  example: string;
  /** 示例说明（中文） */
  exampleDesc: string;
  /** 适用字段（中文标签） */
  applicableFields: string[];
}

/** 8 个 Cron 特殊字符速查条目（顺序即展示顺序） */
export const CRON_CHEAT_SHEET: CheatSheetEntry[] = [
  {
    symbol: '*',
    meaning: '匹配该字段所有可能值（通配）',
    example: '0 * * * *',
    exampleDesc: '每小时第 0 分钟触发',
    applicableFields: ['秒', '分', '时', '日', '月', '星期'],
  },
  {
    symbol: ',',
    meaning: '枚举多个值（或关系）',
    example: '0 9,18 * * *',
    exampleDesc: '每天 9 点与 18 点触发',
    applicableFields: ['秒', '分', '时', '日', '月', '星期'],
  },
  {
    symbol: '-',
    meaning: '表示连续区间（含两端）',
    example: '0 9-17 * * *',
    exampleDesc: '每天 9 点到 17 点每小时触发',
    applicableFields: ['秒', '分', '时', '日', '月', '星期'],
  },
  {
    symbol: '/',
    meaning: '步长，与通配或区间组合表示「每隔」',
    example: '*/15 * * * *',
    exampleDesc: '每隔 15 分钟触发',
    applicableFields: ['秒', '分', '时', '日', '月', '星期'],
  },
  {
    symbol: '?',
    meaning: '不指定值（仅用于日/星期其一，二者互斥）',
    example: '0 0 0 ? * *',
    exampleDesc: '每天 0 点，日字段留空由星期决定',
    applicableFields: ['日', '星期'],
  },
  {
    symbol: 'L',
    meaning: 'Last，最后一天（日）或该月最后一个星期几（星期后接数字）',
    example: '0 0 L * ?',
    exampleDesc: '每月最后一天 0 点触发',
    applicableFields: ['日', '星期'],
  },
  {
    symbol: 'W',
    meaning: 'Weekday，离指定日最近的工作日（仅日字段）',
    example: '0 0 15W * ?',
    exampleDesc: '每月 15 日最近的工作日 0 点触发',
    applicableFields: ['日'],
  },
  {
    symbol: '#',
    meaning: '第几个星期几（星期字段，格式 星期#序号）',
    example: '0 0 * * 2#1',
    exampleDesc: '每月第一个周二 0 点触发',
    applicableFields: ['星期'],
  },
];
