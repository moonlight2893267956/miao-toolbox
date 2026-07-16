// JS 正则语法速查表数据（FR-9，2026-07-16 简化：仅 JS 语法，无引擎过滤）
// 条目按类别分组，点击插入正则输入框。

/** 速查表分类 */
export type CheatSheetCategory =
  | 'character'    // 字符类
  | 'quantifier'   // 量词
  | 'assertion'    // 断言
  | 'group'        // 分组
  | 'special'      // 特殊构造
  | 'flag';        // 内联修饰符

/** 分类元信息 */
export interface CategoryMeta {
  key: CheatSheetCategory;
  label: string;
  icon: string;
}

/** 单条速查表条目 */
export interface CheatSheetEntry {
  /** 语法文本（插入到正则输入框的内容） */
  syntax: string;
  /** 中文说明 */
  desc: string;
  /** 分类 */
  category: CheatSheetCategory;
  /** 示例（可选，展示匹配效果） */
  example?: string;
}

/** 分类元信息（渲染分组标题用） */
export const CATEGORIES: CategoryMeta[] = [
  { key: 'character',   label: '字符类',   icon: '🔤' },
  { key: 'quantifier',  label: '量词',     icon: '🔢' },
  { key: 'assertion',   label: '断言',     icon: '📌' },
  { key: 'group',       label: '分组',     icon: '📦' },
  { key: 'special',     label: '特殊构造', icon: '⚡' },
  { key: 'flag',        label: '内联修饰符', icon: '🚩' },
];

/** JS 语法速查表条目 */
export const CHEAT_SHEET_ENTRIES: CheatSheetEntry[] = [
  // ── 字符类 ──
  { syntax: '.',        desc: '匹配任意字符（除换行符，dotAll 模式下含换行）', category: 'character' },
  { syntax: '\\d',      desc: '数字 [0-9]', category: 'character' },
  { syntax: '\\D',      desc: '非数字 [^0-9]', category: 'character' },
  { syntax: '\\w',      desc: '单词字符 [a-zA-Z0-9_]', category: 'character' },
  { syntax: '\\W',      desc: '非单词字符', category: 'character' },
  { syntax: '\\s',      desc: '空白字符（空格、制表、换行等）', category: 'character' },
  { syntax: '\\S',      desc: '非空白字符', category: 'character' },
  { syntax: '[abc]',    desc: '字符集，匹配 a/b/c 中任一', category: 'character' },
  { syntax: '[a-z]',    desc: '字符范围', category: 'character' },
  { syntax: '[^abc]',   desc: '否定字符集，匹配非 a/b/c', category: 'character' },
  { syntax: '\\p{L}',   desc: 'Unicode 字母（需 u 标志）', category: 'character' },
  { syntax: '\\p{N}',   desc: 'Unicode 数字（需 u 标志）', category: 'character' },

  // ── 量词 ──
  { syntax: '*',        desc: '0 次或多次', category: 'quantifier' },
  { syntax: '+',        desc: '1 次或多次', category: 'quantifier' },
  { syntax: '?',        desc: '0 次或 1 次', category: 'quantifier' },
  { syntax: '{n}',      desc: '恰好 n 次', category: 'quantifier' },
  { syntax: '{n,}',     desc: '至少 n 次', category: 'quantifier' },
  { syntax: '{n,m}',    desc: 'n 到 m 次', category: 'quantifier' },
  { syntax: '*?',       desc: '非贪婪 0 次或多次', category: 'quantifier' },
  { syntax: '+?',       desc: '非贪婪 1 次或多次', category: 'quantifier' },
  { syntax: '??',       desc: '非贪婪 0 次或 1 次', category: 'quantifier' },

  // ── 断言 ──
  { syntax: '^',        desc: '行首（多行模式下匹配每行开头）', category: 'assertion' },
  { syntax: '$',        desc: '行尾（多行模式下匹配每行结尾）', category: 'assertion' },
  { syntax: '\\b',      desc: '单词边界', category: 'assertion' },
  { syntax: '\\B',      desc: '非单词边界', category: 'assertion' },
  { syntax: '(?=...)',  desc: '先行断言：后面匹配 ...', category: 'assertion' },
  { syntax: '(?!...)',  desc: '先行否定断言：后面不匹配 ...', category: 'assertion' },
  { syntax: '(?<=...)', desc: '后行断言：前面匹配 ...', category: 'assertion' },
  { syntax: '(?<!...)', desc: '后行否定断言：前面不匹配 ...', category: 'assertion' },

  // ── 分组 ──
  { syntax: '(...)',        desc: '捕获组', category: 'group' },
  { syntax: '(?:...)',      desc: '非捕获组', category: 'group' },
  { syntax: '(?<name>...)', desc: '命名捕获组', category: 'group' },
  { syntax: '\\1',          desc: '反向引用第 1 组', category: 'group' },
  { syntax: '\\k<name>',    desc: '命名反向引用', category: 'group' },

  // ── 特殊构造 ──
  { syntax: '|',            desc: '或（交替）', category: 'special' },
  { syntax: '\\',           desc: '转义特殊字符', category: 'special' },

  // ── 内联修饰符 ──
  { syntax: '(?i)',         desc: '内联忽略大小写', category: 'flag' },
  { syntax: '(?m)',         desc: '内联多行模式', category: 'flag' },
  { syntax: '(?s)',         desc: '内联 dotAll', category: 'flag' },
  { syntax: '(?u)',         desc: '内联 Unicode 模式', category: 'flag' },
];
