import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CodeOutlined } from '@ant-design/icons';
import { DiffProvider } from './DiffProvider';
import { useDiffContext } from './useDiffContext';
import Toolbar from './Toolbar';
import DiffPanel from './DiffPanel';
import StatCard from './StatCard';
import { useDiffApi } from './useDiffApi';
import type { EditorView } from '@codemirror/view';
import './diff-tool.css';

const DiffContent: React.FC = () => {
  const { state, dispatch } = useDiffContext();
  const { compare } = useDiffApi();
  const debounceRef = useRef<number | null>(null);
  const leftEditorRef = useRef<{ view: EditorView | null }>(null);
  const rightEditorRef = useRef<{ view: EditorView | null }>(null);
  const leftContainerRef = useRef<HTMLDivElement | null>(null);
  const rightContainerRef = useRef<HTMLDivElement | null>(null);
  const suppressScrollSyncRef = useRef<'left' | 'right' | null>(null);
  // Bumped whenever a view is (re)created, so the sync effect re-runs even when
  // state.layout / state.diffResult are unchanged (e.g. language change).
  const [leftViewVersion, setLeftViewVersion] = useState(0);
  const [rightViewVersion, setRightViewVersion] = useState(0);

  const onLeftViewReady = useCallback((_view: EditorView, container: HTMLDivElement) => {
    leftContainerRef.current = container;
    setLeftViewVersion((v) => v + 1);
  }, []);
  const onRightViewReady = useCallback((_view: EditorView, container: HTMLDivElement) => {
    rightContainerRef.current = container;
    setRightViewVersion((v) => v + 1);
  }, []);

  // Re-attach scroll sync whenever either view changes (e.g. language change
  // rebuilds the editor). The view ref's .view getter always returns the latest
  // view, and the effect re-runs when each onViewReady callback fires.
  //
  // We listen on the OUTER container div (the one with overflow: auto) rather
  // than CM's .cm-scroller, because the container is the actual scroll host
  // (cm-scroller is sized to content and doesn't scroll).
  useEffect(() => {
    if (state.layout !== 'split') return;
    const leftEl = leftContainerRef.current;
    const rightEl = rightContainerRef.current;
    if (!leftEl || !rightEl) return;

    const cleanups: Array<() => void> = [];

    const sync = (src: HTMLElement, dst: HTMLElement, side: 'left' | 'right') => {
      const handler = () => {
        if (suppressScrollSyncRef.current === side) return;
        const max = src.scrollHeight - src.clientHeight;
        if (max > 0) {
          suppressScrollSyncRef.current = side;
          const ratio = src.scrollTop / max;
          const dstMax = dst.scrollHeight - dst.clientHeight;
          dst.scrollTop = ratio * dstMax;
          requestAnimationFrame(() => { suppressScrollSyncRef.current = null; });
        }
      };
      src.addEventListener('scroll', handler);
      cleanups.push(() => src.removeEventListener('scroll', handler));
    };

    sync(leftEl, rightEl, 'left');
    sync(rightEl, leftEl, 'right');

    return () => {
      cleanups.forEach((c) => c());
    };
  }, [state.layout, leftViewVersion, rightViewVersion, state.diffResult]);

  useEffect(() => {
    const hasContent = state.leftText || state.rightText;
    if (!hasContent) {
      dispatch({ type: 'SET_DIFF_RESULT', payload: null });
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        const result = await compare({
          left: state.leftText, right: state.rightText,
          granularity: state.granularity,
          ignoreWhitespace: state.ignoreWhitespace,
          structuredDiff: state.structuredDiff,
        });
        dispatch({ type: 'SET_DIFF_RESULT', payload: result });
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } } };
        dispatch({ type: 'SET_ERROR', payload: err.response?.data?.message || '对比失败' });
      }
    }, 500);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [state.leftText, state.rightText, state.granularity, state.ignoreWhitespace, state.structuredDiff, compare, dispatch]);

  const isSplit = state.layout === 'split';
  const hasText = Boolean(state.leftText || state.rightText);
  const hasResult = Boolean(state.diffResult);
  const hasDiff = hasResult && (state.diffResult?.hunks ?? []).some(h => h.type !== 'unchanged');
  const showLoading = state.loading;
  const showError = Boolean(state.error);
  const showEmpty = hasText && hasResult && !hasDiff && !showLoading && !showError;

  return (
    <>
      <Toolbar />

      <div className="dt-meta-row">
        <StatCard />
      </div>

      {showLoading && (
        <div className="dt-status-banner is-loading">
          <span>对比中…</span>
        </div>
      )}
      {showError && (
        <div className="dt-status-banner is-error">
          <span>对比失败：{state.error}</span>
        </div>
      )}
      {showEmpty && (
        <div className="dt-status-banner is-empty">
          <span>两侧内容一致，未发现差异</span>
        </div>
      )}

      {isSplit ? (
        <div className="dt-panels">
          <DiffPanel side="left" editorRef={leftEditorRef} onViewReady={onLeftViewReady} />
          <DiffPanel side="right" editorRef={rightEditorRef} onViewReady={onRightViewReady} />
        </div>
      ) : (
        <div className="dt-panels-stacked">
          <DiffPanel side="left" editorRef={leftEditorRef} onViewReady={onLeftViewReady} />
          <div style={{ marginTop: 12 }}>
            <DiffPanel side="right" editorRef={rightEditorRef} onViewReady={onRightViewReady} />
          </div>
        </div>
      )}
    </>
  );
};

const TextComparePage: React.FC = () => {
  return (
    <DiffProvider>
      <div className="miao-page dt-page">
        <header className="dt-page-header">
          <div>
            <div className="dt-page-eyebrow">工具 · 文本对照</div>
            <h1 className="dt-page-title">文本对照</h1>
            <p className="dt-page-description">
              粘贴或上传两段文本，支持字符级、词级、行级粒度对比，自动识别语言类型。
            </p>
          </div>
          <span className="dt-page-badge"><CodeOutlined /> Dark Developer's Studio</span>
        </header>
        <DiffContent />
      </div>
    </DiffProvider>
  );
};

export default TextComparePage;
