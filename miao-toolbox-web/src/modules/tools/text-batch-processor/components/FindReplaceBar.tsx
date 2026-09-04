import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { TextAreaRef } from 'antd/es/input/TextArea';

interface FindReplaceBarProps {
  textareaRef: React.RefObject<TextAreaRef | null>;
  value: string;
  onChange: (text: string) => void;
}

const MAX_SCAN = 50000;

const FindReplaceBar: React.FC<FindReplaceBarProps> = ({ textareaRef, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'find' | 'replace'>('find');
  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matches, setMatches] = useState<number[]>([]);
  const [currentMatch, setCurrentMatch] = useState(-1);
  const overlayRef = useRef<HTMLPreElement>(null);

  // 同步高亮蒙层滚动位置
  useEffect(() => {
    if (!open) return;
    const el = textareaRef.current?.nativeElement as HTMLTextAreaElement | undefined;
    if (!el) return;
    const handler = () => {
      if (overlayRef.current) {
        overlayRef.current.scrollTop = el.scrollTop;
        overlayRef.current.scrollLeft = el.scrollLeft;
      }
    };
    handler();
    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, [open, textareaRef, value]);

  // 计算高亮 HTML（所有匹配都用 mark 包裹，currentMatch 用 mark--current）
  const renderHighlighted = useCallback(() => {
    const segments: React.ReactNode[] = [];
    let lastIdx = 0;
    matches.forEach((start, i) => {
      if (start > lastIdx) {
        segments.push(value.slice(lastIdx, start));
      }
      const matchText = value.slice(start, start + query.length);
      segments.push(
        <mark
          key={i}
          className={`tbp-find-mark ${i === currentMatch ? 'tbp-find-mark--current' : ''}`}
        >
          {matchText}
        </mark>,
      );
      lastIdx = start + query.length;
    });
    if (lastIdx < value.length) {
      segments.push(value.slice(lastIdx));
    }
    // 末尾补换行符，保证最后一行空白能正确显示蒙层高度
    return <>{segments}\n</>;
  }, [query, matches, currentMatch, value]);

  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusTextarea = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const total = matches.length;

  // 查找：扫描全文收集所有匹配位置
  useEffect(() => {
    if (!query) {
      setMatches([]);
      setCurrentMatch(-1);
      return;
    }
    const positions: number[] = [];
    const searchIn = caseSensitive ? value : value.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    let idx = searchIn.indexOf(needle);
    let guard = 0;
    while (idx !== -1 && guard < MAX_SCAN) {
      positions.push(idx);
      idx = searchIn.indexOf(needle, idx + needle.length);
      guard++;
    }
    setMatches(positions);
    setCurrentMatch(positions.length > 0 ? 0 : -1);
  }, [query, caseSensitive, value]);

  // 选中当前匹配并滚动到可视区（仅在用户显式导航时执行，编辑文本时不跳转）
  useEffect(() => {
    if (currentMatch < 0 || currentMatch >= matches.length) return;
    if (!shouldFocusTextarea.current) return;
    const el = textareaRef.current?.nativeElement as HTMLTextAreaElement | undefined;
    if (!el) return;
    const start = matches[currentMatch];
    const end = start + query.length;
    el.focus({ preventScroll: true });
    shouldFocusTextarea.current = false;
    el.setSelectionRange(start, end);
    const v = valueRef.current;
    const lineNum = v.slice(0, start).split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.scrollTop = Math.max(0, lineNum * lineHeight - el.clientHeight / 3);
  }, [currentMatch, matches, query, textareaRef]);

  const go = useCallback((delta: 1 | -1) => {
    if (total === 0) return;
    shouldFocusTextarea.current = true;
    setCurrentMatch((idx) => {
      const base = idx < 0 ? 0 : idx;
      return (total + base + delta) % total;
    });
  }, [total]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setReplaceText('');
    setMatches([]);
    setCurrentMatch(-1);
  }, []);

  // 替换当前匹配
  const replaceOne = useCallback(() => {
    if (currentMatch < 0 || currentMatch >= matches.length) return;
    const start = matches[currentMatch];
    const newText = value.slice(0, start) + replaceText + value.slice(start + query.length);
    onChange(newText);
  }, [currentMatch, matches, query, replaceText, value, onChange]);

  // 全部替换
  const replaceAll = useCallback(() => {
    if (!query || matches.length === 0) return;
    if (caseSensitive) {
      onChange(value.split(query).join(replaceText));
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      onChange(value.replace(new RegExp(escaped, 'gi'), () => replaceText));
    }
  }, [query, matches, replaceText, value, caseSensitive, onChange]);

  // 快捷键监听
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setOpen(true);
        setMode('find');
        setTimeout(() => findInputRef.current?.focus(), 0);
      } else if (mod && (e.key === 'r' || e.key === 'R' || e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setOpen(true);
        setMode('replace');
        setTimeout(() => findInputRef.current?.focus(), 0);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, close]);

  const handleFindKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) go(-1);
      else go(1);
    }
  };

  const handleReplaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      replaceOne();
    }
  };

  if (!open) {
    // 不卸载，让 useEffect 仍能通知父级 findOpen 变化
    return null;
  }

  return (
    <>
    {/* 仅当有查询词且存在匹配时才挂载高亮蒙层，
        无 query 时 textarea 保持 100% 原生状态（不影响任何输入交互） */}
    {query && matches.length > 0 && (
      <pre
        ref={overlayRef}
        className="tbp-find-overlay"
        aria-hidden
      >
        {renderHighlighted()}
      </pre>
    )}
    <div className="tbp-find-bar">
      <div className="tbp-find-row">
        <input
          ref={findInputRef}
          type="text"
          className="tbp-find-input"
          placeholder="查找…"
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleFindKeyDown}
          autoComplete="off"
        />
        <button
          type="button"
          className={`tbp-find-toggle ${caseSensitive ? 'is-active' : ''}`}
          onClick={() => setCaseSensitive(!caseSensitive)}
          title="区分大小写"
        >
          Aa
        </button>
        <span className="tbp-find-count">
          {total > 0 ? `${currentMatch + 1}/${total}` : '0/0'}
        </span>
        <button
          type="button"
          className="tbp-find-nav"
          onClick={() => go(-1)}
          disabled={total === 0}
          title="上一个 (Shift+Enter)"
        >
          ↑
        </button>
        <button
          type="button"
          className="tbp-find-nav"
          onClick={() => go(1)}
          disabled={total === 0}
          title="下一个 (Enter)"
        >
          ↓
        </button>
        <button
          type="button"
          className="tbp-find-close"
          onClick={close}
          title="关闭 (Esc)"
        >
          ✕
        </button>
      </div>
      {mode === 'replace' && (
        <div className="tbp-find-row">
          <input
            ref={replaceInputRef}
            type="text"
            className="tbp-find-input"
            placeholder="替换为…"
            value={replaceText}
            spellCheck={false}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
            autoComplete="off"
          />
          <button
            type="button"
            className="tbp-find-action"
            onClick={replaceOne}
            disabled={total === 0}
            title="替换当前 (Ctrl+Enter)"
          >
            替换
          </button>
          <button
            type="button"
            className="tbp-find-action tbp-find-action--all"
            onClick={replaceAll}
            disabled={total === 0}
          >
            全部替换
          </button>
        </div>
      )}
    </div>
    </>
  );
};

export default FindReplaceBar;
