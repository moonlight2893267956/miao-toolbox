import React, { useState, useCallback, useRef } from 'react';
import { useDiffContext } from './useDiffContext';
import { useAIAnalysis } from './useAIAnalysis';

/**
 * AI 分析面板 — 在 DiffViewer 下方展示 AI 变更摘要。
 *
 * 功能：
 * 1. 全局摘要：SSE 流式逐 token 输出
 * 2. 可折叠面板，不干扰主流程
 *
 * 状态策略：只用 useAIAnalysis 的 streamContent 作为唯一数据源，
 * 不再维护本地 content state（避免双重状态同步问题）。
 */
const AIAnalysisPanel: React.FC = () => {
  const { state } = useDiffContext();
  const { analyzeSummary, cancelStream, streaming, streamContent } = useAIAnalysis();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  // 追踪是否有请求发起过（区分"从未请求"和"请求完成但无内容"）
  const requestedRef = useRef(false);

  const handleSummary = useCallback(async () => {
    if (!state.diffResult) return;

    requestedRef.current = true;
    setExpanded(true);
    setError(null);
    setTraceId(null);
    setCompleted(false);

    await analyzeSummary(
      state.diffResult,
      // onToken — 不需要本地回调，streamContent 由 hook 自动更新
      () => {},
      // onDone
      (tid) => {
        setTraceId(tid || null);
        setCompleted(true);
      },
      // onError
      (msg) => {
        setError(msg);
        setCompleted(true);
      },
    );

    // 流式结束后标记完成
    if (!error) {
      setCompleted(true);
    }
  }, [state.diffResult, analyzeSummary]);

  const handleCancel = useCallback(() => {
    cancelStream();
    setError('已取消');
    setCompleted(true);
  }, [cancelStream]);

  // 没有对比结果时不显示
  if (!state.diffResult || state.diffResult.hunks.length === 0) {
    return null;
  }

  const hasContent = streamContent.length > 0;

  return (
    <div className="ai-analysis-panel">
      <div className="ai-analysis-header" onClick={() => setExpanded(!expanded)}>
        <div className="ai-analysis-header-left">
          <span className="ai-analysis-icon">✦</span>
          <span className="ai-analysis-title">AI 变更分析</span>
          {completed && hasContent && !streaming && (
            <span className="ai-analysis-badge">已生成</span>
          )}
          {streaming && (
            <span className="ai-analysis-badge streaming">生成中...</span>
          )}
        </div>
        <div className="ai-analysis-header-right">
          {!streaming && (
            <button
              className="ai-analysis-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleSummary();
              }}
            >
              {hasContent ? '重新生成' : '生成摘要'}
            </button>
          )}
          {streaming && (
            <button
              className="ai-analysis-btn cancel"
              onClick={(e) => {
                e.stopPropagation();
                handleCancel();
              }}
            >
              取消
            </button>
          )}
          <span className={`ai-analysis-chevron ${expanded ? 'expanded' : ''}`}>▼</span>
        </div>
      </div>

      {expanded && (
        <div className="ai-analysis-content">
          {hasContent && (
            <div className="ai-analysis-text">
              <AIAnalysisContentView content={streamContent} streaming={streaming} />
            </div>
          )}
          {error && (
            <div className="ai-analysis-error">
              {error}
            </div>
          )}
          {traceId && (
            <div className="ai-analysis-trace">
              Trace: {traceId.slice(0, 8)}...
            </div>
          )}
          {!hasContent && !error && !streaming && (
            <div className="ai-analysis-placeholder">
              点击「生成摘要」按钮，AI 将自动分析代码变更的含义和影响
            </div>
          )}
          {streaming && !hasContent && (
            <div className="ai-analysis-loading">
              <span className="ai-loading-dot" />
              <span className="ai-loading-dot" />
              <span className="ai-loading-dot" />
              正在分析变更...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** 渲染 AI 分析内容（尝试解析 JSON 结构化输出，否则显示纯文本） */
const AIAnalysisContentView: React.FC<{ content: string; streaming: boolean }> = ({ content, streaming }) => {
  // 流式输出中，不尝试 JSON 解析（内容不完整），直接显示纯文本
  if (streaming) {
    return (
      <div className="ai-analysis-streaming-text">
        {content}
        <span className="ai-cursor" />
      </div>
    );
  }

  // 流式结束，尝试解析结构化 JSON
  try {
    const parsed = JSON.parse(content);

    // Summary 模式的结构化输出
    if (parsed.summary) {
      return (
        <div className="ai-analysis-structured">
          <div className="ai-analysis-section">
            <h4>变更摘要</h4>
            <p>{parsed.summary}</p>
          </div>
          {parsed.impact && (
            <div className="ai-analysis-section">
              <h4>影响分析</h4>
              <p>{parsed.impact}</p>
            </div>
          )}
          {parsed.details && parsed.details.length > 0 && (
            <div className="ai-analysis-section">
              <h4>逐块解释</h4>
              <ul>
                {parsed.details.map((d: any, i: number) => (
                  <li key={i}>
                    <span className="ai-hunk-badge">#{d.hunk_index}</span>
                    <span className="ai-hunk-type">{d.type}</span>
                    <span>{d.explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    // Explain 模式的结构化输出
    if (parsed.explanation) {
      return (
        <div className="ai-analysis-structured">
          <div className="ai-analysis-section">
            <h4>差异解释</h4>
            <p>{parsed.explanation}</p>
          </div>
          {parsed.impact && (
            <div className="ai-analysis-section">
              <h4>影响范围</h4>
              <p>{parsed.impact}</p>
            </div>
          )}
          {parsed.suggestion && (
            <div className="ai-analysis-section">
              <h4>建议</h4>
              <p>{parsed.suggestion}</p>
            </div>
          )}
        </div>
      );
    }

    // 其他 JSON 格式
    return <pre>{JSON.stringify(parsed, null, 2)}</pre>;
  } catch {
    // 非 JSON 纯文本输出
    return <div className="ai-analysis-streaming-text">{content}</div>;
  }
};

export default AIAnalysisPanel;
