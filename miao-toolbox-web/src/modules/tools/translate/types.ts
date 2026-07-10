/**
 * 智能翻译工具 — 类型定义
 *
 * 覆盖 FR-1（文本翻译）、FR-2/FR-5/FR-6/FR-7（语种识别联动）的请求/响应结构，
 * 以及页面框架的 Tab 定义。语言码遵循百度翻译开放平台约定（日语使用 `jp`）。
 */

/** 百度翻译语言码（仅列出 P0 常用子集，后续可按需扩展） */
export type LanguageCode =
  | 'auto'
  | 'zh'
  | 'en'
  | 'jp'
  | 'kor'
  | 'fra'
  | 'spa'
  | 'ru'
  | 'de'
  | 'it'
  | 'pt'
  | 'vie'
  | 'th'
  | 'id'
  | 'ms'
  | 'ar'
  | 'hi';

/** 语言选项（用于下拉选择器） */
export interface LanguageOption {
  code: LanguageCode;
  label: string;
}

/** 百度语言码常量表 —— 自动检测 + 16 种常用语言 */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'auto', label: '自动检测' },
  { code: 'zh', label: '中文' },
  { code: 'en', label: '英语' },
  { code: 'jp', label: '日语' },
  { code: 'kor', label: '韩语' },
  { code: 'fra', label: '法语' },
  { code: 'spa', label: '西班牙语' },
  { code: 'ru', label: '俄语' },
  { code: 'de', label: '德语' },
  { code: 'it', label: '意大利语' },
  { code: 'pt', label: '葡萄牙语' },
  { code: 'vie', label: '越南语' },
  { code: 'th', label: '泰语' },
  { code: 'id', label: '印尼语' },
  { code: 'ms', label: '马来语' },
  { code: 'ar', label: '阿拉伯语' },
  { code: 'hi', label: '印地语' },
];

/** 页面 Tab 键 */
export type TranslateTabKey = 'text' | 'detect' | 'image' | 'voice' | 'ai';

/** 文本翻译请求（FR-1） */
export interface TranslateRequest {
  /** 待翻译文本 */
  text: string;
  /** 源语言；`auto` 由百度内部识别（FR-2） */
  from: LanguageCode;
  /** 目标语言 */
  to: LanguageCode;
}

/** 文本翻译响应（FR-1） */
export interface TranslateResponse {
  /** 译文文本 */
  translatedText: string;
  /** 实际检测到的源语言（来自百度） */
  from: LanguageCode;
  /** 字符消耗 */
  charCount: number;
}

/** 语种识别请求（FR-5） */
export interface DetectRequest {
  text: string;
}

/**
 * 单段识别结果
 * 注意：百度语种识别 API（`/api/trans/vip/language`）仅返回单一语种代码 `data.src`，
 * 不返回置信度，故 `confidence` 恒为 1.0 且前端不展示（见 PRD FR-5/FR-6 约束）。
 */
export interface DetectResultItem {
  language: LanguageCode;
  /** 置信度 0~1；百度不返回真实置信度，恒为 1.0，前端不展示 */
  confidence: number;
}

/** 语种识别响应（FR-5/6/7） */
export interface DetectResponse {
  /** 识别到的语种集合（限 7 语种子集） */
  results: DetectResultItem[];
  /** 字符占比最大的主语种（FR-6） */
  dominant: LanguageCode;
  /** 推荐目标语言（FR-7 映射规则） */
  recommendedTarget: LanguageCode;
}
