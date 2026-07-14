// 引擎静态定义（架构 Decision 2：静态 TypeScript 对象，零运行时依赖）
import type { RegexEngine } from '../types';

/** 单个标志位定义 */
export interface FlagDefinition {
  /** 标志位字符（g/i/m/s/u 等） */
  key: string;
  /** 中文名称 */
  name: string;
  /** 说明 */
  desc: string;
}

/** 引擎定义 */
export interface EngineDefinition {
  key: RegexEngine;
  /** 展示名 */
  name: string;
  /** 该引擎支持的标志位 */
  flags: FlagDefinition[];
  /** 是否实际执行匹配（仅 js 为 true；其余仅语法校验 + 代码生成，见 FR-4） */
  executable: boolean;
}

const JS_FLAGS: FlagDefinition[] = [
  { key: 'g', name: '全局', desc: '查找所有匹配，而非首个' },
  { key: 'i', name: '忽略大小写', desc: '匹配时忽略大小写' },
  { key: 'm', name: '多行', desc: '^ 与 $ 匹配每行的开头与结尾' },
  { key: 's', name: 'dotAll', desc: '使 . 匹配换行符' },
  { key: 'u', name: 'Unicode', desc: '启用 Unicode 模式' },
];

const JAVA_FLAGS: FlagDefinition[] = [
  { key: 'i', name: '忽略大小写', desc: 'CASE_INSENSITIVE' },
  { key: 'm', name: '多行', desc: 'MULTILINE' },
  { key: 's', name: 'dotAll', desc: 'DOTALL（无独立 s 标志，用 (?s) 内联修饰符）' },
  { key: 'u', name: 'Unicode', desc: 'UNICODE_CASE' },
  { key: 'x', name: '注释', desc: 'COMMENTS，忽略空白与 # 注释' },
];

const PYTHON_FLAGS: FlagDefinition[] = [
  { key: 'i', name: 'IGNORECASE', desc: 're.I' },
  { key: 'm', name: 'MULTILINE', desc: 're.M' },
  { key: 's', name: 'DOTALL', desc: 're.S' },
  { key: 'x', name: 'VERBOSE', desc: 're.X' },
  { key: 'u', name: 'UNICODE', desc: 're.U（默认）' },
];

const GO_FLAGS: FlagDefinition[] = [
  { key: 'i', name: '忽略大小写', desc: 'i 标志' },
  { key: 'm', name: '多行', desc: 'm 标志' },
  { key: 's', name: 'dotAll', desc: 's 标志' },
  { key: 'U', name: '非贪婪', desc: 'U 标志（非捕获组默认非贪婪）' },
];

const PHP_FLAGS: FlagDefinition[] = [
  { key: 'i', name: '忽略大小写', desc: 'PCRE_CASELESS' },
  { key: 'm', name: '多行', desc: 'PCRE_MULTILINE' },
  { key: 's', name: 'dotAll', desc: 'PCRE_DOTALL' },
  { key: 'u', name: 'Unicode', desc: 'PCRE_UTF8' },
  { key: 'x', name: '注释', desc: 'PCRE_EXTENDED' },
];

export const ENGINES: Record<RegexEngine, EngineDefinition> = {
  js: { key: 'js', name: 'JavaScript', flags: JS_FLAGS, executable: true },
  java: { key: 'java', name: 'Java', flags: JAVA_FLAGS, executable: false },
  python: { key: 'python', name: 'Python', flags: PYTHON_FLAGS, executable: false },
  go: { key: 'go', name: 'Go', flags: GO_FLAGS, executable: false },
  php: { key: 'php', name: 'PHP', flags: PHP_FLAGS, executable: false },
};

/** 引擎列表（用于选择器渲染） */
export const ENGINE_LIST: EngineDefinition[] = [
  ENGINES.js,
  ENGINES.java,
  ENGINES.python,
  ENGINES.go,
  ENGINES.php,
];
