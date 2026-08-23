import React, { useMemo, useRef, useState, useCallback } from 'react';
import { validateRegex } from '../utils/regex';
import { JS_FLAGS } from '../data/flags';
import { EXTRACT_PRESETS, PRESET_LINE_CONTAINS } from '../data/presets';
import { CHEAT_SHEET_ENTRIES, CATEGORIES } from '../data/cheatSheetData';
import type { CheatSheetEntry, CheatSheetCategory } from '../data/cheatSheetData';

interface RegexWorkbenchProps {
  pattern: string;
  flags: string;
  onPatternChange: (v: string) => void;
  onFlagsChange: (v: string) => void;
  /** 选中预设时回调；key = 'line-contains' 特殊值 */
  onPresetSelect: (key: string, presetPattern: string, presetFlags: string) => void;
  /** 可选：行包含关键词输入（line-contains 预设激活时） */
  keyword?: string;
  onKeywordChange?: (v: string) => void;
  ariaLabel?: string;
}

const RegexWorkbench: React.FC<RegexWorkbenchProps> = ({
  pattern,
  flags,
  onPatternChange,
  onFlagsChange,
  onPresetSelect,
  keyword,
  onKeywordChange,
  ariaLabel = '正则表达式',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showCheatSheet, setShowCheatSheet] = useState(false);

  const validation = useMemo(() => validateRegex(pattern, flags), [pattern, flags]);
  const invalid = pattern.length > 0 && !validation.valid;

  const isLineContains = pattern === PRESET_LINE_CONTAINS;
  const activePresetKey = EXTRACT_PRESETS.find(
    (p) => p.pattern === pattern && p.flags === flags,
  )?.key;

  const toggleFlag = useCallback(
    (f: string) => {
      const next = flags.includes(f) ? flags.replace(f, '') : flags + f;
      // 保证 g 用于提取场景之外也合法
      onFlagsChange(next);
    },
    [flags, onFlagsChange],
  );

  const insertAtCursor = useCallback(
    (text: string) => {
      const el = inputRef.current;
      if (!el) {
        onPatternChange(pattern + text);
        return;
      }
      const start = el.selectionStart ?? pattern.length;
      const end = el.selectionEnd ?? pattern.length;
      const next = pattern.slice(0, start) + text + pattern.slice(end);
      onPatternChange(next);
      // 光标移到插入文本之后（React 受控下用 rAF 延迟设置）
      const pos = start + text.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    },
    [pattern, onPatternChange],
  );

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

  return (
    <div className="tbp-regex-workbench">
      {/* 正则输入框：/pattern/flags 斜杠定界 */}
      <div className={`tbp-regex-input ${invalid ? 'is-invalid' : ''}`}>
        <span className="tbp-regex-slash" aria-hidden>/</span>
        <input
          ref={inputRef}
          type="text"
          value={pattern}
          onChange={(e) => onPatternChange(e.target.value)}
          placeholder="输入正则表达式，例如 \d+"
          spellCheck={false}
          className="tbp-regex-field"
          aria-label={ariaLabel}
          aria-invalid={invalid}
          autoComplete="off"
        />
        <span className="tbp-regex-slash" aria-hidden>/</span>
        <div className="tbp-regex-flags-inline" role="group" aria-label="正则标志位">
          {JS_FLAGS.map((f) => {
            const active = flags.includes(f.key);
            return (
              <button
                key={f.key}
                type="button"
                className={`tbp-regex-flag-mini ${active ? 'is-active' : ''}`}
                onClick={() => toggleFlag(f.key)}
                aria-pressed={active}
                title={`${f.key} — ${f.name}：${f.desc}`}
              >
                {f.key}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className={`tbp-cheat-toggle ${showCheatSheet ? 'is-active' : ''}`}
          onClick={() => setShowCheatSheet((v) => !v)}
          aria-expanded={showCheatSheet}
          aria-controls="tbp-cheat-sheet"
          title="语法速查表"
        >
          ?
        </button>
      </div>

      {invalid && (
        <div className="tbp-inline-error" role="alert">
          {validation.error}
        </div>
      )}

      {/* 行包含关键词输入 */}
      {isLineContains && (
        <div className="tbp-line-contains">
          <label className="tbp-line-contains-label" htmlFor="tbp-line-keyword">
            包含关键词
          </label>
          <input
            id="tbp-line-keyword"
            type="text"
            value={keyword ?? ''}
            onChange={(e) => onKeywordChange?.(e.target.value)}
            placeholder="输入关键词，提取包含它的整行"
            spellCheck={false}
            className="tbp-line-contains-input"
            autoComplete="off"
          />
        </div>
      )}

      {/* 预设条 */}
      <div className="tbp-preset-bar" role="group" aria-label="提取预设">
        {EXTRACT_PRESETS.map((p) => {
          const active = activePresetKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              className={`tbp-preset-chip ${active ? 'is-active' : ''}`}
              onClick={() => onPresetSelect(p.key, p.pattern, p.flags)}
              title={p.desc}
              aria-pressed={active}
            >
              <span className="tbp-preset-chip-icon" aria-hidden>{p.icon}</span>
              {p.label}
            </button>
          );
        })}
      </div>

      {/* 速查表（可折叠，默认收起） */}
      {showCheatSheet && (
        <div className="tbp-cheat-sheet" id="tbp-cheat-sheet" role="dialog" aria-label="正则语法速查">
          <div className="tbp-cheat-sheet-head">
            <span className="tbp-cheat-sheet-title">JavaScript 语法速查</span>
            <button
              type="button"
              className="tbp-cheat-sheet-close"
              onClick={() => setShowCheatSheet(false)}
              aria-label="关闭速查表"
            >
              ✕
            </button>
          </div>
          <div className="tbp-cheat-sheet-body">
            {grouped.map(({ meta, entries }) => (
              <div key={meta.key} className="tbp-cheat-group">
                <div className="tbp-cheat-group-title">
                  <span className="tbp-cheat-group-icon" aria-hidden>{meta.icon}</span>
                  {meta.label}
                </div>
                <div className="tbp-cheat-group-entries">
                  {entries.map((entry) => (
                    <button
                      key={entry.syntax}
                      type="button"
                      className="tbp-cheat-entry"
                      onClick={() => insertAtCursor(entry.syntax)}
                      title={`${entry.syntax} — ${entry.desc}`}
                    >
                      <code className="tbp-cheat-entry-syntax">{entry.syntax}</code>
                      <span className="tbp-cheat-entry-desc">{entry.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RegexWorkbench;
