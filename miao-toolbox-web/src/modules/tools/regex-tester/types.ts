// 正则测试器 — 类型定义（架构 §5 状态形状 + Decision 命名约束）
// 2026-07-16 变更：移除 RegexEngine / EngineWarning（FR-4/5 已废弃），
// 新增 codeGenLanguage 供代码生成面板使用（FR-11 增强版）

/** 代码生成目标语言（FR-11 增强版：Tab 式语言切换） */
export type CodeGenLanguage = 'javascript' | 'java' | 'python' | 'go' | 'php' | 'csharp';

/** 单个匹配结果（FR-1 高亮所需） */
export interface MatchResult {
  /** 完整匹配文本 */
  fullMatch: string;
  /** 匹配起始位置（含） */
  index: number;
  /** 匹配结束位置（不含） */
  endIndex: number;
}

/** 单个捕获组详情（FR-2） */
export interface CaptureGroup {
  /** 组序号，从 1 开始（整体匹配为 0，详情区不展示） */
  index: number;
  /** 命名组名（如 "year"），非命名组为 null */
  name: string | null;
  /** 组匹配文本 */
  value: string;
  /** 组起始位置（含），环境不支持 indices 时为 null */
  start: number | null;
  /** 组结束位置（不含），环境不支持 indices 时为 null */
  end: number | null;
}

/** 单条匹配的完整详情（FR-2 分组详情） */
export interface MatchDetail {
  /** 第几个匹配，从 0 开始，与高亮段 matchIndex 对齐 */
  matchIndex: number;
  /** 完整匹配文本 */
  fullMatch: string;
  /** 完整匹配起始位置（含） */
  start: number;
  /** 完整匹配结束位置（不含） */
  end: number;
  /** 该匹配的所有捕获组（不含整体匹配），无捕获组时为空数组 */
  groups: CaptureGroup[];
}

/** 正则状态（架构 §5 RegexState，2026-07-16 简化） */
export interface RegexState {
  // 核心输入
  pattern: string;
  /** 激活的标志位，字符串形式（如 "gim"），与 new RegExp 一致 */
  flags: string;
  testText: string;
  /** 替换字符串（FR-3），支持 $1 / ${name} 分组引用 */
  replaceText: string;
  /** 代码生成面板当前选中的目标语言（FR-11 增强版） */
  codeGenLanguage: CodeGenLanguage;

  // 匹配结果（JS 引擎）
  matches: MatchResult[];
  matchCount: number;
  /** 分组详情（FR-2），与 matches 一一对应 */
  matchDetails: MatchDetail[];
  /** 当前选中的匹配序号（点击高亮段切换，AC4） */
  activeMatchIndex: number;
  /** 替换预览结果（FR-3）：null 表示未计算（无效正则），否则为替换后文本 */
  replacedText: string | null;

  // 校验
  /** 无效正则的行内错误提示（new RegExp 抛出的 message） */
  patternError: string | null;
  /** ReDoS 超时警告（匹配超过 1s） */
  timeoutWarning: string | null;

  // 面板开关
  /** 速查表面板是否展开（FR-9） */
  showCheatSheet: boolean;
  /** 历史面板是否展开（FR-10） */
  showHistory: boolean;
  /** 代码生成 Modal 是否展开（FR-11） */
  showCodeGen: boolean;
}

export type RegexAction =
  | { type: 'REGEX_SET_PATTERN'; payload: string }
  | { type: 'REGEX_SET_FLAGS'; payload: string }
  | { type: 'REGEX_SET_TEST_TEXT'; payload: string }
  | { type: 'REGEX_SET_REPLACE_TEXT'; payload: string }
  | { type: 'REGEX_SET_CODE_GEN_LANGUAGE'; payload: CodeGenLanguage }
  | { type: 'REGEX_MATCH_SUCCESS'; payload: { matches: MatchResult[]; matchDetails: MatchDetail[]; replacedText: string } }
  | { type: 'REGEX_MATCH_ERROR'; payload: string }
  | { type: 'REGEX_SET_ACTIVE_MATCH'; payload: number }
  | { type: 'REGEX_TOGGLE_CHEAT_SHEET' }
  | { type: 'REGEX_TOGGLE_HISTORY' }
  | { type: 'REGEX_TOGGLE_CODE_GEN' };
