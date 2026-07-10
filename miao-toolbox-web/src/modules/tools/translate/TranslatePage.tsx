import React from 'react';
import { motion } from 'framer-motion';
import {
  TranslationOutlined,
  ApartmentOutlined,
  HistoryOutlined,
  PictureOutlined,
  AudioOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import TranslateProvider from './TranslateProvider';
import { useTranslateContext } from './useTranslateContext';
import TranslateTextPanel from './TranslateTextPanel';
import TranslateDetectPanel from './TranslateDetectPanel';
import TranslateHistoryPanel from './TranslateHistoryPanel';
import TranslateImagePanel from './TranslateImagePanel';
import TranslateVoicePanel from './TranslateVoicePanel';
import ComingSoonPanel from './ComingSoonPanel';
import type { TranslateTabKey } from './types';
import './translate.css';

/** Tab 定义（框架）：P0 主标签 text/detect 就绪，P1/P2 占位 */
const TABS: {
  key: TranslateTabKey;
  label: string;
  icon: React.ReactNode;
  ready: boolean;
}[] = [
  { key: 'text', label: '文本翻译', icon: <TranslationOutlined />, ready: true },
  { key: 'detect', label: '语种识别', icon: <ApartmentOutlined />, ready: true },
  { key: 'image', label: '图片翻译', icon: <PictureOutlined />, ready: true },
  { key: 'voice', label: '语音翻译', icon: <AudioOutlined />, ready: true },
  { key: 'ai', label: 'AI 增强', icon: <ThunderboltOutlined />, ready: false },
  { key: 'history', label: '历史记录', icon: <HistoryOutlined />, ready: true },
];

const TranslateContent: React.FC = () => {
  const { state, dispatch } = useTranslateContext();

  const renderPanel = () => {
    switch (state.activeTab) {
      case 'text':
        return <TranslateTextPanel />;
      case 'detect':
        return <TranslateDetectPanel />;
      case 'history':
        return <TranslateHistoryPanel />;
      case 'image':
        return <TranslateImagePanel />;
      case 'voice':
        return <TranslateVoicePanel />;
      case 'ai':
        return <ComingSoonPanel tab="ai" />;
      default:
        return null;
    }
  };

  return (
    <div className="tt-page">
      <header className="tt-header">
        <motion.div
          className="tt-header-inner"
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35 }}
        >
          <div className="tt-header-icon">
            <TranslationOutlined />
          </div>
          <div className="tt-header-text">
            <h2>智能翻译</h2>
            <p className="tt-header-subtitle">
              <span className="tt-dot" />
              统一托管 · 数据不出域 · 多语言互译
            </p>
          </div>
        </motion.div>
      </header>

      <nav className="tt-nav">
        <motion.div
          className="tt-nav-track"
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.08 }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tt-nav-item ${state.activeTab === tab.key ? 'active' : ''} ${tab.ready ? '' : 'soon'}`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.key })}
            >
              <span className="tt-nav-icon">{tab.icon}</span>
              {tab.label}
              {!tab.ready && <span className="tt-nav-soon-badge">soon</span>}
            </button>
          ))}
        </motion.div>
      </nav>

      <main className="tt-content">
        <motion.div
          className="tt-tab-panel"
          key={state.activeTab}
          initial={{ opacity: 0, y: 10, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {renderPanel()}
        </motion.div>
      </main>
    </div>
  );
};

const TranslatePage: React.FC = () => (
  <TranslateProvider>
    <TranslateContent />
  </TranslateProvider>
);

export default TranslatePage;
