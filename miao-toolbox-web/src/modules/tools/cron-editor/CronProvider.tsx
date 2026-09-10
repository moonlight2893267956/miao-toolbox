// Cron 编辑器 — Provider（架构 Decision 2：单一 setter + 派生计算）
import React, { useReducer, useMemo, useCallback, useEffect, useRef } from 'react';
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

/**
 * 解析初始状态。
 *
 * `persist=true`（默认）时沿用独立工具页行为：从页面存储恢复上次输入；
 * `persist=false`（嵌入其他表单，如定时任务表单）时只取外部受控初值，
 * 避免与 Cron 编辑器工具页共享同一份存储而互相污染。
 */
function resolveInitialState(
  persist: boolean,
  initialExpression?: string,
  initialDialect?: CronDialect,
): CronState {
  if (!persist) {
    return {
      expression: initialExpression ?? '',
      dialect: initialDialect ?? 'linux5',
    };
  }
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
      // 单一写入入口：仅修改表达式，其余状态全部派生（同值短路，避免多余渲染）
      return action.payload === state.expression ? state : { ...state, expression: action.payload };
    case 'CRON_SET_DIALECT':
      return action.payload === state.dialect ? state : { ...state, dialect: action.payload };
    default:
      return state;
  }
}

interface CronProviderProps {
  children: React.ReactNode;
  /** 受控初值（仅 `persist=false` 或首次挂载时生效；不传则从页面存储恢复） */
  initialExpression?: string;
  initialDialect?: CronDialect;
  /** 表达式变化回调：嵌入其他表单时同步到外部受控字段 */
  onExpressionChange?: (expression: string) => void;
  /** 是否读写页面存储（默认 true；嵌入场景应传 false） */
  persist?: boolean;
}

export const CronProvider: React.FC<CronProviderProps> = ({
  children,
  initialExpression,
  initialDialect,
  onExpressionChange,
  persist = true,
}) => {
  const [state, dispatch] = useReducer(cronReducer, undefined, () =>
    resolveInitialState(persist, initialExpression, initialDialect),
  );

  useEffect(() => {
    if (!persist) return;
    savePageState(PAGE_KEY, {
      expression: state.expression,
      dialect: state.dialect,
    });
  }, [persist, state.expression, state.dialect]);

  // 外部受控值变化 → 同步进内部（同值被 reducer 短路，不会与用户输入互相覆盖）
  useEffect(() => {
    if (persist || initialExpression === undefined) return;
    dispatch({ type: 'CRON_SET_EXPRESSION', payload: initialExpression });
  }, [persist, initialExpression]);

  // 内部表达式变化 → 通知外部表单（回调放 ref，避免因父组件重渲染产生重复触发）
  const onExpressionChangeRef = useRef(onExpressionChange);
  useEffect(() => {
    onExpressionChangeRef.current = onExpressionChange;
  }, [onExpressionChange]);
  // 跳过挂载首帧：初值本就来自外部受控值，回推会让父表单认为字段"已改动"
  // （受控必填项会立刻显示校验错误）
  const notifyReadyRef = useRef(false);
  useEffect(() => {
    if (!notifyReadyRef.current) {
      notifyReadyRef.current = true;
      return;
    }
    onExpressionChangeRef.current?.(state.expression);
  }, [state.expression]);

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
