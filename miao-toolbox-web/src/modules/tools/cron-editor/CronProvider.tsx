// Cron 编辑器 — Provider（架构 Decision 2：单一 setter + 派生计算）
import React, { useReducer, useMemo, useCallback, useEffect } from 'react';
import type { CronAction, CronDialect, CronState } from './types';
import { CronContext } from './cronContext';
import type { CronContextValue } from './cronContext';
import { parseExpression } from './utils/cronParser';
import { validate } from './utils/cronValidator';
import { loadPageState, savePageState } from '../../../shared/utils/tabPageStorage';

const PAGE_KEY = 'tools-cron-editor';

const initialState: CronState = {
  expression: '',
  dialect: 'linux5',
};

function loadInitialCronState(): CronState {
  const loaded = loadPageState<Partial<CronState>>(PAGE_KEY);
  if (!loaded) return initialState;
  return {
    expression: typeof loaded.expression === 'string' ? loaded.expression : '',
    dialect: (loaded.dialect as CronDialect) || 'linux5',
  };
}

function cronReducer(state: CronState, action: CronAction): CronState {
  switch (action.type) {
    case 'CRON_SET_EXPRESSION':
      // 单一写入入口：仅修改表达式，其余状态全部派生
      return { ...state, expression: action.payload };
    case 'CRON_SET_DIALECT':
      return { ...state, dialect: action.payload };
    default:
      return state;
  }
}

export const CronProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(cronReducer, undefined, loadInitialCronState);

  useEffect(() => {
    savePageState(PAGE_KEY, {
      expression: state.expression,
      dialect: state.dialect,
    });
  }, [state.expression, state.dialect]);

  const setExpression = useCallback(
    (expr: string) => dispatch({ type: 'CRON_SET_EXPRESSION', payload: expr }),
    [],
  );
  const setDialect = useCallback(
    (d: CronDialect) => dispatch({ type: 'CRON_SET_DIALECT', payload: d }),
    [],
  );

  // 派生计算：解析与校验均从 expression + dialect 派生，无独立可变状态
  const parsedResult = useMemo(
    () => parseExpression(state.expression, state.dialect),
    [state.expression, state.dialect],
  );
  const parsed = parsedResult.ok ? parsedResult.expr : null;
  const validation = useMemo(
    () => validate(state.expression, state.dialect),
    [state.expression, state.dialect],
  );

  const value: CronContextValue = {
    state,
    setExpression,
    setDialect,
    parsed,
    validation,
  };

  return <CronContext.Provider value={value}>{children}</CronContext.Provider>;
};
