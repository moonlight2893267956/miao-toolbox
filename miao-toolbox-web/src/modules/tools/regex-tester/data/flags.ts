// JS 标志位定义（2026-07-16 简化：仅 JS 引擎执行匹配，标志位固定 g/i/m/s/u）
// 原 engines.ts 已废弃（FR-4/5 移除），本文件仅保留 JS 标志位数据

/** 单个标志位定义 */
export interface FlagDefinition {
  /** 标志位字符（g/i/m/s/u） */
  key: string;
  /** 中文名称 */
  name: string;
  /** 说明 */
  desc: string;
}

/** JS 标志位列表（供 RegexEditor 渲染） */
export const JS_FLAGS: FlagDefinition[] = [
  { key: 'g', name: '全局', desc: '查找所有匹配，而非首个' },
  { key: 'i', name: '忽略大小写', desc: '匹配时忽略大小写' },
  { key: 'm', name: '多行', desc: '^ 与 $ 匹配每行的开头与结尾' },
  { key: 's', name: 'dotAll', desc: '使 . 匹配换行符' },
  { key: 'u', name: 'Unicode', desc: '启用 Unicode 模式' },
];
