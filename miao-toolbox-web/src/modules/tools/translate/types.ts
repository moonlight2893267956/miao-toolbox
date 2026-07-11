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

/**
 * 语音翻译语言选项（子集）。
 *
 * 百度语音翻译 v2 接口与文本翻译不同：
 * 1. 不支持 `auto` 自动检测源语言，必须明确指定说话语种；
 * 2. 仅支持有限语种（中文/粤语/英/日/韩/俄/德/法/泰/葡/西/阿），
 *    文本翻译里的意大利语/越南语/印尼语/马来语/印地语等语音接口不支持。
 * 因此源/目标语言下拉都使用本列表，且不含 `auto`。
 */
export const VOICE_LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: '英语' },
  { code: 'jp', label: '日语' },
  { code: 'kor', label: '韩语' },
  { code: 'fra', label: '法语' },
  { code: 'spa', label: '西班牙语' },
  { code: 'ru', label: '俄语' },
  { code: 'de', label: '德语' },
  { code: 'pt', label: '葡萄牙语' },
  { code: 'th', label: '泰语' },
  { code: 'ar', label: '阿拉伯语' },
];

/** 页面 Tab 键 */
export type TranslateTabKey = 'text' | 'detect' | 'history' | 'image' | 'voice';

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

/* ============================================================
   图片翻译（FR-8 / FR-9 预留 / FR-10 预留）
   对齐后端 ImageTranslateResponse（story-2.1）
   ============================================================ */

/** 文本块多边形顶点（百度 points，可选） */
export interface ImagePoint {
  x: number;
  y: number;
}

/** 单块 OCR 文本 + 逐块译文（FR-8 核心） */
export interface ImageTextBlock {
  /** 原文本 */
  src: string;
  /** 译文 */
  dst: string;
  /** 文本区域像素坐标（百度 rect，原样透传） */
  rect?: string;
  /** 文本多边形顶点（可选） */
  points?: ImagePoint[];
  /** 该块贴合渲染图（data URL，可选，FR-9 可复用） */
  blockImage?: string;
}

/** 图片翻译响应（FR-8） */
export interface ImageTranslateResponse {
  /** 实际检测到的源语言（来自百度） */
  from: LanguageCode;
  /** 目标语言 */
  to: LanguageCode;
  /** OCR 文本块与逐块译文（FR-8） */
  blocks: ImageTextBlock[];
  /** 整图原文汇总（sumSrc，FR-10 复用） */
  sourceText?: string;
  /** 整图译文汇总（sumDst，FR-10 复用） */
  translatedText?: string;
  /** 译文渲染图（data URL，FR-9 预览复用） */
  renderedImage?: string;
}

/* ============================================================
   语音翻译（FR-12 前端，story-3.2）
   对齐后端 SpeechTranslateResponse（story-3.1）
   ============================================================ */

/** 语音翻译响应（FR-12）：识别原文 + 译文 */
export interface SpeechTranslateResponse {
  /** 实际检测到的源语言（来自百度） */
  from: LanguageCode;
  /** 目标语言 */
  to: LanguageCode;
  /** 语音识别原文 */
  sourceText: string;
  /** 译文文本 */
  translatedText: string;
}

/* ============================================================
   AI 增强翻译（FR-16 / story-4.2）
   对齐后端 AiEnhanceRequest / AiEnhanceResponse（story-4.1）
   ============================================================ */

/** 润色风格（对齐 FR-16：正式/口语/营销/学术；marketing 由 story-4.1 在 agent 侧登记） */
export type AiEnhanceTone = 'formal' | 'casual' | 'marketing' | 'academic';

/** AI 增强任务类型：translate（百度打底+润色）/ context（上下文连贯，FR-17） */
export type AiEnhanceTask = 'translate' | 'context';

/** AI 增强翻译请求（FR-16/FR-17）：后端 agent 内部完成百度打底 + LLM 润色，前端传原文即可 */
export interface AiEnhanceRequest {
  /** 待增强文本（原文） */
  text: string;
  /** 源语言；`auto` 由 agent 内部识别 */
  sourceLang: LanguageCode;
  /** 目标语言 */
  targetLang: LanguageCode;
  /** 风格：formal/casual/marketing/academic，可空（agent 不强制） */
  tone?: AiEnhanceTone;
  /** 任务类型，默认 translate；context 为上下文连贯翻译（FR-17） */
  task?: AiEnhanceTask;
  /** 前文上下文（FR-17，仅 task=context 时使用）：累积的「原文→译文」对 */
  context?: string;
}

/** AI 增强翻译响应（对齐 translate-agent 的 output 字段） */
export interface AiEnhanceResponse {
  /** 实际执行的任务 */
  task?: string;
  /** 最终增强译文 */
  translated: string;
  /** 百度原始直译（agent 打底返回） */
  mtDraft?: string;
  /** 双语对照 [{src, tgt}] */
  bilingual?: Array<{ src: string; tgt: string }>;
  /** 润色/降级说明 */
  notes?: string;
}
