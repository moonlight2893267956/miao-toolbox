/**
 * 文本清洗台 — 多文本页签状态管理
 *
 * 模仿 usePhpLogTabs：每个页签独立持有输入文本与全部操作状态。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPageState, savePageState } from '../../../../shared/utils/tabPageStorage';
import type {
  TbpTabId,
  DedupState,
  SortState,
  ExtractState,
  ReplaceState,
  FreqState,
} from '../types';
import { INITIAL_TBP_STATE } from '../types';

export interface TbpTextTab {
  id: string;
  name: string;
  input: string;
  previousInputText: string | null;
  activeOp: TbpTabId | null;
  dedup: DedupState;
  sort: SortState;
  extract: ExtractState;
  replace: ReplaceState;
  freq: FreqState;
}

interface TabsState {
  tabs: TbpTextTab[];
  activeId: string;
}

const STORAGE_KEY = 'tools-text-batch-processor-tabs';
const DEBOUNCE_MS = 150;

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `tbp-tab-${Date.now()}-${_seq}`;
}

function createTab(name: string): TbpTextTab {
  return {
    id: nextId(),
    name,
    input: '',
    previousInputText: null,
    activeOp: null,
    dedup: { ...INITIAL_TBP_STATE.dedup },
    sort: { ...INITIAL_TBP_STATE.sort },
    extract: { ...INITIAL_TBP_STATE.extract },
    replace: { ...INITIAL_TBP_STATE.replace },
    freq: { ...INITIAL_TBP_STATE.freq },
  };
}

function defaultState(): TabsState {
  const first = createTab('文本 1');
  return { tabs: [first], activeId: first.id };
}

/**
 * 归一化页签：与 INITIAL_TBP_STATE 深度合并。
 * localStorage 里可能是旧版结构（缺字段 / undefined），
 * 不补齐会让受控 input 拿到 undefined value → 变成非受控 → 无法输入。
 */
function normalizeTab(raw: Partial<TbpTextTab> | null | undefined): TbpTextTab {
  const base = createTab(raw?.name ?? '文本');
  return {
    ...base,
    ...raw,
    id: raw?.id ?? base.id,
    name: raw?.name ?? base.name,
    input: typeof raw?.input === 'string' ? raw.input : '',
    previousInputText:
      typeof raw?.previousInputText === 'string' ? raw.previousInputText : null,
    activeOp: raw?.activeOp ?? null,
    dedup: { ...INITIAL_TBP_STATE.dedup, ...(raw?.dedup ?? {}) },
    sort: { ...INITIAL_TBP_STATE.sort, ...(raw?.sort ?? {}) },
    extract: { ...INITIAL_TBP_STATE.extract, ...(raw?.extract ?? {}) },
    replace: { ...INITIAL_TBP_STATE.replace, ...(raw?.replace ?? {}) },
    freq: { ...INITIAL_TBP_STATE.freq, ...(raw?.freq ?? {}) },
  };
}

function nextTextNumber(tabs: TbpTextTab[]): number {
  return tabs.reduce((max, t) => {
    const m = /^文本\s*(\d+)$/.exec(t.name);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
}

export function useTbpTabs() {
  const [state, setState] = useState<TabsState>(() => {
    const saved = loadPageState<TabsState>(STORAGE_KEY);
    if (saved && Array.isArray(saved.tabs) && saved.tabs.length > 0) {
      const tabs = saved.tabs.map(normalizeTab);
      const activeId = tabs.some((t) => t.id === saved.activeId)
        ? saved.activeId
        : tabs[0].id;
      return { tabs, activeId };
    }
    return defaultState();
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persist = useCallback((s: TabsState) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => savePageState(STORAGE_KEY, s), DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    persist(state);
  }, [state, persist]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const { tabs, activeId } = state;
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const updateTabs = useCallback((updater: (prev: TabsState) => TabsState) => {
    setState((prev) => updater(prev));
  }, []);

  const addTab = useCallback(() => {
    updateTabs((prev) => {
      const tab = createTab(`文本 ${nextTextNumber(prev.tabs) + 1}`);
      return { tabs: [...prev.tabs, tab], activeId: tab.id };
    });
  }, [updateTabs]);

  const removeTab = useCallback((id: string) => {
    updateTabs((prev) => {
      if (prev.tabs.length <= 1) {
        const cleared = { ...prev.tabs[0], input: '', previousInputText: null, activeOp: null, name: '文本 1' };
        return { tabs: [cleared], activeId: cleared.id };
      }
      const idx = prev.tabs.findIndex((t) => t.id === id);
      const next = prev.tabs.filter((t) => t.id !== id);
      const newActiveId =
        prev.activeId === id ? next[Math.min(idx, next.length - 1)].id : prev.activeId;
      return { tabs: next, activeId: newActiveId };
    });
  }, [updateTabs]);

  const activateTab = useCallback((id: string) => {
    updateTabs((prev) => ({ ...prev, activeId: id }));
  }, [updateTabs]);

  const renameTab = useCallback((id: string, name: string) => {
    updateTabs((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
    }));
  }, [updateTabs]);

  // 更新当前 tab 的字段（泛型辅助）
  /**
   * 更新激活页签的某个字段。
   * value 支持函数式写法 (prev) => next，保证同一 tick 内连续多次调用
   * 都基于最新状态计算，不会互相覆盖（修复"输入框无法输入"的根因）。
   */
  const updateActiveTab = useCallback(
    <K extends keyof TbpTextTab>(
      key: K,
      value: TbpTextTab[K] | ((prev: TbpTextTab[K]) => TbpTextTab[K]),
    ) => {
      updateTabs((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => {
          if (t.id !== prev.activeId) return t;
          const next =
            typeof value === 'function'
              ? (value as (p: TbpTextTab[K]) => TbpTextTab[K])(t[key])
              : value;
          return { ...t, [key]: next };
        }),
      }));
    },
    [updateTabs],
  );

  const setInput = useCallback(
    (input: string) => updateActiveTab('input', input),
    [updateActiveTab],
  );

  const toggleOp = useCallback(
    (op: TbpTabId) => {
      updateTabs((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) =>
          t.id === prev.activeId
            ? { ...t, activeOp: op }
            : t,
        ),
      }));
    },
    [updateTabs],
  );

  const backfill = useCallback(
    (text: string) => {
      updateTabs((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) =>
          t.id === prev.activeId
            ? { ...t, input: text, previousInputText: t.input }
            : t,
        ),
      }));
    },
    [updateTabs],
  );

  const undoBackfill = useCallback(() => {
    updateTabs((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.id === prev.activeId && t.previousInputText !== null
          ? { ...t, input: t.previousInputText, previousInputText: null }
          : t,
      ),
    }));
  }, [updateTabs]);

  const clearAll = useCallback(() => {
    updateTabs(() => {
      const cleared = createTab('文本 1');
      return { tabs: [cleared], activeId: cleared.id };
    });
  }, [updateTabs]);

  const closeOp = useCallback(() => {
    updateTabs((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.id === prev.activeId ? { ...t, activeOp: null } : t,
      ),
    }));
  }, [updateTabs]);

  return {
    tabs,
    activeId,
    activeTab,
    addTab,
    removeTab,
    activateTab,
    renameTab,
    updateActiveTab,
    setInput,
    toggleOp,
    closeOp,
    backfill,
    undoBackfill,
    clearAll,
  };
}
