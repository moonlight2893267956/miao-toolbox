/**
 * PHP 日志提取器 — 多页签状态管理 hook
 *
 * 管理页签数组 + 当前激活页签 + localStorage 持久化。
 * 每个页签独立持有 input / deepParse / result，互不干扰。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPageState, savePageState } from '../../../shared/utils/tabPageStorage';
import type { PhpLogExtractResult } from './phpLogExtractor';

/* ---------- 类型 ---------- */

export interface PhpLogTab {
  id: string;
  name: string;
  input: string;
  deepParse: boolean;
  result: PhpLogExtractResult | null;
}

interface TabsState {
  tabs: PhpLogTab[];
  activeId: string;
}

/* ---------- 常量 ---------- */

const STORAGE_KEY = 'tools-php-log-extractor-tabs';
const DEBOUNCE_MS = 150;

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `tab-${Date.now()}-${_seq}`;
}

function createTab(name: string): PhpLogTab {
  return { id: nextId(), name, input: '', deepParse: true, result: null };
}

function defaultState(): TabsState {
  const first = createTab('日志 1');
  return { tabs: [first], activeId: first.id };
}

/* 取已有页签名字中「日志 N」的最大 N，新建时在其基础上 +1，
   避免刷新后 _seq 归零导致编号重复，以及删除页签后编号跳号。 */
function nextLogNumber(tabs: PhpLogTab[]): number {
  return tabs.reduce((max, t) => {
    const m = /^日志\s*(\d+)$/.exec(t.name);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
}

/* ---------- hook ---------- */

export function usePhpLogTabs() {
  const [state, setState] = useState<TabsState>(() => {
    const saved = loadPageState<TabsState>(STORAGE_KEY);
    if (saved && saved.tabs?.length > 0) return saved;
    return defaultState();
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 防抖持久化
  const persist = useCallback((s: TabsState) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => savePageState(STORAGE_KEY, s), DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    persist(state);
  }, [state, persist]);

  // 清理
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const { tabs, activeId } = state;
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  /* ---- 更新辅助 ---- */

  const updateTabs = useCallback((updater: (prev: TabsState) => TabsState) => {
    setState((prev) => updater(prev));
  }, []);

  /* ---- 操作 ---- */

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
          // 最后一个页签：清空内容而非删除
          const cleared = { ...prev.tabs[0], input: '', result: null, name: '日志 1' };
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

  const updateTabDeepParse = useCallback(
    (id: string, deepParse: boolean) => {
      updateTabs((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === id ? { ...t, deepParse } : t)),
      }));
    },
    [updateTabs],
  );

  const updateTabResult = useCallback(
    (id: string, result: PhpLogExtractResult | null) => {
      updateTabs((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === id ? { ...t, result } : t)),
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
    updateTabDeepParse,
    updateTabResult,
  };
}
