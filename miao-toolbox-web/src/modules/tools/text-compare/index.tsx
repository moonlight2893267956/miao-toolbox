import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { SplitViewIcon } from './icons';
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
  }, [state.leftText, state.rightText, state.ignoreWhitespace, state.structuredDiff, compare, dispatch]);

  const isStacked = state.layout === 'stacked';

  return (
    <>
      <motion.div
        className="tc-toolbar-float"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Toolbar />
      </motion.div>

      <motion.div
        className="tc-stats-float"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <StatCard />
      </motion.div>

      <div className={`tc-panels-container ${isStacked ? 'tc-stacked' : ''}`}>
        {isStacked ? (
          <>
            <div className="tc-panel-zone tc-panel-left tc-full-width">
              <DiffPanel side="left" />
            </div>
            <div className="tc-panel-zone tc-panel-right tc-full-width">
              <DiffPanel side="right" />
            </div>
          </>
        ) : (
          <>
            <div className="tc-panel-zone tc-panel-left">
              <DiffPanel side="left" />
            </div>
            <div className="tc-divider">
              <div className="tc-divider-glow" />
              <div className="tc-divider-line" />
            </div>
            <div className="tc-panel-zone tc-panel-right">
              <DiffPanel side="right" />
            </div>
          </>
        )}
      </div>

      <DiffViewer />
    </>
  );
};

const TextComparePage: React.FC = () => {
  return (
    <DiffProvider>
      <div className="tc-page">
        {/* Background Effects */}
        <div className="tc-bg-effects" aria-hidden="true">
          <div className="tc-bg-gradient-left" />
          <div className="tc-bg-gradient-right" />
          <div className="tc-bg-noise" />
        </div>

        {/* Header */}
        <motion.header 
          className="tc-header"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="tc-header-content">
            <div className="tc-header-badge">
              <SplitViewIcon />
              <span>DIFF TOOL</span>
            </div>
            <h1 className="tc-header-title">
              <span className="tc-title-warm">文本</span>
              <span className="tc-title-divider" />
              <span className="tc-title-cool">对照</span>
            </h1>
            <p className="tc-header-desc">
              行级粒度对比
              <br />
              自动识别代码语言，精准定位每一处差异
            </p>
          </div>
          
          <div className="tc-header-visual">
            <div className="tc-visual-blocks">
              <div className="tc-block tc-block-amber" />
              <div className="tc-block tc-block-cyan" />
            </div>
          </div>
        </motion.header>

        {/* Main Content */}
        <main className="tc-main">
          <DiffContent />
        </main>
      </div>
    </DiffProvider>
  );
};

export default TextComparePage;
