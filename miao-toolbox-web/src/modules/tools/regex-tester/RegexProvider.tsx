import React, { useReducer, useCallback } from 'react';
import type { RegexAction, RegexState, RegexEngine } from './types';
import { RegexContext } from './regexContext';
import type { RegexContextValue } from './regexContext';
import { useMatchEngine } from './hooks/useMatchEngine';

const initialState: RegexState = {
  pattern: '',
  // 默认开启全局匹配，保证多匹配场景高亮全部（FR-1 AC2）
  flags: 'g',
  testText: '',
  replaceText: '',
  engine: 'js',
  matches: [],
  matchCount: 0,
  matchDetails: [],
  activeMatchIndex: 0,
  replacedText: null,
  patternError: null,
  timeoutWarning: null,
};

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
    case 'REGEX_SET_ENGINE':
      return { ...state, engine: action.payload, timeoutWarning: null };
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
    case 'REGEX_MATCH_ERROR':
      // 区分超时警告与语法错误：超时只设 timeoutWarning，语法错误设 patternError
      // 这里统一进入 error 分支，由 hook 语义决定 payload 前缀
      if (action.payload.startsWith('__TIMEOUT__')) {
        return { ...state, timeoutWarning: action.payload.slice('__TIMEOUT__'.length), patternError: null };
      }
      return { ...state, patternError: action.payload, timeoutWarning: null, matches: [], matchCount: 0, matchDetails: [], activeMatchIndex: 0, replacedText: null };
    default:
      return state;
  }
}

export const RegexProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(regexReducer, initialState);

  // 匹配引擎：debounce 300ms + Web Worker 1s 超时防护（FR-1 / NFR-2）
  useMatchEngine(state.pattern, state.flags, state.testText, state.replaceText, state.engine, dispatch);

  const setPattern = useCallback((pattern: string) => dispatch({ type: 'REGEX_SET_PATTERN', payload: pattern }), []);
  const setFlags = useCallback((flags: string) => dispatch({ type: 'REGEX_SET_FLAGS', payload: flags }), []);
  const setTestText = useCallback((text: string) => dispatch({ type: 'REGEX_SET_TEST_TEXT', payload: text }), []);
  const setReplaceText = useCallback((text: string) => dispatch({ type: 'REGEX_SET_REPLACE_TEXT', payload: text }), []);
  const setEngine = useCallback((engine: RegexEngine) => dispatch({ type: 'REGEX_SET_ENGINE', payload: engine }), []);
  const setActiveMatch = useCallback((index: number) => dispatch({ type: 'REGEX_SET_ACTIVE_MATCH', payload: index }), []);

  const toggleFlag = useCallback((flag: string) => {
    dispatch((() => {
      const has = state.flags.includes(flag);
      const next = has ? state.flags.replace(flag, '') : state.flags + flag;
      return { type: 'REGEX_SET_FLAGS', payload: next } as RegexAction;
    })());
  }, [state.flags]);

  const value: RegexContextValue = {
    state,
    dispatch,
    setPattern,
    setFlags,
    setTestText,
    setReplaceText,
    setEngine,
    toggleFlag,
    setActiveMatch,
  };

  return <RegexContext.Provider value={value}>{children}</RegexContext.Provider>;
};
