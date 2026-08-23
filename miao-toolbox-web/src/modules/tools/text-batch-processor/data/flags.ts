/** 单个标志位定义 */
export interface FlagDefinition {
  /** 标志位字符（g/i/m/s） */
  key: string;
  /** 中文名称 */
  name: string;
  /** 说明 */
  desc: string;
}

/** JS 标志位列表（供正则输入框渲染） */
export const JS_FLAGS: FlagDefinition[] = [
  { key: 'g', name: '全局', desc: '查找所有匹配，而非首个' },
  { key: 'i', name: '忽略大小写', desc: '匹配时忽略大小写' },
  { key: 'm', name: '多行', desc: '^ 与 $ 匹配每行的开头与结尾' },
  { key: 's', name: 'dotAll', desc: '使 . 匹配换行符' },
];
