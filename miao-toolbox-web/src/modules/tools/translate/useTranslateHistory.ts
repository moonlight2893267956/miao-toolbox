/**
 * 翻译历史 Hook（FR-21）
 *
 * 将翻译记录持久化到 localStorage（复用 crypto `useHistory` 模式，STORAGE_KEY 改为
 * `translate-history`）。每条记录含原文/译文/源目标语种/时间/收藏标记。
 * 纯前端实现，不落后端（见架构文档 FR-to-File Mapping）。
 *
 * 说明：翻译面板与历史面板是两个独立挂载的组件，各自持有一份 state；
 * 翻译成功时 `add` 仅写入 localStorage，切到历史 Tab 重新挂载时读到最新记录，
 * 历史面板内删除/收藏操作由自身 state 即时刷新。
 */

import { useCallback, useState } from 'react';

export interface TranslateHistoryEntry {
  id: string;
  timestamp: number;
  /** 原文 */
  source: string;
  /** 译文 */
  target: string;
  /** 源语言码（可能 auto） */
  from: string;
  /** 目标语言码 */
  to: string;
  /** 是否收藏 */
  favorite: boolean;
}

const STORAGE_KEY = 'translate-history';
const MAX_ENTRIES = 50;

function loadHistory(): TranslateHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TranslateHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(entries: TranslateHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function useTranslateHistory() {
  const [list, setList] = useState<TranslateHistoryEntry[]>(() => loadHistory());

  const add = useCallback(
    (entry: { source: string; target: string; from: string; to: string }) => {
      const full: TranslateHistoryEntry = {
        ...entry,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        timestamp: Date.now(),
        favorite: false,
      };
      setList((prev) => {
        const next = [full, ...prev].slice(0, MAX_ENTRIES);
        persist(next);
        return next;
      });
    },
    [],
  );

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setList([]);
  }, []);

  const remove = useCallback((id: string) => {
    setList((prev) => {
      const next = prev.filter((e) => e.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setList((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, favorite: !e.favorite } : e));
      persist(next);
      return next;
    });
  }, []);

  return { list, add, clear, remove, toggleFavorite };
}
