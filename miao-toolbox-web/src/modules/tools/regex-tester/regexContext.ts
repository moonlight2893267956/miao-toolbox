import { createContext } from 'react';
import type { RegexAction, RegexState, CodeGenLanguage } from './types';
import type { HistoryEntry } from './hooks/useHistory';

export interface RegexContextValue {
  state: RegexState;
  dispatch: React.Dispatch<RegexAction>;
  setPattern: (pattern: string) => void;
  setFlags: (flags: string) => void;
  setTestText: (text: string) => void;
  setReplaceText: (text: string) => void;
  setCodeGenLanguage: (lang: CodeGenLanguage) => void;
  toggleFlag: (flag: string) => void;
  setActiveMatch: (index: number) => void;
  /** 在正则输入框光标位置插入文本（FR-9 速查表点击插入） */
  insertPattern: (text: string) => void;
  /** 切换速查表面板（FR-9） */
  toggleCheatSheet: () => void;
  /** 更新正则输入框光标位置（由 input 的 onKeyUp/onSelect 调用） */
  setPatternCursor: (pos: number) => void;
  /** 切换历史面板（FR-10） */
  toggleHistory: () => void;
  /** 切换代码生成 Modal（FR-11） */
  toggleCodeGen: () => void;
  /** 历史条目列表 */
  historyEntries: HistoryEntry[];
  /** 添加历史条目 */
  addHistoryEntry: (pattern: string, flags: string, testText: string) => void;
  /** 删除历史条目 */
  removeHistoryEntry: (idx: number) => void;
  /** 清空历史 */
  clearHistoryEntries: () => void;
}

export const RegexContext = createContext<RegexContextValue | undefined>(undefined);
