import type { TranslateTabKey } from './types';

/**
 * 翻译工具页面框架状态（脚手架）。
 * 当前仅管理当前激活 Tab；后续 Story 会扩展文本翻译、语种识别等子状态。
 */
export interface TranslateState {
  /** 当前激活的 Tab */
  activeTab: TranslateTabKey;
}

/** 状态变更动作 */
export type TranslateAction = { type: 'SET_ACTIVE_TAB'; payload: TranslateTabKey };
