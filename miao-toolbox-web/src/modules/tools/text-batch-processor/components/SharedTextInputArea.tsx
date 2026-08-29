import React, { useCallback, useRef, useEffect, useState } from 'react';
import { Input, Alert } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { TbpAction, TbpTabId } from '../types';
import { TBP_TABS } from '../types';
import FindReplaceBar from './FindReplaceBar';

const MAX_INPUT_SIZE = 1_048_576;

export interface HighlightRange {
  start: number;
  end: number;
}

interface SharedTextInputAreaProps {
  inputText: string;
  dispatch: React.Dispatch<TbpAction>;
  highlightRange?: HighlightRange | null;
  activeOp: TbpTabId | null;
  onTabToggle: (key: TbpTabId) => void;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

const SharedTextInputArea: React.FC<SharedTextInputAreaProps> = ({
  inputText,
  dispatch,
  highlightRange,
  activeOp,
  onTabToggle,
}) => {
  const [stats, setStats] = useState({ chars: 0, lines: 0 });
  const rafRef = useRef<number | null>(null);
  const textareaRef = useRef<TextAreaRef>(null);

  // ── Undo / Redo 历史栈 ──
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const lastSnapshotRef = useRef(inputText);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUndoRedoRef = useRef(false);

  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      lastSnapshotRef.current = inputText;
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (lastSnapshotRef.current !== inputText) {
        undoStack.current.push(lastSnapshotRef.current);
        redoStack.current = [];
        if (undoStack.current.length > 100) undoStack.current.shift();
        lastSnapshotRef.current = inputText;
      }
    }, 500);
  }, [inputText]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    redoStack.current.push(lastSnapshotRef.current);
    isUndoRedoRef.current = true;
    lastSnapshotRef.current = prev;
    dispatch({ type: 'TBP_SET_INPUT', payload: prev });
  }, [dispatch]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(lastSnapshotRef.current);
    isUndoRedoRef.current = true;
    lastSnapshotRef.current = next;
    dispatch({ type: 'TBP_SET_INPUT', payload: next });
  }, [dispatch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const el = textareaRef.current?.nativeElement;
      if (document.activeElement !== el) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setStats({
        chars: inputText.length,
        lines: inputText === '' ? 0 : inputText.split('\n').length,
      });
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [inputText]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      dispatch({ type: 'TBP_SET_INPUT', payload: e.target.value });
    },
    [dispatch],
  );

  useEffect(() => {
    if (!highlightRange) return;
    const el = textareaRef.current?.nativeElement as HTMLTextAreaElement | undefined;
    if (!el) return;
    const { start, end } = highlightRange;
    if (start < 0 || end > inputText.length || start >= end) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(start, end);
    const lineNum = inputText.slice(0, start).split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.scrollTop = Math.max(0, lineNum * lineHeight - el.clientHeight / 3);
  }, [highlightRange, inputText]);

  const isOverLimit = inputText.length > MAX_INPUT_SIZE;

  return (
    <div className="tbp-input-panel">
      <div className="tbp-panel-head">
        <span className="tbp-input-rule" aria-hidden />
        <div className="tbp-panel-head-info">
          <span className="tbp-panel-label">输入文本</span>
          <span className="tbp-input-stats">
            {formatNumber(stats.chars)}<span className="tbp-input-stats-unit">字符</span>
            <span className="tbp-input-stats-sep">/</span>
            {formatNumber(stats.lines)}<span className="tbp-input-stats-unit">行</span>
          </span>
        </div>
        <div className="tbp-tab-strip">
          {TBP_TABS.map((tab, idx) => (
            <button
              key={tab.key}
              type="button"
              className={`tbp-tab-chip ${activeOp === tab.key ? 'active' : ''}`}
              onClick={() => onTabToggle(tab.key)}
              title={tab.hint}
            >
              <span className="tbp-tab-chip-num">{String(idx + 1).padStart(2, '0')}</span>
              <span className="tbp-tab-chip-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="tbp-textarea-wrap">
        <FindReplaceBar
          textareaRef={textareaRef}
          value={inputText}
          onChange={(text) => dispatch({ type: 'TBP_SET_INPUT', payload: text })}
        />
        <Input.TextArea
          ref={textareaRef}
          className="tbp-textarea"
          value={inputText}
          onChange={handleChange}
          spellCheck={false}
          placeholder="粘贴或输入待处理文本…"
        />
      </div>
      {isOverLimit && (
        <Alert
          type="warning"
          message="文本过大（> 1MB），建议拆分；大文件支持开发中"
          showIcon
          className="tbp-input-alert"
        />
      )}
    </div>
  );
};

export default SharedTextInputArea;
