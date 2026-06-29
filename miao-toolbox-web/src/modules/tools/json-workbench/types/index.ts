/**
 * JSON 工作台 — 核心类型定义
 *
 * 所有组件共享的类型，确保数据模型一致。
 * Action type 使用 JSON_WB_ 前缀，避免与 miao-toolbox 其他模块冲突。
 */

// ─── 值类型 ────────────────────────────────────────────

/** JSON 值的 7 种类型 */
export type JsonValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

// ─── 数据模型 ──────────────────────────────────────────

/**
 * 扁平化树节点
 *
 * 以 JSONPath 为 id 的扁平数组，是虚拟滚动的天然搭档。
 * 折叠/展开 = 从 flat list 中 splice 子节点；
 * 搜索 = 过滤 flat list；
 * 面包屑 = node.id.split('.') 分段渲染。
 */
export interface JsonNode {
  /** JSONPath 如 "$.data.users[3].name" */
  id: string;
  /** 键名，如 "name" */
  key: string;
  /** 实际值 */
  value: unknown;
  /** 值类型 */
  type: JsonValueType;
  /** 嵌套深度（用于缩进） */
  depth: number;
  /** 父节点 id，根节点为 null */
  parentId: string | null;
  /** 当前是否展开（仅 object/array 有效） */
  isExpanded: boolean;
  /** 子节点数量 */
  childrenCount: number;
}

// ─── 视图模式 ──────────────────────────────────────────

/** 三种视图模式：树形 / 原始文本 / 分栏 */
export type ViewMode = 'tree' | 'raw' | 'split';

// ─── 搜索 ──────────────────────────────────────────────

/** 搜索模式 */
export type SearchMode = 'key' | 'value' | 'regex';

// ─── 错误 ──────────────────────────────────────────────

/** JSON 解析错误 */
export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

/** JSON Schema 校验错误 */
export interface SchemaError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

// ─── 修复 ──────────────────────────────────────────────

/** 修复操作记录 */
export interface RepairAction {
  type: 'single-quotes' | 'trailing-comma' | 'line-comment' | 'block-comment' | 'unquoted-key' | 'case-fix';
  description: string;
  count: number;
}

/** 修复结果 */
export interface RepairResult {
  repaired: string;
  fixes: RepairAction[];
}

// ─── 全局状态 ──────────────────────────────────────────

/**
 * JSON 工作台全局状态
 *
 * 由 useReducer 管理，所有组件通过 props 接收（Page 组件除外）。
 * Action type 统一使用 JSON_WB_ 前缀。
 */
export interface JsonWorkbenchState {
  /** 原始 JSON 文本 */
  rawJson: string;
  /** 解析后的 JSON 对象 */
  parsedJson: unknown;
  /** 扁平化节点列表 */
  flatNodeList: JsonNode[];
  /** 解析错误信息 */
  parseError: ParseError | null;
  /** 当前视图模式 */
  viewMode: ViewMode;
  /** 已展开的节点 id 集合 */
  expandedIds: Set<string>;
  /** 当前选中的节点 id */
  selectedNodeId: string | null;
  /** 搜索关键词 */
  searchQuery: string;
  /** 搜索结果（匹配节点的 id 列表） */
  searchResults: string[];
  /** 搜索模式 */
  searchMode: SearchMode;
  /** JSON Schema 文本 */
  schemaJson: string | null;
  /** Schema 校验错误列表 */
  schemaErrors: SchemaError[];
  /** 是否为大文件（>500KB） */
  isLargeFile: boolean;
  /** 解析进度（0-100，Web Worker 使用） */
  parseProgress: number;
  /** AI 请求加载中 */
  aiLoading: boolean;
  /** AI 返回结果 */
  aiResult: string | null;
  /** 格式化缩进空格数 */
  indentSize: 2 | 4;
  /** 修复预览（null = 无预览） */
  repairPreview: RepairResult | null;
  /** 修复错误信息 */
  repairError: string | null;
}

// ─── Actions ──────────────────────────────────────────

/** JSON 工作台 Action 联合类型（JSON_WB_ 前缀） */
export type JsonWbAction =
  | { type: 'JSON_WB_SET_RAW'; payload: string }
  | { type: 'JSON_WB_PARSE_SUCCESS'; payload: { parsed: unknown; flatNodes: JsonNode[] } }
  | { type: 'JSON_WB_PARSE_ERROR'; payload: ParseError }
  | { type: 'JSON_WB_TOGGLE_NODE'; payload: string }
  | { type: 'JSON_WB_SELECT_NODE'; payload: string | null }
  | { type: 'JSON_WB_SET_SEARCH'; payload: { query: string; mode: SearchMode } }
  | { type: 'JSON_WB_SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'JSON_WB_SET_SCHEMA'; payload: string | null }
  | { type: 'JSON_WB_SET_SCHEMA_ERRORS'; payload: SchemaError[] }
  | { type: 'JSON_WB_SET_AI_RESULT'; payload: string | null }
  | { type: 'JSON_WB_SET_AI_LOADING'; payload: boolean }
  | { type: 'JSON_WB_SET_PARSE_PROGRESS'; payload: number }
  | { type: 'JSON_WB_SET_LARGE_FILE'; payload: boolean }
  | { type: 'JSON_WB_EXPAND_ALL'; payload: string }
  | { type: 'JSON_WB_COLLAPSE_ALL'; payload: string }
  | { type: 'JSON_WB_ENSURE_EXPANDED'; payload: string[] }
  | { type: 'JSON_WB_SET_INDENT_SIZE'; payload: 2 | 4 }
  | { type: 'JSON_WB_REPAIR_SUCCESS'; payload: RepairResult }
  | { type: 'JSON_WB_REPAIR_FAIL'; payload: string }
  | { type: 'JSON_WB_SET_REPAIR_PREVIEW'; payload: RepairResult | null };
