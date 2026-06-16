import React, { useReducer, useCallback } from 'react';
import type { DiffAction, DiffState, Granularity, LayoutMode } from './types';
import { DiffContext } from './diffContext';
import type { DiffContextValue } from './diffContext';

const initialState: DiffState = {
  leftText: '',
  rightText: '',
  leftLabel: '原文(A)',
  rightLabel: '对比(B)',
  granularity: 'line',
  layout: 'split',
  ignoreWhitespace: false,
  structuredDiff: false,
  showLineNumbers: true,
  language: null,
  diffResult: null,
  loading: false,
  error: null,
  currentHunkIndex: -1,
  goToHunk: null,
};

function diffReducer(state: DiffState, action: DiffAction): DiffState {
  switch (action.type) {
    case 'SET_LEFT':
      return { ...state, leftText: action.payload, error: null };
    case 'SET_RIGHT':
      return { ...state, rightText: action.payload, error: null };
    case 'SET_GRANULARITY':
      return { ...state, granularity: action.payload };
    case 'SET_LAYOUT':
      return { ...state, layout: action.payload };
    case 'SET_IGNORE_WHITESPACE':
      return { ...state, ignoreWhitespace: action.payload };
    case 'SET_STRUCTURED_DIFF':
      return { ...state, structuredDiff: action.payload };
    case 'SET_SHOW_LINE_NUMBERS':
      return { ...state, showLineNumbers: action.payload };
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'SET_DIFF_RESULT':
      return { ...state, diffResult: action.payload, loading: false, error: null, currentHunkIndex: -1 };
    case 'SET_LEFT_FILE':
      return { ...state, leftText: action.payload.content, leftLabel: action.payload.name, error: null };
    case 'SET_RIGHT_FILE':
      return { ...state, rightText: action.payload.content, rightLabel: action.payload.name, error: null };
    case 'SET_CURRENT_HUNK_INDEX':
      return { ...state, currentHunkIndex: action.payload };
    case 'GO_TO_HUNK':
      return { ...state, goToHunk: action.payload };
    default:
      return state;
  }
}

export const DiffProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(diffReducer, initialState);

  const setLeft = useCallback((text: string) => dispatch({ type: 'SET_LEFT', payload: text }), []);
  const setRight = useCallback((text: string) => dispatch({ type: 'SET_RIGHT', payload: text }), []);
  const setGranularity = useCallback((g: Granularity) => dispatch({ type: 'SET_GRANULARITY', payload: g }), []);
  const setLayout = useCallback((mode: LayoutMode) => dispatch({ type: 'SET_LAYOUT', payload: mode }), []);
  const setIgnoreWhitespace = useCallback((v: boolean) => dispatch({ type: 'SET_IGNORE_WHITESPACE', payload: v }), []);
  const setStructuredDiff = useCallback((v: boolean) => dispatch({ type: 'SET_STRUCTURED_DIFF', payload: v }), []);
  const setShowLineNumbers = useCallback((v: boolean) => dispatch({ type: 'SET_SHOW_LINE_NUMBERS', payload: v }), []);

  const value: DiffContextValue = {
    state, dispatch, setLeft, setRight, setGranularity, setLayout,
    setIgnoreWhitespace, setStructuredDiff, setShowLineNumbers,
  };

  return <DiffContext.Provider value={value}>{children}</DiffContext.Provider>;
};
