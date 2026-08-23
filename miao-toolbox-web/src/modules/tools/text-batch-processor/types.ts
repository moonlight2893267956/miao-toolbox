/** 五个操作 Tab 的 Key */
export type TbpTabKey = 'dedup' | 'sort' | 'extract' | 'replace' | 'freq';

/** Tab 配置项 */
export interface TbpTabConfig {
  key: TbpTabKey;
  label: string;
  icon: string;
  description: string;
  hint: string;
}

/** 五个 Tab 配置列表（顺序决定导航排列） */
export const TBP_TABS: TbpTabConfig[] = [
  { key: 'dedup', label: '去重', icon: '⎀', description: '去除重复行', hint: '按行比较，保留首次出现的文本行，移除后续重复项' },
  { key: 'sort', label: '排序', icon: '↕', description: '行排序', hint: '按字母、数字或长度对文本行进行升序或降序排列' },
  { key: 'extract', label: '提取', icon: '⤴', description: '模式提取', hint: '提取邮箱、URL、数字、手机号等匹配特定模式的文本' },
  { key: 'replace', label: '替换', icon: '⇄', description: '查找替换', hint: '支持正则表达式的批量查找与替换，可预览变更' },
  { key: 'freq', label: '字数词频', icon: '#', description: '词频统计', hint: '统计字符数、单词数、行数，并按频率排列高频词' },
];

import type { DedupOptions } from './utils/text-ops/dedup';
import type { SortOptions } from './utils/text-ops/sort';
import type { SplitMode } from './utils/text-ops/freq';

/** Tab 子状态占位（后续 Story 逐步填充字段） */
export interface DedupState {
  options: DedupOptions;
}
export interface SortState {
  options: SortOptions;
}
/** 提取结果格式（FR-4.4） */
export type ExtractFormat = 'all' | 'dedup' | 'groups';

/** 提取 Tab 状态（Story 3.2/3.3） */
export interface ExtractState {
  /** 正则表达式；行包含模式为空字符串 */
  pattern: string;
  /** 标志位（如 "g"） */
  flags: string;
  /** 行包含关键词（preset line-contains 时使用） */
  keyword: string;
  /** 结果格式：每行一个 / 去重 / 仅捕获组 */
  format: ExtractFormat;
  /** 提取结果文本 */
  result: string | null;
  /** 正则错误（非法时红字提示） */
  error: string | null;
  /** 匹配数量（结果统计） */
  count: number;
}
export interface ReplaceState {
  /** 查找模式（正则或普通文本） */
  findPattern: string;
  /** 标志位 */
  flags: string;
  /** 替换文本 */
  replaceText: string;
  /** 是否启用正则模式 */
  useRegex: boolean;
  /** 是否已执行替换（false=仅预览，防误操作） */
  executed: boolean;
  /** 替换结果文本（执行后填充） */
  result: string | null;
  /** 正则错误 */
  error: string | null;
  /** 替换处数（预览统计） */
  count: number;
}
export interface FreqState {
  /** 切分模式：按词 / 按字 / 按空格（FR-6.5） */
  splitMode: SplitMode;
  /** Top N 展示条数（默认 20） */
  topN: number;
  /** 是否启用停用词过滤 */
  useStopWords: boolean;
}

/** 页面顶层状态 */
export interface TbpState {
  inputText: string;
  /** 回填前的原始输入（非 null 时可撤销回填） */
  previousInputText: string | null;
  activeTab: TbpTabKey;
  dedup: DedupState;
  sort: SortState;
  extract: ExtractState;
  replace: ReplaceState;
  freq: FreqState;
}

/** Action 联合类型 */
export type TbpAction =
  | { type: 'TBP_SET_TAB'; payload: TbpTabKey }
  | { type: 'TBP_SET_INPUT'; payload: string }
  | { type: 'TBP_SET_DEDUP_OPTIONS'; payload: DedupOptions }
  | { type: 'TBP_SET_SORT_OPTIONS'; payload: SortOptions }
  | { type: 'TBP_SET_EXTRACT_PATTERN'; payload: string }
  | { type: 'TBP_SET_EXTRACT_FLAGS'; payload: string }
  | { type: 'TBP_SET_EXTRACT_KEYWORD'; payload: string }
  | { type: 'TBP_SET_EXTRACT_FORMAT'; payload: ExtractFormat }
  | { type: 'TBP_SET_EXTRACT_RESULT'; payload: { result: string; count: number } }
  | { type: 'TBP_SET_EXTRACT_ERROR'; payload: string | null }
  | { type: 'TBP_SET_REPLACE_PATTERN'; payload: string }
  | { type: 'TBP_SET_REPLACE_FLAGS'; payload: string }
  | { type: 'TBP_SET_REPLACE_TEXT'; payload: string }
  | { type: 'TBP_SET_REPLACE_USE_REGEX'; payload: boolean }
  | { type: 'TBP_SET_REPLACE_PREVIEW'; payload: { count: number } }
  | { type: 'TBP_SET_REPLACE_EXECUTED'; payload: { result: string; count: number } }
  | { type: 'TBP_SET_REPLACE_ERROR'; payload: string | null }
  | { type: 'TBP_SET_FREQ_SPLIT_MODE'; payload: SplitMode }
  | { type: 'TBP_SET_FREQ_TOP_N'; payload: number }
  | { type: 'TBP_SET_FREQ_STOP_WORDS'; payload: boolean }
  | { type: 'TBP_BACKFILL'; payload: string }
  | { type: 'TBP_UNDO_BACKFILL' }
  | { type: 'TBP_CLEAR_ALL' };

/** 初始状态 */
export const INITIAL_TBP_STATE: TbpState = {
  inputText: '',
  previousInputText: null,
  activeTab: 'dedup',
  dedup: { options: {} },
  sort: { options: { method: 'asc', delimiter: '\n', ignoreCase: false } },
  extract: { pattern: '', flags: 'g', keyword: '', format: 'all', result: null, error: null, count: 0 },
  replace: { findPattern: '', flags: 'g', replaceText: '', useRegex: false, executed: false, result: null, error: null, count: 0 },
  freq: { splitMode: 'word', topN: 20, useStopWords: true },
};
