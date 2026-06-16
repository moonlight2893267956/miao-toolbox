import React, { useEffect, useRef } from 'react';
import { CodeOutlined } from '@ant-design/icons';
import { DiffProvider } from './DiffProvider';
import { useDiffContext } from './useDiffContext';
import Toolbar from './Toolbar';
import DiffPanel from './DiffPanel';
import StatCard from './StatCard';
import DiffViewer from './DiffViewer';
import { useDiffApi } from './useDiffApi';
import './diff-tool.css';

const DiffContent: React.FC = () => {
  const { state, dispatch } = useDiffContext();
  const { compare } = useDiffApi();
  const debounceRef = useRef<number | null>(null);

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
        const firstIdx = result?.hunks?.findIndex((h: { type: string }) => h.type !== 'unchanged') ?? -1;
        dispatch({ type: 'SET_CURRENT_HUNK_INDEX', payload: firstIdx >= 0 ? firstIdx : -1 });
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } } };
        dispatch({ type: 'SET_ERROR', payload: err.response?.data?.message || '对比失败' });
      }
    }, 500);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [state.leftText, state.rightText, state.granularity, state.ignoreWhitespace, state.structuredDiff, compare, dispatch]);

  const isSplit = state.layout === 'split';
  const isStacked = state.layout === 'stacked';

  return (
    <>
      <Toolbar />

      <div className="dt-meta-row">
        <StatCard />
      </div>

      {isSplit ? (
        <div className="dt-panels">
          <DiffPanel side="left" />
          <DiffPanel side="right" />
        </div>
      ) : isStacked ? (
        <div className="dt-panels-stacked">
          <DiffPanel side="left" />
          <div style={{ marginTop: 12 }}>
            <DiffPanel side="right" />
          </div>
        </div>
      ) : (
        <div className="dt-panels">
          <DiffPanel side="left" />
          <DiffPanel side="right" />
        </div>
      )}

      <DiffViewer />
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
          <span className="dt-page-badge"><CodeOutlined /> Dark Developer&apos;s Studio</span>
        </header>
        <DiffContent />
      </div>
    </DiffProvider>
  );
};

export default TextComparePage;
