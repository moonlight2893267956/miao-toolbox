/**
 * RAL 日志解析器 — 多页签状态管理 hook
 *
 * 管理页签数组 + 当前激活页签 + localStorage 持久化。
 * 每个页签独立持有 input / result，互不干扰。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPageState, savePageState } from '../../../shared/utils/tabPageStorage';
import type { RalParseResult, RalAnomalyConfig } from './ralLogParser';
import { DEFAULT_ANOMALY_CONFIG } from './ralLogParser';

/* ---------- 类型 ---------- */

export interface RalLogTab {
  id: string;
  name: string;
  input: string;
  result: RalParseResult | null;
  anomalyConfig: RalAnomalyConfig;
}

interface TabsState {
  tabs: RalLogTab[];
  activeId: string;
}

/* ---------- 常量 ---------- */

const STORAGE_KEY = 'tools-ral-log-parser-tabs';
const DEBOUNCE_MS = 150;

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `tab-${Date.now()}-${_seq}`;
}

function createTab(name: string): RalLogTab {
  return { id: nextId(), name, input: '', result: null, anomalyConfig: { ...DEFAULT_ANOMALY_CONFIG } };
}

function defaultState(): TabsState {
  const first = createTab('日志 1');
  return { tabs: [first], activeId: first.id };
}

function nextLogNumber(tabs: RalLogTab[]): number {
  return tabs.reduce((max, t) => {
    const m = /^日志\s*(\d+)$/.exec(t.name);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
}

/* ---------- hook ---------- */

export function useRalLogTabs() {
  const [state, setState] = useState<TabsState>(() => {
    const saved = loadPageState<TabsState>(STORAGE_KEY);
    if (saved && saved.tabs?.length > 0) {
      // 兼容旧数据：补齐缺失的 anomalyConfig
      saved.tabs = saved.tabs.map((t) => ({
        ...t,
        anomalyConfig: t.anomalyConfig ? { ...DEFAULT_ANOMALY_CONFIG, ...t.anomalyConfig } : { ...DEFAULT_ANOMALY_CONFIG },
      }));
      return saved;
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
      const tab = createTab(`日志 ${nextLogNumber(prev.tabs) + 1}`);
      return { tabs: [...prev.tabs, tab], activeId: tab.id };
    });
  }, [updateTabs]);

  const removeTab = useCallback(
    (id: string) => {
      updateTabs((prev) => {
        if (prev.tabs.length <= 1) {
          const cleared = { ...prev.tabs[0], input: '', result: null, name: '日志 1', anomalyConfig: { ...DEFAULT_ANOMALY_CONFIG } };
          return { tabs: [cleared], activeId: cleared.id };
        }
        const idx = prev.tabs.findIndex((t) => t.id === id);
        const next = prev.tabs.filter((t) => t.id !== id);
        const newActiveId =
          prev.activeId === id
            ? next[Math.min(idx, next.length - 1)].id
            : prev.activeId;
        return { tabs: next, activeId: newActiveId };
      });
    },
    [updateTabs],
  );

  const activateTab = useCallback(
    (id: string) => {
      updateTabs((prev) => ({ ...prev, activeId: id }));
    },
    [updateTabs],
  );

  const renameTab = useCallback(
    (id: string, name: string) => {
      updateTabs((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
      }));
    },
    [updateTabs],
  );

  const updateTabInput = useCallback(
    (id: string, input: string) => {
      updateTabs((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === id ? { ...t, input } : t)),
      }));
    },
    [updateTabs],
  );

  const updateTabResult = useCallback(
    (id: string, result: RalParseResult | null) => {
      updateTabs((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === id ? { ...t, result } : t)),
      }));
    },
    [updateTabs],
  );

  const updateTabAnomalyConfig = useCallback(
    (id: string, anomalyConfig: RalAnomalyConfig) => {
      updateTabs((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === id ? { ...t, anomalyConfig } : t)),
      }));
    },
    [updateTabs],
  );

  return {
    tabs,
    activeId,
    activeTab,
    addTab,
    removeTab,
    activateTab,
    renameTab,
    updateTabInput,
    updateTabResult,
    updateTabAnomalyConfig,
  };
}
