import React, { useCallback, useState, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Modal } from 'antd';
import { FileTextOutlined, PlusOutlined, CloseOutlined, CompressOutlined, DeleteOutlined } from '@ant-design/icons';
import './text-batch-processor.css';
import { TBP_TABS } from './types';
import { useTbpTabs } from './hooks/useTbpTabs';
import { createTbpDispatch } from './utils/tbpDispatch';
import SharedTextInputArea from './components/SharedTextInputArea';
import type { HighlightRange } from './components/SharedTextInputArea';
import DedupTab from './tabs/DedupTab';
import SortTab from './tabs/SortTab';
import ExtractTab from './tabs/ExtractTab';
import ReplaceTab from './tabs/ReplaceTab';
import FreqTab from './tabs/FreqTab';

/* ---- 页签名编辑 ---- */
const TabName: React.FC<{ name: string; onRename: (v: string) => void }> = ({ name, onRename }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  if (editing) {
    return (
      <input
        className="tbp-tab-name-input"
        value={val}
        autoFocus
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onRename(val.trim() || name);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setVal(name);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <span
      className="tbp-tab-name"
      onDoubleClick={() => {
        setVal(name);
        setEditing(true);
      }}
      title="双击重命名"
    >
      {name}
    </span>
  );
};

const TextBatchProcessorPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const api = useTbpTabs();
  const dispatch = React.useMemo(() => createTbpDispatch(api), [api]);

  const { tabs, activeId, activeTab } = api;

  const [highlightRange, setHighlightRange] = useState<HighlightRange | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLocateMatch = useCallback((start: number, end: number) => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightRange({ start, end });
    highlightTimer.current = setTimeout(() => setHighlightRange(null), 4000);
  }, []);

  const handleClearAll = useCallback(() => {
    Modal.confirm({
      title: '确认清空',
      content: '将清空所有页签内容和操作结果，此操作不可撤销。',
      okText: '清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => api.clearAll(),
    });
  }, [api]);

  const hasOp = activeTab.activeOp !== null;

  return (
    <motion.div
      className="tbp-page"
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.35 }}
    >
      <div className="tbp-page-glow" aria-hidden />

      {/* ---- 页头：与其他工具页统一（cron-editor / ral-log-parser / crypto 风格）---- */}
      <header className="tbp-header">
        <div className="tbp-header-inner">
          <div className="tbp-header-icon">
            <FileTextOutlined />
          </div>
          <div className="tbp-header-text">
            <h2>文本批量处理</h2>
            <div className="tbp-header-subtitle">
              <span className="tbp-dot" />
              多页签文本工作台 · 去重 / 排序 / 提取 / 替换 / 词频
            </div>
          </div>
          <div className="tbp-header-actions">
            <button
              type="button"
              className="tbp-header-action-btn"
              onClick={handleClearAll}
              title="清空所有页签内容"
            >
              <DeleteOutlined /> 清空
            </button>
          </div>
        </div>
      </header>

      {/* ---- 多文本页签栏：左侧 emerald 标识条 + 纸面风格 ---- */}
      <div className="tbp-tabs-bar">
        <div className="tbp-tabs-bar-marker" aria-hidden />
        <div className="tbp-tabs-label">
          <span className="tbp-tabs-label-text">TEXT</span>
          <span className="tbp-tabs-label-count">{String(tabs.length).padStart(2, '0')}</span>
        </div>
        <div className="tbp-tabs-scroll">
          {tabs.map((tab, idx) => {
            const status = tab.input.trim() ? 'filled' : 'empty';
            return (
              <div
                key={tab.id}
                className={`tbp-text-tab tbp-text-tab--${status} ${tab.id === activeId ? 'tbp-text-tab--active' : ''}`}
                onClick={() => api.activateTab(tab.id)}
              >
                <span className="tbp-text-tab-status" data-status={status} />
                <span className="tbp-text-tab-idx">{String(idx + 1).padStart(2, '0')}</span>
                <TabName name={tab.name} onRename={(v) => api.renameTab(tab.id, v)} />
                {tabs.length > 1 && (
                  <button
                    type="button"
                    className="tbp-text-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      api.removeTab(tab.id);
                    }}
                    title="关闭页签"
                  >
                    <CloseOutlined />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="tbp-text-tab-add"
          onClick={api.addTab}
          title="新建页签"
        >
          <PlusOutlined />
        </button>
      </div>

      {/* ---- 工作区 ---- */}
      <div className={`tbp-workspace ${hasOp ? 'has-tab' : ''}`}>
        <SharedTextInputArea
          inputText={activeTab.input}
          dispatch={dispatch}
          highlightRange={highlightRange}
          activeOp={activeTab.activeOp}
          onTabToggle={api.toggleOp}
        />

        {hasOp && (
          <>
            <div className="tbp-flow-divider" aria-hidden>
              <span className="tbp-flow-arrow" />
            </div>

            <div className="tbp-output-panel">
              <div className="tbp-output-head">
                <span className="tbp-output-dot" />
                <span className="tbp-output-label">
                  {TBP_TABS.find((t) => t.key === activeTab.activeOp)?.label ?? '结果'}
                </span>
                <span className="tbp-output-tab-name">
                  {TBP_TABS.find((t) => t.key === activeTab.activeOp)?.description ?? ''}
                </span>
                <button
                  type="button"
                  className="tbp-output-collapse"
                  onClick={() => api.closeOp()}
                  title="收起，恢复全屏输入"
                >
                  <CompressOutlined />
                </button>
              </div>
              <div className="tbp-output-body">
                <motion.div
                  key={activeTab.activeOp}
                  className="tbp-tab-panel"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
                >
                  {activeTab.activeOp === 'dedup' && (
                    <DedupTab
                      inputText={activeTab.input}
                      options={activeTab.dedup.options}
                      dispatch={dispatch}
                    />
                  )}
                  {activeTab.activeOp === 'sort' && (
                    <SortTab
                      inputText={activeTab.input}
                      options={activeTab.sort.options}
                      dispatch={dispatch}
                    />
                  )}
                  {activeTab.activeOp === 'extract' && (
                    <ExtractTab
                      inputText={activeTab.input}
                      state={activeTab.extract}
                      dispatch={dispatch}
                      onLocateMatch={handleLocateMatch}
                    />
                  )}
                  {activeTab.activeOp === 'replace' && (
                    <ReplaceTab
                      inputText={activeTab.input}
                      state={activeTab.replace}
                      dispatch={dispatch}
                    />
                  )}
                  {activeTab.activeOp === 'freq' && (
                    <FreqTab
                      inputText={activeTab.input}
                      state={activeTab.freq}
                      dispatch={dispatch}
                    />
                  )}
                </motion.div>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default TextBatchProcessorPage;
