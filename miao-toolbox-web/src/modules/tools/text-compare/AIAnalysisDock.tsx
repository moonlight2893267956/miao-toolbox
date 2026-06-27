import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SparkleIcon, RefreshIcon, TraceIcon, CloseIcon } from './icons';
import { useDiffContext } from './useDiffContext';
import { useAIAnalysis } from './useAIAnalysis';

/**
 * AI 变更分析 — 浮动 Dock + 右侧抽屉
 *
 * 布局策略：
 * - 默认折叠：右下角圆形浮动按钮（Dock）
 * - 点击展开：从右侧滑出 400px 抽屉
 * - 不占用 DiffViewer 主体空间，桌面端始终可见
 *
 * 视觉：与主色 warm/cool 协调的渐变（取代之前的纯紫）
 */
const AIAnalysisDock: React.FC = () => {
  const { state } = useDiffContext();
  const { analyzeSummary, cancelStream, streaming, streamContent } = useAIAnalysis();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const lastResultRef = useRef<string>(''); // 上次结果缓存，切换 diff 时保留

  const hunks = state.diffResult?.hunks ?? [];
  const diffHunks = hunks.filter((h) => h.type !== 'unchanged');
  const hasResult = state.diffResult && diffHunks.length > 0;
  const hasContent = streamContent.length > 0;

  // 切换 diff 时清空旧结果
  useEffect(() => {
    if (state.diffResult === null) {
      lastResultRef.current = '';
    }
  }, [state.diffResult]);

  const handleAnalyze = useCallback(async () => {
    if (!state.diffResult) return;
    setError(null);
    setTraceId(null);
    setCompleted(false);

    await analyzeSummary(
      state.diffResult,
      () => {},
      (tid) => {
        setTraceId(tid || null);
        setCompleted(true);
        lastResultRef.current = streamContent;
      },
      (msg) => {
        setError(msg);
        setCompleted(true);
      },
    );
    setCompleted(true);
  }, [state.diffResult, analyzeSummary, streamContent]);

  const handleCancel = useCallback(() => {
    cancelStream();
    setError('已取消');
    setCompleted(true);
  }, [cancelStream]);

  // 没有对比结果时不显示
  if (!hasResult) return null;

  return (
    <>
      {/* Floating Dock Button — 右下角 */}
      <AnimatePresence>
        {!open && (
          <motion.button
            className="ai-dock-btn"
            onClick={() => setOpen(true)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            aria-label="打开 AI 变更分析"
          >
            <span className="ai-dock-btn-icon">
              <SparkleIcon size={20} />
            </span>
            <span className="ai-dock-btn-label">AI 分析</span>
            {!hasContent && <span className="ai-dock-btn-hint">点击生成</span>}
            {streaming && <span className="ai-dock-btn-pulse" />}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Right Side Drawer */}
      <AnimatePresence>
        {open && (
          <>
            {/* 背景遮罩（仅移动端显示） */}
            <motion.div
              className="ai-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => !streaming && setOpen(false)}
            />

            <motion.aside
              className="ai-drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 32 }}
            >
              {/* Drawer Header */}
              <div className="ai-drawer-header">
                <div className="ai-drawer-header-left">
                  <span className="ai-drawer-icon">
                    <SparkleIcon size={16} />
                  </span>
                  <div className="ai-drawer-title-block">
                    <span className="ai-drawer-title">AI 变更分析</span>
                    <span className="ai-drawer-subtitle">
                      {streaming
                        ? '正在生成...'
                        : completed
                          ? hasContent
                            ? '已完成'
                            : ''
                          : '由 miao-ai 提供'}
                    </span>
                  </div>
                </div>
                <div className="ai-drawer-header-right">
                  {!streaming && (
                    <button
                      className="ai-drawer-icon-btn"
                      onClick={handleAnalyze}
                      aria-label="重新生成"
                      title="重新生成"
                    >
                      <RefreshIcon size={14} />
                    </button>
                  )}
                  {streaming && (
                    <button
                      className="ai-drawer-icon-btn cancel"
                      onClick={handleCancel}
                      aria-label="取消生成"
                    >
                      取消
                    </button>
                  )}
                  <button
                    className="ai-drawer-icon-btn"
                    onClick={() => !streaming && setOpen(false)}
                    aria-label="关闭"
                    title="关闭"
                    disabled={streaming}
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              </div>

              {/* Status Bar */}
              {(streaming || hasContent || error) && (
                <div className="ai-drawer-status">
                  {streaming && (
                    <>
                      <div className="ai-status-pill streaming">
                        <span className="ai-status-dot" />
                        流式输出中
                      </div>
                      <span className="ai-status-progress">
                        已生成 {streamContent.length} 字符
                      </span>
                    </>
                  )}
                  {completed && !streaming && hasContent && (
                    <div className="ai-status-pill success">
                      <span className="ai-status-dot" />
                      生成完成
                    </div>
                  )}
                  {error && (
                    <div className="ai-status-pill error">
                      <span className="ai-status-dot" />
                      出错了
                    </div>
                  )}
                </div>
              )}

              {/* Drawer Body */}
              <div className="ai-drawer-body">
                {hasContent ? (
                  <AIAnalysisContentView content={streamContent} streaming={streaming} />
                ) : error ? (
                  <div className="ai-drawer-error">
                    <p>{error}</p>
                    <button className="ai-drawer-retry-btn" onClick={handleAnalyze}>
                      重试
                    </button>
                  </div>
                ) : streaming ? (
                  <div className="ai-drawer-loading">
                    <div className="ai-loading-pulse">
                      <span /><span /><span />
                    </div>
                    <p>正在分析 {diffHunks.length} 处差异...</p>
                  </div>
                ) : (
                  <div className="ai-drawer-empty">
                    <div className="ai-drawer-empty-icon">
                      <SparkleIcon size={32} />
                    </div>
                    <h4>让 AI 帮你理解这些变更</h4>
                    <p>分析本次 diff 的语义、影响范围与潜在风险</p>
                    <button className="ai-drawer-cta-btn" onClick={handleAnalyze}>
                      <SparkleIcon size={14} />
                      开始分析
                    </button>
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              {traceId && (
                <div className="ai-drawer-footer">
                  <TraceIcon size={11} />
                  <span>Trace: {traceId.slice(0, 12)}...</span>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

/** 内容视图（流式 vs 完成） */
const AIAnalysisContentView: React.FC<{ content: string; streaming: boolean }> = ({ content, streaming }) => {
  if (streaming) {
    return (
      <div className="ai-drawer-streaming">
        {content}
        <span className="ai-cursor" />
      </div>
    );
  }

  // 完成态：尝试解析 JSON 结构化输出
  try {
    const parsed = JSON.parse(content);

    if (parsed.summary) {
      return (
        <div className="ai-drawer-structured">
          <Section title="变更摘要" body={parsed.summary} />
          {parsed.impact && <Section title="影响分析" body={parsed.impact} />}
          {parsed.details && parsed.details.length > 0 && (
            <div className="ai-drawer-section">
              <h5>逐块解释</h5>
              <ul className="ai-drawer-list">
                {parsed.details.map((d: any, i: number) => (
                  <li key={i}>
                    <span className="ai-hunk-badge">#{d.hunk_index}</span>
                    <span className="ai-hunk-type">{d.type}</span>
                    <span className="ai-hunk-text">{d.explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    if (parsed.explanation) {
      return (
        <div className="ai-drawer-structured">
          <Section title="差异解释" body={parsed.explanation} />
          {parsed.impact && <Section title="影响范围" body={parsed.impact} />}
          {parsed.suggestion && <Section title="建议" body={parsed.suggestion} />}
        </div>
      );
    }

    return <pre className="ai-drawer-json">{JSON.stringify(parsed, null, 2)}</pre>;
  } catch {
    return <div className="ai-drawer-streaming done">{content}</div>;
  }
};

const Section: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="ai-drawer-section">
    <h5>{title}</h5>
    <p>{body}</p>
  </div>
);

export default AIAnalysisDock;
