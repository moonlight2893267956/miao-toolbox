import React, { useReducer, useCallback, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Modal } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import './text-batch-processor.css';
import type { TbpState, TbpAction, TbpTabKey, TbpTabConfig } from './types';
import { TBP_TABS, INITIAL_TBP_STATE } from './types';
import { loadPageState, savePageState } from '../../../shared/utils/tabPageStorage';
import SharedTextInputArea from './components/SharedTextInputArea';
import DedupTab from './tabs/DedupTab';
import SortTab from './tabs/SortTab';
import ExtractTab from './tabs/ExtractTab';
import ReplaceTab from './tabs/ReplaceTab';
import FreqTab from './tabs/FreqTab';

const PAGE_KEY = 'tools-text-batch-processor';

function loadInitialTbpState(): TbpState {
  const loaded = loadPageState<Partial<TbpState>>(PAGE_KEY);
  if (!loaded || typeof loaded !== 'object') return INITIAL_TBP_STATE;
  return {
    ...INITIAL_TBP_STATE,
    ...loaded,
    dedup: { ...INITIAL_TBP_STATE.dedup, ...loaded.dedup },
    sort: { ...INITIAL_TBP_STATE.sort, ...loaded.sort },
    extract: { ...INITIAL_TBP_STATE.extract, ...loaded.extract },
    replace: { ...INITIAL_TBP_STATE.replace, ...loaded.replace },
    freq: { ...INITIAL_TBP_STATE.freq, ...loaded.freq },
  };
}

function tbpReducer(state: TbpState, action: TbpAction): TbpState {
  switch (action.type) {
    case 'TBP_SET_TAB':
      return { ...state, activeTab: action.payload };
    case 'TBP_SET_INPUT':
      return { ...state, inputText: action.payload, previousInputText: null };
    case 'TBP_SET_DEDUP_OPTIONS':
      return { ...state, dedup: { ...state.dedup, options: action.payload } };
    case 'TBP_SET_SORT_OPTIONS':
      return { ...state, sort: { ...state.sort, options: action.payload } };
    case 'TBP_SET_EXTRACT_PATTERN':
      return { ...state, extract: { ...state.extract, pattern: action.payload } };
    case 'TBP_SET_EXTRACT_FLAGS':
      return { ...state, extract: { ...state.extract, flags: action.payload } };
    case 'TBP_SET_EXTRACT_KEYWORD':
      return { ...state, extract: { ...state.extract, keyword: action.payload } };
    case 'TBP_SET_EXTRACT_FORMAT':
      return { ...state, extract: { ...state.extract, format: action.payload } };
    case 'TBP_SET_EXTRACT_RESULT':
      return {
        ...state,
        extract: { ...state.extract, result: action.payload.result, count: action.payload.count, error: null },
      };
    case 'TBP_SET_EXTRACT_ERROR':
      return { ...state, extract: { ...state.extract, error: action.payload } };
    case 'TBP_SET_REPLACE_PATTERN':
      return { ...state, replace: { ...state.replace, findPattern: action.payload } };
    case 'TBP_SET_REPLACE_FLAGS':
      return { ...state, replace: { ...state.replace, flags: action.payload } };
    case 'TBP_SET_REPLACE_TEXT':
      return { ...state, replace: { ...state.replace, replaceText: action.payload } };
    case 'TBP_SET_REPLACE_USE_REGEX':
      return { ...state, replace: { ...state.replace, useRegex: action.payload } };
    case 'TBP_SET_REPLACE_PREVIEW':
      return { ...state, replace: { ...state.replace, count: action.payload.count, error: null } };
    case 'TBP_SET_REPLACE_EXECUTED':
      return {
        ...state,
        replace: { ...state.replace, result: action.payload.result, count: action.payload.count, executed: true, error: null },
      };
    case 'TBP_SET_REPLACE_ERROR':
      return { ...state, replace: { ...state.replace, error: action.payload } };
    case 'TBP_SET_FREQ_SPLIT_MODE':
      return { ...state, freq: { ...state.freq, splitMode: action.payload } };
    case 'TBP_SET_FREQ_TOP_N':
      return { ...state, freq: { ...state.freq, topN: action.payload } };
    case 'TBP_SET_FREQ_STOP_WORDS':
      return { ...state, freq: { ...state.freq, useStopWords: action.payload } };
    case 'TBP_BACKFILL':
      return { ...state, inputText: action.payload, previousInputText: state.inputText };
    case 'TBP_UNDO_BACKFILL':
      if (state.previousInputText === null) return state;
      return { ...state, inputText: state.previousInputText, previousInputText: null };
    case 'TBP_CLEAR_ALL':
      return { ...INITIAL_TBP_STATE };
    default:
      return state;
  }
}

const EmptyState: React.FC<{ tab: TbpTabConfig; hasInput: boolean }> = ({ tab, hasInput }) => (
  <div className="tbp-empty">
    <div className="tbp-empty-glyph" aria-hidden>{tab.icon}</div>
    <div className="tbp-empty-body">
      <h3 className="tbp-empty-title">{tab.description}</h3>
      <p className="tbp-empty-hint">{tab.hint}</p>
    </div>
    <span className="tbp-empty-badge">
      <span className="tbp-empty-badge-dot" />
      即将上线
    </span>
    {!hasInput && (
      <p className="tbp-empty-foot">← 在左侧输入文本后，处理结果将显示在此处</p>
    )}
  </div>
);

const TextBatchProcessorPage: React.FC = () => {
  const [state, dispatch] = useReducer(tbpReducer, undefined, loadInitialTbpState);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    savePageState(PAGE_KEY, state);
  }, [state]);

  const handleTabChange = useCallback((key: TbpTabKey) => {
    dispatch({ type: 'TBP_SET_TAB', payload: key });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = TBP_TABS.findIndex((t) => t.key === state.activeTab);
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        handleTabChange(TBP_TABS[currentIndex - 1].key);
      } else if (e.key === 'ArrowRight' && currentIndex < TBP_TABS.length - 1) {
        handleTabChange(TBP_TABS[currentIndex + 1].key);
      }
    },
    [state.activeTab, handleTabChange],
  );

  const activeTabConfig = TBP_TABS.find((t) => t.key === state.activeTab);

  const handleClearAll = useCallback(() => {
    Modal.confirm({
      title: '确认清空',
      content: '将清空输入文本和所有操作结果，此操作不可撤销。',
      okText: '清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => dispatch({ type: 'TBP_CLEAR_ALL' }),
    });
  }, [dispatch]);

  return (
    <motion.div
      className="tbp-page"
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.35 }}
    >
      <div className="tbp-page-glow" aria-hidden />

      <div className="tbp-header">
        <div className="tbp-header-inner">
          <div className="tbp-header-icon">
            <FileTextOutlined />
          </div>
          <div className="tbp-header-text">
            <h2>文本批量处理</h2>
            <p className="tbp-header-subtitle">
              <span className="tbp-dot" />
              本地运算 · 文本不离开设备 · 链式串联
            </p>
          </div>
          <button className="tbp-header-btn" onClick={handleClearAll}>
            清空
          </button>
        </div>
      </div>

      <div className="tbp-nav">
        <div
          className="tbp-nav-track"
          role="tablist"
          aria-orientation="horizontal"
          onKeyDown={handleKeyDown}
        >
          {TBP_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={state.activeTab === tab.key}
              aria-controls={`tbp-panel-${tab.key}`}
              id={`tbp-tab-${tab.key}`}
              className={`tbp-nav-item ${state.activeTab === tab.key ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.key)}
            >
              <span className="tbp-nav-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tbp-workspace">
        <SharedTextInputArea
          inputText={state.inputText}
          canUndoBackfill={state.previousInputText !== null}
          dispatch={dispatch}
        />

        <div className="tbp-flow-divider" aria-hidden>
          <span className="tbp-flow-arrow" />
        </div>

        <div className="tbp-output-panel">
          <div className="tbp-output-head">
            <span className="tbp-output-dot" />
            <span className="tbp-output-label">处理结果</span>
            {activeTabConfig && (
              <span className="tbp-output-tab-name">{activeTabConfig.label}</span>
            )}
          </div>
          <div className="tbp-output-body">
            <motion.div
              key={state.activeTab}
              role="tabpanel"
              aria-labelledby={`tbp-tab-${state.activeTab}`}
              id={`tbp-panel-${state.activeTab}`}
              className="tbp-tab-panel"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
            >
              {state.activeTab === 'dedup' ? (
                <DedupTab
                  inputText={state.inputText}
                  options={state.dedup.options}
                  dispatch={dispatch}
                />
              ) : state.activeTab === 'sort' ? (
                <SortTab
                  inputText={state.inputText}
                  options={state.sort.options}
                  dispatch={dispatch}
                />
              ) : state.activeTab === 'extract' ? (
                <ExtractTab
                  inputText={state.inputText}
                  state={state.extract}
                  dispatch={dispatch}
                />
              ) : state.activeTab === 'replace' ? (
                <ReplaceTab
                  inputText={state.inputText}
                  state={state.replace}
                  dispatch={dispatch}
                />
              ) : state.activeTab === 'freq' ? (
                <FreqTab
                  inputText={state.inputText}
                  state={state.freq}
                  dispatch={dispatch}
                />
              ) : (
                activeTabConfig && (
                  <EmptyState tab={activeTabConfig} hasInput={state.inputText.length > 0} />
                )
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default TextBatchProcessorPage;
