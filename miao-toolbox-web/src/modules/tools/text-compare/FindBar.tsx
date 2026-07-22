import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Input, type InputRef } from 'antd';
import { useDiffContext } from './useDiffContext';
import type { DiffPanelHandle } from './DiffPanel';

interface FindBarProps {
  leftRef: React.RefObject<DiffPanelHandle | null>;
  rightRef: React.RefObject<DiffPanelHandle | null>;
  onQueryChange?: (query: string, caseSensitive: boolean, currentIndex: number, startIndex: number) => void;
}

const FindBar: React.FC<FindBarProps> = ({ leftRef, rightRef, onQueryChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [leftCount, setLeftCount] = useState(0);
  const [rightCount, setRightCount] = useState(0);
  const [activeSide, setActiveSide] = useState<'left' | 'right' | null>(null);
  const inputRef = useRef<InputRef>(null);

  const total = leftCount + rightCount;
  const safeIndex = total > 0 && currentIndex >= 0 ? ((currentIndex % total) + total) % total : -1;

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setCurrentIndex(-1);
    setLeftCount(0);
    setRightCount(0);
    setActiveSide(null);
    leftRef.current?.setFindQuery('', false);
    rightRef.current?.setFindQuery('', false);
    leftRef.current?.clearSelection();
    rightRef.current?.clearSelection();
    onQueryChange?.('', false, -1, 0);
  }, [leftRef, rightRef, onQueryChange]);

  // Ctrl+F / Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, close]);

  // Initial focus
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Update editors on query change, then keep marks only on the active side
  useEffect(() => {
    leftRef.current?.setFindQuery(query, caseSensitive);
    rightRef.current?.setFindQuery(query, caseSensitive);
    const lc = leftRef.current?.getMatchCount() ?? 0;
    const rc = rightRef.current?.getMatchCount() ?? 0;
    setLeftCount(lc);
    setRightCount(rc);
    const startIndex = lc + rc;
    const nextIndex = query ? 0 : -1;
    setCurrentIndex(nextIndex);

    if (query && startIndex > 0) {
      if (lc > 0) {
        setActiveSide('left');
        rightRef.current?.setFindQuery('', false);
      } else {
        setActiveSide('right');
        leftRef.current?.setFindQuery('', false);
      }
    } else {
      setActiveSide(null);
    }

    onQueryChange?.(query, caseSensitive, nextIndex, startIndex);
  }, [query, caseSensitive, leftRef, rightRef, onQueryChange]);

  // Scroll active match, switch side when necessary
  useEffect(() => {
    if (currentIndex < 0) return;
    const normalized = total > 0 ? ((currentIndex % total) + total) % total : -1;
    onQueryChange?.(query, caseSensitive, normalized, leftCount + rightCount);

    if (normalized >= 0 && normalized < leftCount) {
      if (activeSide !== 'left') {
        leftRef.current?.setFindQuery(query, caseSensitive);
        rightRef.current?.setFindQuery('', false);
        setActiveSide('left');
      }
      leftRef.current?.focusMatch(normalized);
    } else if (normalized >= 0 && normalized < leftCount + rightCount) {
      if (activeSide !== 'right') {
        rightRef.current?.setFindQuery(query, caseSensitive);
        leftRef.current?.setFindQuery('', false);
        setActiveSide('right');
      }
      rightRef.current?.focusMatch(normalized - leftCount);
    }
  }, [currentIndex, leftCount, rightCount, total, query, caseSensitive, leftRef, rightRef, onQueryChange, activeSide]);

  const go = useCallback((delta: 1 | -1) => {
    if (total === 0) return;
    setCurrentIndex((idx) => (total + (idx < 0 ? 0 : idx) + delta) % total);
  }, [total]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? go(-1) : go(1); }
  };

  if (!open) return null;

  return (
    <div className="tc-find-bar">
      <Input
        ref={inputRef}
        className="tc-find-input"
        placeholder="查找…"
        value={query}
        size="small"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        allowClear
      />
      <button
        type="button"
        className={`tc-find-case-btn${caseSensitive ? ' is-active' : ''}`}
        onClick={() => setCaseSensitive(!caseSensitive)}
        title="区分大小写"
      >Aa</button>
      <span className="tc-find-count">{safeIndex >= 0 ? `${safeIndex + 1}/${total}` : '0/0'}</span>
      <button
        type="button"
        className="tc-pill tc-find-nav-btn"
        onClick={() => go(-1)}
        disabled={total === 0}
      >↑</button>
      <button
        type="button"
        className="tc-pill tc-find-nav-btn"
        onClick={() => go(1)}
        disabled={total === 0}
      >↓</button>
      <button
        type="button"
        className="tc-find-close-btn"
        onClick={close}
        title="关闭 (Esc)"
      >✕</button>
    </div>
  );
};

export default FindBar;
export { FindBar };
export type { FindBarProps };
