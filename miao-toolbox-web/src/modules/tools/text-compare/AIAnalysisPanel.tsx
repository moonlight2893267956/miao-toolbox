import React, { useState, useCallback } from 'react';
import { useDiffContext } from './useDiffContext';
import { useAIAnalysis } from './useAIAnalysis';
import type { AIAnalysisSummary, AIAnalysisExplanation } from './useAIAnalysis';

/**
 * AI 分析面板 — 在 DiffViewer 下方展示 AI 变更摘要。
 *
 * 功能：
 * 1. 全局摘要：SSE 流式逐 token 输出
 * 2. 可折叠面板，不干扰主流程
 */
const AIAnalysisPanel: React.FC = () => {
  const { state } = useDiffContext();
  const { analyzeSummary, cancelStream, streaming, streamContent } = useAIAnalysis();
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  const handleSummary = useCallback(async () => {
    if (!state.diffResult) return;

    setExpanded(true);
    setContent('');
    setError(null);
    setTraceId(null);

    await analyzeSummary(
      state.diffResult,
      (token) => {
        setContent((prev) => prev + token);
      },
      (tid) => {
        setTraceId(tid || null);
      },
      (msg) => {
        setError(msg);
      },
    );
  }, [state.diffResult, analyzeSummary]);

  const handleCancel = useCallback(() => {
    cancelStream();
    setError('已取消');
  }, [cancelStream]);

  // 没有对比结果时不显示
  if (!state.diffResult || state.diffResult.hunks.length === 0) {
    return null;
  }

  return (
    <div className="ai-analysis-panel">
      <div className="ai-analysis-header" onClick={() => setExpanded(!expanded)}>
        <div className="ai-analysis-header-left">
          <span className="ai-analysis-icon">✦</span>
          <span className="ai-analysis-title">AI 变更分析</span>
          {streamContent && !streaming && (
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
              生成摘要
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
          {(content || streamContent) && (
            <div className="ai-analysis-text">
              <AIAnalysisContentView content={content || streamContent} />
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
          {!content && !streamContent && !error && !streaming && (
            <div className="ai-analysis-placeholder">
              点击「生成摘要」按钮，AI 将自动分析代码变更的含义和影响
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** 渲染 AI 分析内容（尝试解析 JSON 结构化输出，否则显示纯文本） */
const AIAnalysisContentView: React.FC<{ content: string }> = ({ content }) => {
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
    // 纯文本流式内容（正在生成中或非 JSON 输出）
    return <div className="ai-analysis-streaming-text">{content}</div>;
  }
};

export default AIAnalysisPanel;
