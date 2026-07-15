import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { DiffOutlined } from '@ant-design/icons';
import { DiffProvider } from './DiffProvider';
import { useDiffContext } from './useDiffContext';
import Toolbar from './Toolbar';
import DiffPanel from './DiffPanel';
import StatCard from './StatCard';
import DiffViewer from './DiffViewer';
import AIAnalysisDock from './AIAnalysisDock';
import './diff-tool.css';

const DiffContent: React.FC = () => {
  const { state, runCompare } = useDiffContext();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (state.loading) return;
      if (!state.leftText && !state.rightText) return;
      runCompare();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [runCompare, state.loading, state.leftText, state.rightText]);

  const isStacked = state.layout === 'stacked';

  return (
    <>
      <motion.div
        className="tc-command-bar"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="tc-toolbar-float">
          <Toolbar onCompare={runCompare} />
        </div>
        <div className="tc-stats-float">
          <StatCard />
        </div>
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
      <AIAnalysisDock />
    </>
  );
};

const TextComparePage: React.FC = () => {
  return (
    <DiffProvider>
      <div className="tc-page">
        <header className="tc-header">
          <div className="tc-header-inner">
            <div className="tc-header-icon">
              <DiffOutlined />
            </div>
            <div className="tc-header-text">
              <h2>文本对照</h2>
              <div className="tc-header-subtitle">
                <span className="tc-header-dot" />
                差异对比 · 编辑同步 · AI 智能分析
              </div>
            </div>
          </div>
        </header>
        <main className="tc-main">
          <DiffContent />
        </main>
      </div>
    </DiffProvider>
  );
};

export default TextComparePage;
