/**
 * Tab 页面状态持久化 hooks。
 *
 * 与 useState 类似，但会自动写入 localStorage（按 tabKey）。
 * 关闭 Tab 时由 TabContext 清除对应 key，避免脏数据残留。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { loadPageState, savePageState } from '../shared/utils/tabPageStorage';

const DEBOUNCE_MS = 120;

/**
 * 单值持久化，API 同 useState。
 *
 * @param tabKey 与 TabItem.key 一致，如 `tools-network-url-parser`
 * @param initialValue 无缓存时的默认值
 */
export function useTabPageState<T>(
  tabKey: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    const loaded = loadPageState<T>(tabKey);
    return loaded !== null ? loaded : initialValue;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      savePageState(tabKey, state);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tabKey, state]);

  return [state, setState];
}

/**
 * 多字段页面状态（整页一个 JSON 对象）。
 * 适合有多个输入/选项的工具页。
 */
export function useTabPageStore<T extends Record<string, unknown>>(
  tabKey: string,
  defaults: T,
): {
  state: T;
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  setState: Dispatch<SetStateAction<T>>;
  reset: () => void;
} {
  const defaultsRef = useRef(defaults);
  const [state, setState] = useState<T>(() => {
    const loaded = loadPageState<Partial<T>>(tabKey);
    if (!loaded || typeof loaded !== 'object') return defaults;
    return { ...defaults, ...loaded };
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      savePageState(tabKey, state);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tabKey, state]);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setState(defaultsRef.current);
  }, []);

  return { state, setField, setState, reset };
}

/**
 * 为 useReducer 恢复初始 state（仅取可序列化业务字段）。
 * 在 Provider 中配合 useEffect 保存使用。
 */
export function readPersistedPageState<T extends object>(
  tabKey: string,
  defaults: T,
  pick?: (loaded: Partial<T>) => Partial<T>,
): T {
  const loaded = loadPageState<Partial<T>>(tabKey);
  if (!loaded || typeof loaded !== 'object') return defaults;
  const patch = pick ? pick(loaded) : loaded;
  return { ...defaults, ...patch };
}
