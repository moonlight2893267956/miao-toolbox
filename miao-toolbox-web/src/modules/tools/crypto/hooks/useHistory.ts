/**
 * 操作历史 Hook
 *
 * 将操作记录持久化到 localStorage，提供 add / clear / list 操作。
 */

import { useCallback } from 'react';
import type { HistoryEntry } from '../types';

const STORAGE_KEY = 'crypto-tool-history';
const MAX_ENTRIES = 20;

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function useHistory() {
  const add = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    const full: HistoryEntry = {
      ...entry,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
    };
    const list = loadHistory();
    list.unshift(full);
    saveHistory(list);
    return full;
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const list = loadHistory();

  return { add, clear, list };
}
