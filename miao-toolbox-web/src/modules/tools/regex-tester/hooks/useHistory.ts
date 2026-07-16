import { useState, useCallback, useEffect } from 'react';

/** 历史条目 */
export interface HistoryEntry {
  /** 正则 */
  pattern: string;
  /** 标志位 */
  flags: string;
  /** 测试文本（截断到 200 字符） */
  testText: string;
  /** 时间戳 */
  ts: number;
}

const STORAGE_KEY = 'miao-regex-history';
const MAX_ENTRIES = 50;
const TEXT_TRUNCATE = 200;

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage 满了，静默失败
  }
}

/** 匹配历史 hook（FR-10） */
export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(load);

  // 写入 localStorage
  useEffect(() => {
    save(entries);
  }, [entries]);

  /** 添加一条历史（去重：相同 pattern+flags+testText 只更新时间戳） */
  const addEntry = useCallback((pattern: string, flags: string, testText: string) => {
    if (!pattern || !testText) return;
    const truncated = testText.length > TEXT_TRUNCATE ? testText.slice(0, TEXT_TRUNCATE) + '…' : testText;
    setEntries((prev) => {
      const idx = prev.findIndex(
        (e) => e.pattern === pattern && e.flags === flags && e.testText === truncated,
      );
      if (idx >= 0) {
        // 更新时间戳，移到最前
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ts: Date.now() };
        const [item] = updated.splice(idx, 1);
        return [item, ...updated];
      }
      // 新增
      const next = [{ pattern, flags, testText: truncated, ts: Date.now() }, ...prev];
      return next.slice(0, MAX_ENTRIES);
    });
  }, []);

  /** 删除一条历史 */
  const removeEntry = useCallback((idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  /** 清空历史 */
  const clearEntries = useCallback(() => {
    setEntries([]);
  }, []);

  return { entries, addEntry, removeEntry, clearEntries };
}
