import type { TranslateTabKey, LanguageCode } from './types';

/**
 * 翻译工具页面框架状态。
 * 除当前激活 Tab 外，承载跨面板联动的预填数据（FR-7：语种识别 → 文本翻译）。
 */
export interface TranslatePrefill {
  /** 待翻译文本 */
  text: string;
  /** 预填源语言（来自识别到的主语种；未知时回退 auto） */
  from: LanguageCode;
  /** 预填目标语言（来自推荐目标语言） */
  to: LanguageCode;
}

export interface TranslateState {
  /** 当前激活的 Tab */
  activeTab: TranslateTabKey;
  /** 跨面板联动预填（语种识别推荐翻译时写入，文本翻译面板消费后清空） */
  prefill?: TranslatePrefill;
}

/** 状态变更动作 */
export type TranslateAction =
  | { type: 'SET_ACTIVE_TAB'; payload: TranslateTabKey }
  | { type: 'SET_PREFILL'; payload: TranslatePrefill }
  | { type: 'CLEAR_PREFILL' };
