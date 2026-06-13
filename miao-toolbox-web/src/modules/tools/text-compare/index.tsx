import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CodeOutlined } from '@ant-design/icons';
import { DiffProvider } from './DiffProvider';
import { useDiffContext } from './useDiffContext';
import Toolbar from './Toolbar';
import DiffPanel from './DiffPanel';
import StatusBar from './StatusBar';
import SideBySideDiffView from './SideBySideDiffView';
import { useDiffApi } from './useDiffApi';
import type { EditorView } from '@codemirror/view';
import './diff-tool.css';

const DiffContent: React.FC = () => {
  const { state, dispatch, toggleHunkReviewed } = useDiffContext();
  const { compare } = useDiffApi();
  const debounceRef = useRef<number | null>(null);
  const leftEditorRef = useRef<{ view: EditorView | null }>(null);
  const rightEditorRef = useRef<{ view: EditorView | null }>(null);
  // 当前最上方可见 hunk index（用于 Space 快捷键）
  const [currentHunkIndex, setCurrentHunkIndex] = useState(-1);

  const onLeftViewReady = useCallback((_view: EditorView, container: HTMLDivElement) => {
    void container;
  }, []);
  const onRightViewReady = useCallback((_view: EditorView, container: HTMLDivElement) => {
    void container;
  }, []);

  // 全局 Space 快捷键：焦点在编辑器外时切换当前 hunk 勾选
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      // 不响应编辑器内按键（CM 内输入空格正常）
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (currentHunkIndex < 0) return;
      e.preventDefault();
      toggleHunkReviewed(currentHunkIndex);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentHunkIndex, toggleHunkReviewed]);

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
        // 默认选中第一个非 unchanged hunk，不必等 scroll 触发
        const firstHunk = result?.hunks?.findIndex((h: { type: string }) => h.type !== 'unchanged') ?? -1;
        setCurrentHunkIndex(firstHunk >= 0 ? firstHunk : -1);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } } };
        dispatch({ type: 'SET_ERROR', payload: err.response?.data?.message || '对比失败' });
      }
    }, 500);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [state.leftText, state.rightText, state.granularity, state.ignoreWhitespace, state.structuredDiff, compare, dispatch]);

  const isSplit = state.layout === 'split';
  const statusBar = (
    <StatusBar
      hunks={state.diffResult?.hunks ?? []}
      loading={state.loading}
      error={state.error}
      hasInput={Boolean(state.leftText || state.rightText)}
      reviewedHunkIds={state.reviewedHunkIds}
    />
  );

  const handleFileLoaded = useCallback((side: 'left' | 'right', file: { name: string; content: string }) => {
    dispatch({
      type: side === 'left' ? 'SET_LEFT_FILE' : 'SET_RIGHT_FILE',
      payload: file,
    });
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const languageMap: Record<string, string> = {
      json: 'json', yaml: 'yaml', yml: 'yaml', java: 'java', py: 'python',
      js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
      css: 'css', html: 'html', xml: 'xml', md: 'markdown', sql: 'sql', sh: 'bash',
    };
    dispatch({ type: 'SET_LANGUAGE', payload: languageMap[ext] ?? null });
  }, [dispatch]);

  return (
    <>
      <Toolbar rightSlot={statusBar} />

      {isSplit ? (
        <SideBySideDiffView
          leftText={state.leftText}
          rightText={state.rightText}
          leftLabel={state.leftLabel}
          rightLabel={state.rightLabel}
          hunks={state.diffResult?.hunks ?? []}
          reviewedHunkIds={state.reviewedHunkIds}
          onLeftChange={(text) => dispatch({ type: 'SET_LEFT', payload: text })}
          onRightChange={(text) => dispatch({ type: 'SET_RIGHT', payload: text })}
          onToggleHunkReviewed={toggleHunkReviewed}
          onCurrentHunkChange={setCurrentHunkIndex}
          onFileLoaded={handleFileLoaded}
          showLineNumbers={state.showLineNumbers}
        />
      ) : (
        <div className="dt-panels-stacked">
          <DiffPanel
            side="left"
            editorRef={leftEditorRef}
            onViewReady={onLeftViewReady}
            reviewedHunkIds={state.reviewedHunkIds}
            onToggleHunkReviewed={toggleHunkReviewed}
          />
          <div style={{ marginTop: 12 }}>
            <DiffPanel
              side="right"
              editorRef={rightEditorRef}
              onViewReady={onRightViewReady}
              reviewedHunkIds={state.reviewedHunkIds}
              onToggleHunkReviewed={toggleHunkReviewed}
            />
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
