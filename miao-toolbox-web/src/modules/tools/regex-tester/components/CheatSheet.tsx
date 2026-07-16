import React, { useMemo } from 'react';
import { BookOutlined, CloseOutlined } from '@ant-design/icons';
import { useRegexContext } from '../useRegexContext';
import {
  CHEAT_SHEET_ENTRIES,
  CATEGORIES,
  type CheatSheetEntry,
  type CheatSheetCategory,
} from '../data/cheatSheetData';

/**
 * JS 正则语法速查表（FR-9，2026-07-16 简化）：
 * - 仅展示 JS 语法条目，按类别分组
 * - 点击条目插入到正则输入框光标位置
 */
const CheatSheet: React.FC = () => {
  const { state, insertPattern, toggleCheatSheet } = useRegexContext();
  const { showCheatSheet } = state;

  // 按类别分组（无引擎过滤）
  const grouped = useMemo(() => {
    const map = new Map<CheatSheetCategory, CheatSheetEntry[]>();
    for (const entry of CHEAT_SHEET_ENTRIES) {
      const list = map.get(entry.category) ?? [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return CATEGORIES.filter((c) => map.has(c.key)).map((c) => ({
      meta: c,
      entries: map.get(c.key)!,
    }));
  }, []);

  if (!showCheatSheet) return null;

  return (
    <div className="rt-cheat-sheet" role="dialog" aria-label="正则速查表">
      <div className="rt-cheat-sheet-head">
        <span className="rt-cheat-sheet-title">
          <BookOutlined /> JavaScript 语法速查
        </span>
        <button
          type="button"
          className="rt-cheat-sheet-close"
          onClick={toggleCheatSheet}
          aria-label="关闭速查表"
        >
          <CloseOutlined />
        </button>
      </div>
      <div className="rt-cheat-sheet-body">
        {grouped.map(({ meta, entries }) => (
          <div key={meta.key} className="rt-cheat-group">
            <div className="rt-cheat-group-title">
              <span className="rt-cheat-group-icon">{meta.icon}</span>
              {meta.label}
            </div>
            <div className="rt-cheat-group-entries">
              {entries.map((entry) => (
                <button
                  key={entry.syntax}
                  type="button"
                  className="rt-cheat-entry"
                  onClick={() => insertPattern(entry.syntax)}
                  title={`${entry.syntax} — ${entry.desc}`}
                >
                  <code className="rt-cheat-entry-syntax">{entry.syntax}</code>
                  <span className="rt-cheat-entry-desc">{entry.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CheatSheet;
