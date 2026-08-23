/** JS 正则语法速查表数据（UX-DR10）：按类别分组，点击插入正则输入框光标位置 */

export type CheatSheetCategory =
  | 'character'    // 字符类
  | 'quantifier'   // 量词
  | 'assertion'    // 边界与锚点
  | 'group'        // 分组
  | 'special';     // 特殊构造

export interface CategoryMeta {
  key: CheatSheetCategory;
  label: string;
  icon: string;
}

export interface CheatSheetEntry {
  /** 语法文本（插入到正则输入框的内容） */
  syntax: string;
  /** 中文说明 */
  desc: string;
  /** 分类 */
  category: CheatSheetCategory;
}

export const CATEGORIES: CategoryMeta[] = [
  { key: 'character', label: '字符类', icon: '🔤' },
  { key: 'quantifier', label: '量词', icon: '🔢' },
  { key: 'assertion', label: '边界与锚点', icon: '📌' },
  { key: 'group', label: '分组', icon: '📦' },
  { key: 'special', label: '特殊构造', icon: '⚡' },
];

export const CHEAT_SHEET_ENTRIES: CheatSheetEntry[] = [
  // ── 字符类 ──
  { syntax: '.', desc: '匹配任意字符（除换行符）', category: 'character' },
  { syntax: '\\d', desc: '数字 [0-9]', category: 'character' },
  { syntax: '\\D', desc: '非数字', category: 'character' },
  { syntax: '\\w', desc: '单词字符 [a-zA-Z0-9_]', category: 'character' },
  { syntax: '\\W', desc: '非单词字符', category: 'character' },
  { syntax: '\\s', desc: '空白字符', category: 'character' },
  { syntax: '\\S', desc: '非空白字符', category: 'character' },
  { syntax: '[abc]', desc: '字符集，a/b/c 任一', category: 'character' },
  { syntax: '[a-z]', desc: '字符范围', category: 'character' },
  { syntax: '[^abc]', desc: '否定字符集', category: 'character' },
  { syntax: '\\p{L}', desc: 'Unicode 字母（需 u 标志）', category: 'character' },
  { syntax: '\\p{N}', desc: 'Unicode 数字（需 u 标志）', category: 'character' },

  // ── 量词 ──
  { syntax: '*', desc: '0 次或多次', category: 'quantifier' },
  { syntax: '+', desc: '1 次或多次', category: 'quantifier' },
  { syntax: '?', desc: '0 次或 1 次', category: 'quantifier' },
  { syntax: '{n}', desc: '恰好 n 次', category: 'quantifier' },
  { syntax: '{n,}', desc: '至少 n 次', category: 'quantifier' },
  { syntax: '{n,m}', desc: 'n 到 m 次', category: 'quantifier' },
  { syntax: '*?', desc: '非贪婪 *', category: 'quantifier' },
  { syntax: '+?', desc: '非贪婪 +', category: 'quantifier' },

  // ── 边界与锚点 ──
  { syntax: '^', desc: '行首（多行模式匹配每行开头）', category: 'assertion' },
  { syntax: '$', desc: '行尾（多行模式匹配每行结尾）', category: 'assertion' },
  { syntax: '\\b', desc: '单词边界', category: 'assertion' },
  { syntax: '\\B', desc: '非单词边界', category: 'assertion' },
  { syntax: '(?=...)', desc: '先行断言：后面匹配', category: 'assertion' },
  { syntax: '(?!...)', desc: '先行否定断言', category: 'assertion' },
  { syntax: '(?<=...)', desc: '后行断言：前面匹配', category: 'assertion' },
  { syntax: '(?<!...)', desc: '后行否定断言', category: 'assertion' },

  // ── 分组 ──
  { syntax: '(...)', desc: '捕获组', category: 'group' },
  { syntax: '(?:...)', desc: '非捕获组', category: 'group' },
  { syntax: '(?<name>...)', desc: '命名捕获组', category: 'group' },
  { syntax: '\\1', desc: '反向引用第 1 组', category: 'group' },
  { syntax: '\\k<name>', desc: '命名反向引用', category: 'group' },

  // ── 特殊构造 ──
  { syntax: '|', desc: '或（交替）', category: 'special' },
  { syntax: '\\', desc: '转义特殊字符', category: 'special' },
];
