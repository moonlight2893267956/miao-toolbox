import React, { createContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { TranslateState, TranslateAction } from './translateContext';

/** 初始状态：默认进入文本翻译 Tab */
const INITIAL_STATE: TranslateState = {
  activeTab: 'text',
};

function reducer(state: TranslateState, action: TranslateAction): TranslateState {
  switch (action.type) {
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_PREFILL':
      return { ...state, prefill: action.payload };
    case 'CLEAR_PREFILL':
      return { ...state, prefill: undefined };
    default:
      return state;
  }
}

const TranslateStateContext = createContext<TranslateState | null>(null);
const TranslateDispatchContext = createContext<Dispatch<TranslateAction> | null>(null);

/**
 * 翻译工具状态容器（React Context + useReducer）。
 * 仅承载页面框架状态（当前 Tab）；业务状态由后续 Story 扩展。
 */
const TranslateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  return (
    <TranslateStateContext.Provider value={state}>
      <TranslateDispatchContext.Provider value={dispatch}>{children}</TranslateDispatchContext.Provider>
    </TranslateStateContext.Provider>
  );
};

export default TranslateProvider;
export { TranslateStateContext, TranslateDispatchContext };
