import React, { useRef, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as Diff from 'diff';
import { DownOutlined, RightOutlined, ExpandOutlined, CompressOutlined, UpOutlined } from '@ant-design/icons';
import { useDiffContext } from './useDiffContext';
import { diffFullscreenStore } from './diffFullscreenStore';
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

type FullscreenView = 'split' | 'unified';

function useDiffStats(hunks: DiffHunk[]) {
  return React.useMemo(() => {
    let added = 0;
    let removed = 0;
    let modified = 0;
    for (const hunk of hunks) {
      for (const change of hunk.changes ?? []) {
        if (change.type === 'added') added++;
        else if (change.type === 'removed') removed++;
        else if (change.type === 'modified') modified++;
      }
    }
    return { added, removed, modified };
  }, [hunks]);
}

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

function renderModifiedPair(change: DiffChange): { oldNode: React.ReactNode; newNode: React.ReactNode } {
  if (change.type !== 'modified' || change.oldValue == null) {
    return { oldNode: change.value, newNode: change.value };
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
    return {
      oldNode: <span className="tc-fs-diff-old-text">{oldVal}</span>,
      newNode: <span className="tc-fs-diff-new-text">{newVal}</span>,
    };
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

  return {
    oldNode: <span className="tc-fs-diff-old-text">{oldSpans}</span>,
    newNode: <span className="tc-fs-diff-new-text">{newSpans}</span>,
  };
}

const FullscreenDiffBlock: React.FC<{ hunk: DiffHunk; index: number; isActive: boolean }> = ({ hunk, index, isActive }) => {
  if (hunk.type === 'unchanged') return null;

  const changes = hunk.changes ?? [];
  let oldOffset = 0;
  let newOffset = 0;

  return (
    <div className={`tc-fs-diff-block${isActive ? ' is-active' : ''}`} data-hunk-index={index}>
      <div className="tc-fs-diff-grid">
        {/* Original Pane */}
        <div className="tc-fs-pane tc-fs-pane-old">
          <div className="tc-fs-pane-header">
            <span className="tc-fs-pane-dot removed">-</span>
            <span className="tc-fs-pane-label">原始</span>
          </div>
          <div className="tc-fs-pane-body">
            {changes.map((change, i) => {
              if (change.type === 'added') {
                return <div key={i} className="tc-fs-line is-empty" aria-hidden="true" />;
              }
              const pair = change.type === 'modified' ? renderModifiedPair(change) : null;
              const lineNum = String(hunk.oldStart + oldOffset++);
              const lineType = change.type === 'removed' ? 'removed' : 'modified';
              return (
                <div key={i} className={`tc-fs-line ${lineType}`}>
                  <span className="tc-fs-line-num">{lineNum}</span>
                  <span className="tc-fs-line-content">{pair ? pair.oldNode : change.value}</span>
                </div>
              );
            })}
          </div>
        </div>
        {/* Modified Pane */}
        <div className="tc-fs-pane tc-fs-pane-new">
          <div className="tc-fs-pane-header">
            <span className="tc-fs-pane-dot added">+</span>
            <span className="tc-fs-pane-label">修改后</span>
          </div>
          <div className="tc-fs-pane-body">
            {changes.map((change, i) => {
              if (change.type === 'removed') {
                return <div key={i} className="tc-fs-line is-empty" aria-hidden="true" />;
              }
              const pair = change.type === 'modified' ? renderModifiedPair(change) : null;
              const lineNum = String(hunk.newStart + newOffset++);
              const lineType = change.type === 'added' ? 'added' : 'modified';
              return (
                <div key={i} className={`tc-fs-line ${lineType}`}>
                  <span className="tc-fs-line-num">{lineNum}</span>
                  <span className="tc-fs-line-content">{pair ? pair.newNode : change.value}</span>
                </div>
              );
            })}
          </div>
        </div>
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

  // 同步折叠态到 body class：portal 到 body 的 AI 浮窗可据此弱化/避让
  useEffect(() => {
    document.body.classList.toggle('tc-diff-collapsed', collapsed);
    return () => {
      document.body.classList.remove('tc-diff-collapsed');
    };
  }, [collapsed]);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenView, setFullscreenView] = useState<FullscreenView>('split');

  // 同步全屏状态到 store（供 AIAnalysisDock 订阅隐藏）
  useEffect(() => {
    diffFullscreenStore.set(fullscreen);
    if (fullscreen) {
      document.body.classList.add('tc-diff-fullscreen-active');
      return () => document.body.classList.remove('tc-diff-fullscreen-active');
    }
    return undefined;
  }, [fullscreen]);

  // Esc 退出全屏
  useEffect(() => {
    if (!fullscreen) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen]);

  const hunks = state.diffResult?.hunks ?? [];
  const diffHunks = hunks.filter(h => h.type !== 'unchanged');
  const totalCount = diffHunks.length;
  const stats = useDiffStats(hunks);

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
      // 同步折叠态到 body class，供 portal 到 body 的 AI 浮窗等组件弱化响应
      document.body.classList.toggle('tc-diff-collapsed', next);
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

  // 普通态 hunk 列表
  const renderHunks = () => (
    <>
      {hunks.map((hunk, i) => {
        if (hunk.type === 'unchanged') return null;
        const idx = visibleIndex++;
        return <DiffBlock key={i} hunk={hunk} index={idx} isActive={idx === state.currentHunkIndex} />;
      })}
    </>
  );

  // 全屏态 hunk 列表（支持 split / unified 视图切换）
  const renderFullscreenHunks = () => {
    if (fullscreenView === 'unified') {
      return renderHunks();
    }
    let idx = 0;
    return (
      <>
        {hunks.map((hunk, i) => {
          if (hunk.type === 'unchanged') return null;
          const hunkIndex = idx++;
          return (
            <FullscreenDiffBlock
              key={i}
              hunk={hunk}
              index={hunkIndex}
              isActive={hunkIndex === state.currentHunkIndex}
            />
          );
        })}
      </>
    );
  };

  // 全屏态：渲染到 document.body，逃离父级 stacking context，z-index 高于 AI drawer
  const fullscreenOverlay = fullscreen && createPortal(
    <AnimatePresence>
      <motion.div
        className="tc-diff-fullscreen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        role="dialog"
        aria-modal="true"
        aria-label="差异结果全屏视图"
      >
        {/* ---- Top Bar ---- */}
        <header className="tc-fs-topbar">
          <div className="tc-fs-topbar-left">
            <span className="tc-fs-topbar-dot" />
            <span className="tc-fs-topbar-title">差异结果</span>
            <span className="tc-fs-topbar-badge">{totalCount} 处</span>
            <div className="tc-fs-topbar-stats" aria-label="差异统计">
              {stats.removed > 0 && (
                <span className="tc-fs-stat removed">-{stats.removed}</span>
              )}
              {stats.added > 0 && (
                <span className="tc-fs-stat added">+{stats.added}</span>
              )}
              {stats.modified > 0 && (
                <span className="tc-fs-stat modified">~{stats.modified}</span>
              )}
            </div>
            <span className="tc-fs-topbar-hint">
              <span>按</span>
              <span className="tc-fs-topbar-hint-key">Esc</span>
              <span>退出全屏</span>
            </span>
          </div>
          <div className="tc-fs-topbar-right">
            {/* View Mode Toggles */}
            <div className="tc-fs-view-toggle" role="group" aria-label="差异视图">
              <button
                type="button"
                className={`tc-fs-view-btn${fullscreenView === 'split' ? ' is-active' : ''}`}
                onClick={() => setFullscreenView('split')}
                aria-label="分栏视图"
              >
                分栏
              </button>
              <button
                type="button"
                className={`tc-fs-view-btn${fullscreenView === 'unified' ? ' is-active' : ''}`}
                onClick={() => setFullscreenView('unified')}
                aria-label="统一视图"
              >
                统一
              </button>
            </div>
            {/* Navigation Controls */}
            <div className="tc-fs-nav-group">
              <button
                type="button"
                className="tc-fs-nav-btn"
                onClick={handlePrevHunk}
                aria-label="上一处差异"
              >
                <UpOutlined />
              </button>
              <span className="tc-fs-nav-counter">
                {state.currentHunkIndex >= 0 ? `${state.currentHunkIndex + 1}/${totalCount}` : `${totalCount}`}
              </span>
              <button
                type="button"
                className="tc-fs-nav-btn"
                onClick={handleNextHunk}
                aria-label="下一处差异"
              >
                <DownOutlined />
              </button>
            </div>
            {/* Fullscreen toggle */}
            <button
              type="button"
              className="tc-fs-nav-btn"
              onClick={() => setFullscreen(false)}
              aria-label="退出全屏"
              title="退出全屏 (Esc)"
            >
              <CompressOutlined />
            </button>
          </div>
        </header>

        {/* ---- Main Diff Canvas ---- */}
        <main className="tc-fs-canvas">
          <div className="tc-fs-card">
            {/* Diff Sub-header */}
            <div className="tc-fs-card-subheader">
              <span className="tc-fs-card-ref">
                {diffHunks[state.currentHunkIndex >= 0 ? state.currentHunkIndex : 0]
                  ? formatLineRef(diffHunks[state.currentHunkIndex >= 0 ? state.currentHunkIndex : 0])
                  : ''}
              </span>
              <div className="tc-fs-card-type">
                {diffHunks[state.currentHunkIndex >= 0 ? state.currentHunkIndex : 0] && (
                  <span className={`tc-fs-type-badge ${TYPE_CLASS[diffHunks[state.currentHunkIndex].type]}`}>
                    {TYPE_LABEL[diffHunks[state.currentHunkIndex].type]}
                  </span>
                )}
              </div>
            </div>
            {/* Side-by-Side Viewport */}
            <div className="tc-fs-card-viewport">
              {renderFullscreenHunks()}
            </div>
          </div>
        </main>

        {/* ---- Footer ---- */}
        <footer className="tc-fs-footer">
          <div className="tc-fs-footer-hint">
            <span className="tc-fs-footer-key">Esc</span>
            <span>退出全屏</span>
          </div>
        </footer>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );

  return (
    <>
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
            <span className="tc-diff-fullscreen-divider" />
            <button
              type="button"
              className="tc-btn tc-diff-fullscreen-btn"
              onClick={() => setFullscreen(true)}
              aria-label="全屏查看"
              title="全屏查看差异结果"
            >
              <ExpandOutlined />
            </button>
          </div>
        </button>
        {!collapsed && (
          <div className="tc-diff-body">
            {renderHunks()}
          </div>
        )}
      </div>
      {fullscreenOverlay}
    </>
  );
};

export default DiffViewer;
