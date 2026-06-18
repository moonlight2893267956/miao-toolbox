import React, { useRef, useCallback, useEffect } from 'react';
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
  if (change.type === 'modified' && change.oldValue != null) {
    const oldWords = change.oldValue.split(/(\s+)/);
    const newWords = change.value.split(/(\s+)/);
    const spans: React.ReactNode[] = [];
    const maxLen = Math.max(oldWords.length, newWords.length);
    let keyIdx = 0;
    for (let i = 0; i < maxLen; i++) {
      const oldW = oldWords[i] ?? '';
      const newW = newWords[i] ?? '';
      if (oldW !== newW) {
        spans.push(<span key={keyIdx++} className="tc-diff-highlight">{newW}</span>);
      } else {
        spans.push(<span key={keyIdx++}>{newW}</span>);
      }
    }
    return spans;
  }
  return change.value;
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
    <div className="tc-diff-viewer" ref={viewerRef}>
      <div className="tc-diff-header">
        <span>差异结果 · 共 {totalCount} 处</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
      </div>
      <div className="tc-diff-body">
        {hunks.map((hunk, i) => {
          if (hunk.type === 'unchanged') return null;
          const idx = visibleIndex++;
          return <DiffBlock key={i} hunk={hunk} index={idx} isActive={idx === state.currentHunkIndex} />;
        })}
      </div>
    </div>
  );
};

export default DiffViewer;
