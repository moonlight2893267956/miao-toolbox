import React, { useReducer, useCallback, useEffect } from 'react';
import type { DiffAction, DiffState, LayoutMode } from './types';
import { DiffContext } from './diffContext';
import type { DiffContextValue } from './diffContext';
import { useDiffApi } from './useDiffApi';
import { loadPageState, savePageState } from '../../../shared/utils/tabPageStorage';

const PAGE_KEY = 'tools-text-compare';

const initialState: DiffState = {
  leftText: '',
  rightText: '',
  leftLabel: '原文(A)',
  rightLabel: '对比(B)',
  layout: 'split',
  ignoreWhitespace: false,
  structuredDiff: false,
  showLineNumbers: true,
  language: null,
  wordWrap: true,
  diffResult: null,
  loading: false,
  error: null,
  currentHunkIndex: -1,
  goToHunk: null,
};

function loadInitialDiffState(): DiffState {
  const loaded = loadPageState<Partial<DiffState>>(PAGE_KEY);
  if (!loaded) return initialState;
  return {
    ...initialState,
    leftText: typeof loaded.leftText === 'string' ? loaded.leftText : '',
    rightText: typeof loaded.rightText === 'string' ? loaded.rightText : '',
    layout:
      loaded.layout === 'stacked' || loaded.layout === 'split' ? loaded.layout : 'split',
    ignoreWhitespace: !!loaded.ignoreWhitespace,
    structuredDiff: !!loaded.structuredDiff,
      showLineNumbers: loaded.showLineNumbers !== false,
      wordWrap: loaded.wordWrap !== false,
  };
}

function diffReducer(state: DiffState, action: DiffAction): DiffState {
  switch (action.type) {
    case 'SET_LEFT':
      return { ...state, leftText: action.payload, error: null };
    case 'SET_RIGHT':
      return { ...state, rightText: action.payload, error: null };
    case 'SET_LAYOUT':
      return { ...state, layout: action.payload };
    case 'SET_IGNORE_WHITESPACE':
      return { ...state, ignoreWhitespace: action.payload };
    case 'SET_STRUCTURED_DIFF':
      return { ...state, structuredDiff: action.payload };
    case 'SET_SHOW_LINE_NUMBERS':
      return { ...state, showLineNumbers: action.payload };
    case 'SET_WORD_WRAP':
      return { ...state, wordWrap: action.payload };
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'SET_DIFF_RESULT':
      return { ...state, diffResult: action.payload, loading: false, error: null, currentHunkIndex: -1 };
    case 'SET_LEFT_FILE':
      return { ...state, leftText: action.payload.content, error: null };
    case 'SET_RIGHT_FILE':
      return { ...state, rightText: action.payload.content, error: null };
    case 'SET_CURRENT_HUNK_INDEX':
      return { ...state, currentHunkIndex: action.payload };
    case 'GO_TO_HUNK':
      return { ...state, goToHunk: action.payload };
    default:
      return state;
  }
}

export const DiffProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(diffReducer, undefined, loadInitialDiffState);
  const { compare } = useDiffApi();

  useEffect(() => {
    savePageState(PAGE_KEY, {
      leftText: state.leftText,
      rightText: state.rightText,
      layout: state.layout,
      ignoreWhitespace: state.ignoreWhitespace,
      structuredDiff: state.structuredDiff,
      showLineNumbers: state.showLineNumbers,
      wordWrap: state.wordWrap,
    });
  }, [
    state.leftText,
    state.rightText,
    state.layout,
    state.ignoreWhitespace,
    state.structuredDiff,
    state.showLineNumbers,
    state.wordWrap,
  ]);

  const setLeft = useCallback((text: string) => dispatch({ type: 'SET_LEFT', payload: text }), []);
  const setRight = useCallback((text: string) => dispatch({ type: 'SET_RIGHT', payload: text }), []);
  const setLayout = useCallback((mode: LayoutMode) => dispatch({ type: 'SET_LAYOUT', payload: mode }), []);
  const setIgnoreWhitespace = useCallback((v: boolean) => dispatch({ type: 'SET_IGNORE_WHITESPACE', payload: v }), []);
  const setStructuredDiff = useCallback((v: boolean) => dispatch({ type: 'SET_STRUCTURED_DIFF', payload: v }), []);
  const setShowLineNumbers = useCallback((v: boolean) => dispatch({ type: 'SET_SHOW_LINE_NUMBERS', payload: v }), []);
  const setWordWrap = useCallback((v: boolean) => dispatch({ type: 'SET_WORD_WRAP', payload: v }), []);

  const runCompare = useCallback(async () => {
    if (!state.leftText && !state.rightText) {
      dispatch({ type: 'SET_DIFF_RESULT', payload: null });
      dispatch({ type: 'SET_ERROR', payload: null });
      return;
    }
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      const result = await compare({
        left: state.leftText, right: state.rightText,
        ignoreWhitespace: state.ignoreWhitespace,
        structuredDiff: state.structuredDiff,
      });
      dispatch({ type: 'SET_DIFF_RESULT', payload: result });
      const firstIdx = result?.hunks?.findIndex((h: { type: string }) => h.type !== 'unchanged') ?? -1;
      dispatch({ type: 'SET_CURRENT_HUNK_INDEX', payload: firstIdx >= 0 ? firstIdx : -1 });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      dispatch({ type: 'SET_ERROR', payload: err.response?.data?.message || '对比失败' });
    }
  }, [state.leftText, state.rightText, state.ignoreWhitespace, state.structuredDiff, compare]);

  const value: DiffContextValue = {
    state, dispatch, setLeft, setRight, setLayout,
    setIgnoreWhitespace, setStructuredDiff, setShowLineNumbers, setWordWrap,
    runCompare,
  };

  return <DiffContext.Provider value={value}>{children}</DiffContext.Provider>;
};
