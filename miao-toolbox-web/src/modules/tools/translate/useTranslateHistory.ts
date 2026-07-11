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
  /** 来源：文本翻译 / 图片翻译 / 语音翻译（旧记录缺省视为 text） */
  mode?: 'text' | 'image' | 'voice';
}

const STORAGE_KEY = 'translate-history';
const MAX_ENTRIES = 50;

function loadHistory(): TranslateHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as TranslateHistoryEntry[]) : [];
    if (!Array.isArray(parsed)) return [];
    // 清洗旧脏数据：缺少 source/target 字符串的条目会导致渲染崩溃，直接丢弃
    return parsed.filter(
      (e): e is TranslateHistoryEntry =>
        !!e && typeof e.source === 'string' && typeof e.target === 'string',
    );
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
    (
      entry: {
        source: string;
        target: string;
        from: string;
        to: string;
        mode?: 'text' | 'image' | 'voice';
      },
    ) => {
      const full: TranslateHistoryEntry = {
        ...entry,
        mode: entry.mode ?? 'text',
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        timestamp: Date.now(),
        favorite: false,
      };
      // 关键修复：先同步写 localStorage，再更新 React state。
      // 旧写法把 persist 放在 setList 更新器内，React 18 批处理可能导致
      // 切换 Tab 时 persist 尚未执行，历史面板读不到新记录。
      const current = loadHistory();
      const next = [full, ...current].slice(0, MAX_ENTRIES);
      persist(next);
      setList(next);
    },
    [],
  );

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setList([]);
  }, []);

  const remove = useCallback((id: string) => {
    const current = loadHistory();
    const next = current.filter((e) => e.id !== id);
    persist(next);
    setList(next);
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    const current = loadHistory();
    const next = current.map((e) => (e.id === id ? { ...e, favorite: !e.favorite } : e));
    persist(next);
    setList(next);
  }, []);

  return { list, add, clear, remove, toggleFavorite };
}
