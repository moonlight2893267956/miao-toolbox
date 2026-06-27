import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
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
        className="tc-toolbar-float"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Toolbar onCompare={runCompare} />
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
      <AIAnalysisDock />
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
              <span className="tc-header-badge-icon">D</span>
              <span>DIFF TOOL · v1.0</span>
            </div>
            <h1 className="tc-header-title">
              <span className="tc-title-icon-warm">A</span>
              <span className="tc-title-text">文本对照</span>
              <span className="tc-title-icon-cool">B</span>
            </h1>
            <div className="tc-header-desc">
              <div className="tc-desc-line">
                <span className="tc-desc-dot warm" />
                <span><span className="tc-desc-key">行级粒度</span>对比 · 逐行定位每一处差异</span>
              </div>
              <div className="tc-desc-line">
                <span className="tc-desc-dot cool" />
                <span>自动识别 <span className="tc-desc-key">9 种</span>代码语言 · 智能检测 + 客户端格式化</span>
              </div>
            </div>
          </div>
          
          <div className="tc-header-visual" aria-hidden="true">
            <div className="tc-visual-card warm">
              <span className="tc-visual-tag">A · ORIGINAL</span>
              <div className="tc-visual-line w1 warm-line" />
              <div className="tc-visual-line w2" />
              <div className="tc-visual-line w3 warm-line" />
              <div className="tc-visual-line w4" />
              <div className="tc-visual-line w2" />
            </div>
            <div className="tc-visual-card cool">
              <span className="tc-visual-tag">B · MODIFIED</span>
              <div className="tc-visual-line w1 cool-line" />
              <div className="tc-visual-line w4" />
              <div className="tc-visual-line w2 cool-line" />
              <div className="tc-visual-line w3" />
              <div className="tc-visual-line w2" />
            </div>
            <div className="tc-visual-circle">⇄</div>
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
