import React, { useRef, useCallback, useEffect, useState } from 'react';
import * as Diff from 'diff';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { useDiffContext } from './useDiffContext';
import type { DiffHunk, DiffChange, HunkType } from './types';

const TYPE_LABEL: Record<HunkType, string> = {
  added: '新增',
  removed: '删除',
  modified: '修改',
  unchanged: '',
};

const TYPE_CLASS: Record<HunkType, string> = {
  added: 'added',
  removed: 'removed',
  modified: 'modified',
  unchanged: '',
};

const MARKER: Record<string, string> = {
  added: '+',
  removed: '-',
  modified: '~',
  equal: ' ',
};

function formatLineRef(hunk: DiffHunk): string {
  if (hunk.type === 'added') return `—↔第${hunk.newStart}行`;
  if (hunk.type === 'removed') return `第${hunk.oldStart}行↔—`;
  return `第${hunk.oldStart}行↔第${hunk.newStart}行`;
}

function renderChangeContent(change: DiffChange): React.ReactNode {
  if (change.type !== 'modified' || change.oldValue == null) {
    return change.value;
  }

  const oldVal = change.oldValue;
  const newVal = change.value;

  const wordDiff = Diff.diffWords(oldVal, newVal);
  const changedLen = wordDiff
    .filter((p) => p.added || p.removed)
    .reduce((s, p) => s + p.value.length, 0);
  const totalLen = Math.max(oldVal.length + newVal.length, 1);
  const diffRatio = changedLen / totalLen;

  if (diffRatio > 0.8) {
    return (
      <>
        <div className="tc-diff-old-line">
          <span className="tc-diff-marker-inline">-</span>
          <span className="tc-diff-old-text">{oldVal}</span>
        </div>
        <div className="tc-diff-new-line">
          <span className="tc-diff-marker-inline">+</span>
          <span className="tc-diff-new-text">{newVal}</span>
        </div>
      </>
    );
  }

  const oldSpans: React.ReactNode[] = [];
  const newSpans: React.ReactNode[] = [];
  let keyIdx = 0;

  for (const part of wordDiff) {
    if (part.removed) {
      oldSpans.push(
        <span key={keyIdx++} className="tc-diff-del">{part.value}</span>,
      );
    } else if (part.added) {
      newSpans.push(
        <span key={keyIdx++} className="tc-diff-add">{part.value}</span>,
      );
    } else {
      oldSpans.push(<span key={keyIdx++}>{part.value}</span>);
      newSpans.push(<span key={keyIdx++}>{part.value}</span>);
    }
  }

  return (
    <>
      <div className="tc-diff-old-line">
        <span className="tc-diff-marker-inline">-</span>
        <span className="tc-diff-old-text">{oldSpans}</span>
      </div>
      <div className="tc-diff-new-line">
        <span className="tc-diff-marker-inline">+</span>
        <span className="tc-diff-new-text">{newSpans}</span>
      </div>
    </>
  );
}

const DiffBlock: React.FC<{ hunk: DiffHunk; index: number; isActive: boolean }> = ({ hunk, index, isActive }) => {
  if (hunk.type === 'unchanged') return null;

  const changes = hunk.changes ?? [];
  let leftOffset = 0;
  let rightOffset = 0;

  return (
    <div className={`tc-diff-block${isActive ? ' is-active' : ''}`} data-hunk-index={index}>
      <div className="tc-diff-block-header">
        <span>{formatLineRef(hunk)}</span>
        <span className={`tc-diff-type ${TYPE_CLASS[hunk.type]}`}>{TYPE_LABEL[hunk.type]}</span>
      </div>
      <div>
        {changes.map((change, i) => {
          const leftNum = change.type === 'added' ? '' : String(hunk.oldStart + leftOffset++);
          const rightNum = change.type === 'removed' ? '' : String(hunk.newStart + rightOffset++);
          const changeType = change.type === 'modified' ? 'modified' : change.type;
          return (
            <div key={i} className={`tc-diff-line ${TYPE_CLASS[changeType as HunkType] ?? ''}`}>
              <span className="tc-diff-line-num">{leftNum}</span>
              <span className="tc-diff-line-num right">{rightNum}</span>
              <span className="tc-diff-marker">{MARKER[change.type]}</span>
              <span className="tc-diff-content">{renderChangeContent(change)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const DiffViewer: React.FC = () => {
  const { state, dispatch } = useDiffContext();
  const viewerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('miao-text-compare-diff-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const hunks = state.diffResult?.hunks ?? [];
  const diffHunks = hunks.filter(h => h.type !== 'unchanged');
  const totalCount = diffHunks.length;

  const handlePrevHunk = useCallback(() => {
    if (totalCount === 0) return;
    const next = state.currentHunkIndex <= 0 ? totalCount - 1 : state.currentHunkIndex - 1;
    dispatch({ type: 'SET_CURRENT_HUNK_INDEX', payload: next });
    dispatch({ type: 'GO_TO_HUNK', payload: next });
  }, [state.currentHunkIndex, totalCount, dispatch]);

  const handleNextHunk = useCallback(() => {
    if (totalCount === 0) return;
    const next = state.currentHunkIndex >= totalCount - 1 ? 0 : state.currentHunkIndex + 1;
    dispatch({ type: 'SET_CURRENT_HUNK_INDEX', payload: next });
    dispatch({ type: 'GO_TO_HUNK', payload: next });
  }, [state.currentHunkIndex, totalCount, dispatch]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('miao-text-compare-diff-collapsed', String(next));
      } catch {
        // localStorage 不可用时忽略
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (state.goToHunk == null || !viewerRef.current) return;
    const target = viewerRef.current.querySelector(`[data-hunk-index="${state.goToHunk}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    dispatch({ type: 'GO_TO_HUNK', payload: null });
  }, [state.goToHunk, dispatch]);

  if (state.loading) {
    return (
      <div className="tc-diff-viewer">
        <div className="tc-diff-header">对比中...</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="tc-diff-viewer">
        <div className="tc-diff-header" style={{ color: 'var(--tc-accent-removed)' }}>
          对比失败：{state.error}
        </div>
      </div>
    );
  }

  if (!state.diffResult) return null;

  if (totalCount === 0) {
    const hasInput = state.leftText || state.rightText;
    if (hasInput) {
      return (
        <div className="tc-diff-viewer">
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--tc-text-secondary)' }}>
            无差异
          </div>
        </div>
      );
    }
    return null;
  }

  let visibleIndex = 0;
  return (
    <div className={`tc-diff-viewer${collapsed ? ' is-collapsed' : ''}`} ref={viewerRef}>
      <button
        type="button"
        className="tc-diff-header"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? '展开差异结果' : '折叠差异结果'}
      >
        <span className="tc-diff-title">
          {collapsed ? <RightOutlined style={{ marginRight: 8 }} /> : <DownOutlined style={{ marginRight: 8 }} />}
          差异结果 · 共 {totalCount} 处
        </span>
        <div className="tc-diff-nav" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="tc-btn"
            onClick={handlePrevHunk}
            aria-label="上一处差异"
          >↑</button>
          <span style={{ fontFamily: 'var(--tc-font-mono)', fontSize: 13 }}>
            {state.currentHunkIndex >= 0 ? `${state.currentHunkIndex + 1}/${totalCount}` : `${totalCount}`}
          </span>
          <button
            type="button"
            className="tc-btn"
            onClick={handleNextHunk}
            aria-label="下一处差异"
          >↓</button>
        </div>
      </button>
      {!collapsed && (
        <div className="tc-diff-body">
          {hunks.map((hunk, i) => {
            if (hunk.type === 'unchanged') return null;
            const idx = visibleIndex++;
            return <DiffBlock key={i} hunk={hunk} index={idx} isActive={idx === state.currentHunkIndex} />;
          })}
        </div>
      )}
    </div>
  );
};

export default DiffViewer;
