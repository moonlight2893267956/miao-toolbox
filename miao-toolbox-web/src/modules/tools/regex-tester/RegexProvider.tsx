import React, { useReducer, useCallback, useRef, useEffect } from 'react';
import type { RegexAction, RegexState, CodeGenLanguage } from './types';
import { RegexContext } from './regexContext';
import type { RegexContextValue } from './regexContext';
import { useMatchEngine } from './hooks/useMatchEngine';
import { useHistory } from './hooks/useHistory';
import { loadPageState, savePageState } from '../../../shared/utils/tabPageStorage';

const PAGE_KEY = 'tools-regex-tester';

const initialState: RegexState = {
  pattern: '',
  // 默认开启全局匹配，保证多匹配场景高亮全部（FR-1 AC2）
  flags: 'g',
  testText: '',
  replaceText: '',
  codeGenLanguage: 'javascript',
  matches: [],
  matchCount: 0,
  matchDetails: [],
  activeMatchIndex: 0,
  replacedText: null,
  patternError: null,
  timeoutWarning: null,
  showCheatSheet: false,
  showHistory: false,
  showCodeGen: false,
};

function loadInitialRegexState(): RegexState {
  const loaded = loadPageState<{
    pattern?: string;
    flags?: string;
    testText?: string;
    replaceText?: string;
    codeGenLanguage?: CodeGenLanguage;
  }>(PAGE_KEY);
  if (!loaded) return initialState;
  return {
    ...initialState,
    pattern: typeof loaded.pattern === 'string' ? loaded.pattern : '',
    flags: typeof loaded.flags === 'string' ? loaded.flags : 'g',
    testText: typeof loaded.testText === 'string' ? loaded.testText : '',
    replaceText: typeof loaded.replaceText === 'string' ? loaded.replaceText : '',
    codeGenLanguage: loaded.codeGenLanguage ?? 'javascript',
  };
}

function regexReducer(state: RegexState, action: RegexAction): RegexState {
  switch (action.type) {
    case 'REGEX_SET_PATTERN':
      // 输入变化即清除旧的报错/警告，等待下一次匹配结果
      return { ...state, pattern: action.payload, patternError: null, timeoutWarning: null };
    case 'REGEX_SET_FLAGS':
      return { ...state, flags: action.payload, patternError: null, timeoutWarning: null };
    case 'REGEX_SET_TEST_TEXT':
      return { ...state, testText: action.payload, patternError: null, timeoutWarning: null };
    case 'REGEX_SET_REPLACE_TEXT':
      return { ...state, replaceText: action.payload };
    case 'REGEX_SET_CODE_GEN_LANGUAGE':
      return { ...state, codeGenLanguage: action.payload };
    case 'REGEX_MATCH_SUCCESS': {
      const matchCount = action.payload.matches.length;
      // 选中索引越界保护：匹配数变化后回到首个匹配（AC4 点击切换仅作用于当前结果集）
      const activeMatchIndex = state.activeMatchIndex >= matchCount ? 0 : state.activeMatchIndex;
      return {
        ...state,
        matches: action.payload.matches,
        matchCount,
        matchDetails: action.payload.matchDetails,
        activeMatchIndex,
        replacedText: action.payload.replacedText,
        patternError: null,
        timeoutWarning: null,
      };
    }
    case 'REGEX_SET_ACTIVE_MATCH':
      return { ...state, activeMatchIndex: action.payload };
    case 'REGEX_TOGGLE_CHEAT_SHEET':
      return { ...state, showCheatSheet: !state.showCheatSheet };
    case 'REGEX_TOGGLE_HISTORY':
      return { ...state, showHistory: !state.showHistory };
    case 'REGEX_TOGGLE_CODE_GEN':
      return { ...state, showCodeGen: !state.showCodeGen };
    case 'REGEX_MATCH_ERROR':
      // 区分超时警告与语法错误：超时只设 timeoutWarning，语法错误设 patternError
      if (action.payload.startsWith('__TIMEOUT__')) {
        return { ...state, timeoutWarning: action.payload.slice('__TIMEOUT__'.length), patternError: null };
      }
      return { ...state, patternError: action.payload, timeoutWarning: null, matches: [], matchCount: 0, matchDetails: [], activeMatchIndex: 0, replacedText: null };
    default:
      return state;
  }
}

export const RegexProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(regexReducer, undefined, loadInitialRegexState);

  // 正则输入框光标位置 ref（CheatSheet 点击插入时需要）
  const patternCursorRef = useRef<number>(0);

  useEffect(() => {
    savePageState(PAGE_KEY, {
      pattern: state.pattern,
      flags: state.flags,
      testText: state.testText,
      replaceText: state.replaceText,
      codeGenLanguage: state.codeGenLanguage,
    });
  }, [
    state.pattern,
    state.flags,
    state.testText,
    state.replaceText,
    state.codeGenLanguage,
  ]);

  const setPattern = useCallback((pattern: string) => dispatch({ type: 'REGEX_SET_PATTERN', payload: pattern }), []);
  const setFlags = useCallback((flags: string) => dispatch({ type: 'REGEX_SET_FLAGS', payload: flags }), []);
  const setTestText = useCallback((text: string) => dispatch({ type: 'REGEX_SET_TEST_TEXT', payload: text }), []);
  const setReplaceText = useCallback((text: string) => dispatch({ type: 'REGEX_SET_REPLACE_TEXT', payload: text }), []);
  const setCodeGenLanguage = useCallback((lang: CodeGenLanguage) => dispatch({ type: 'REGEX_SET_CODE_GEN_LANGUAGE', payload: lang }), []);
  const setActiveMatch = useCallback((index: number) => dispatch({ type: 'REGEX_SET_ACTIVE_MATCH', payload: index }), []);
  const toggleCheatSheet = useCallback(() => dispatch({ type: 'REGEX_TOGGLE_CHEAT_SHEET' }), []);
  const toggleHistory = useCallback(() => dispatch({ type: 'REGEX_TOGGLE_HISTORY' }), []);
  const toggleCodeGen = useCallback(() => dispatch({ type: 'REGEX_TOGGLE_CODE_GEN' }), []);
  const setPatternCursor = useCallback((pos: number) => { patternCursorRef.current = pos; }, []);

  const toggleFlag = useCallback((flag: string) => {
    dispatch((() => {
      const has = state.flags.includes(flag);
      const next = has ? state.flags.replace(flag, '') : state.flags + flag;
      return { type: 'REGEX_SET_FLAGS', payload: next } as RegexAction;
    })());
  }, [state.flags]);

  // 在正则输入框光标位置插入文本（FR-9 速查表点击插入）
  const insertPattern = useCallback((text: string) => {
    const pos = patternCursorRef.current;
    const next = state.pattern.slice(0, pos) + text + state.pattern.slice(pos);
    dispatch({ type: 'REGEX_SET_PATTERN', payload: next });
    // 光标移到插入文本之后（组件需在下一帧 setSelectionRange）
    patternCursorRef.current = pos + text.length;
  }, [state.pattern]);

  // 匹配引擎：debounce 300ms + Web Worker 1s 超时防护（FR-1 / NFR-2）
  useMatchEngine(state.pattern, state.flags, state.testText, state.replaceText, dispatch);

  // 匹配历史（FR-10）：localStorage 持久化
  const historyHook = useHistory();

  // 匹配成功时自动保存历史（监听 matchCount 从 0 变为 >0，或匹配结果变化）
  React.useEffect(() => {
    if (state.matchCount > 0 && state.pattern && state.testText) {
      historyHook.addEntry(state.pattern, state.flags, state.testText);
    }
    // 仅在 matchCount 变化时触发，避免每次输入都保存
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.matchCount]);

  const value: RegexContextValue = {
    state,
    dispatch,
    setPattern,
    setFlags,
    setTestText,
    setReplaceText,
    setCodeGenLanguage,
    toggleFlag,
    setActiveMatch,
    insertPattern,
    toggleCheatSheet,
    toggleCodeGen,
    setPatternCursor,
    toggleHistory,
    historyEntries: historyHook.entries,
    addHistoryEntry: historyHook.addEntry,
    removeHistoryEntry: historyHook.removeEntry,
    clearHistoryEntries: historyHook.clearEntries,
  };

  return <RegexContext.Provider value={value}>{children}</RegexContext.Provider>;
};
