import React, { useState } from 'react';
import {
  CloseOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  CheckOutlined,
  CheckCircleOutlined,
  StopOutlined,
  SendOutlined,
  ExperimentOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useRegexContext } from '../useRegexContext';
import { useRegexAI, type RegexAIResult } from '../hooks/useRegexAI';

/**
 * AI 增强面板（Epic 3 / FR-6/7/8）：
 * - 自然语言生成正则
 * - 正则解释
 * - 优化建议
 * - 结果可一键应用
 * 以流式（SSE）方式调用，边生成边展示，结束渲染结构化结果。
 */
const AIPanel: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const { state, setPattern } = useRegexContext();
  const {
    generate,
    explain,
    optimize,
    cancel,
    reset,
    loading,
    streaming,
    streamText,
    result,
    error,
  } = useRegexAI();
  const [description, setDescription] = useState('');

  const handleGenerate = () => {
    if (!description.trim()) return;
    generate(description.trim());
  };

  const handleExplain = () => {
    if (!state.pattern) return;
    explain(state.pattern, state.flags);
  };

  const handleOptimize = () => {
    if (!state.pattern) return;
    optimize(state.pattern, state.flags);
  };

  const handleApply = (aiResult: RegexAIResult) => {
    if (aiResult.pattern) {
      setPattern(aiResult.pattern);
    }
    reset();
    onClose();
  };

  const hasPattern = state.pattern.length > 0;
  const isActive = loading || streaming;

  return (
    <div className="rt-ai-panel">
      {/* ── Header ── */}
      <div className="rt-ai-header">
        <div className="rt-ai-header-left">
          <div className="rt-ai-icon">
            <RobotOutlined />
          </div>
          <div className="rt-ai-title-block">
            <span className="rt-ai-title">AI 正则助手</span>
            <span className="rt-ai-subtitle">REGEX ASSISTANT</span>
          </div>
        </div>
        <button
          type="button"
          className="rt-ai-close"
          onClick={onClose}
          aria-label="关闭 AI 面板"
        >
          <CloseOutlined />
        </button>
      </div>

      {/* ── Status Bar ── */}
      {isActive && (
        <div className="rt-ai-status">
          <span className="rt-ai-status-pill rt-ai-status-pill--streaming">
            <span className="rt-ai-status-dot" />
            {streaming ? '生成中' : '思考中'}
          </span>
          {streaming && (
            <button
              type="button"
              className="rt-ai-icon-btn rt-ai-icon-btn--cancel"
              onClick={cancel}
            >
              <StopOutlined /> 停止
            </button>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className="rt-ai-body">
        {/* 空状态：无任务时展示 */}
        {!isActive && !result && !error && (
          <div className="rt-ai-empty">
            <div className="rt-ai-empty-icon">
              <ExperimentOutlined />
            </div>
            <h4>描述你想匹配的内容</h4>
            <p>用自然语言描述，AI 帮你生成正则表达式</p>
          </div>
        )}

        {/* 自然语言生成 */}
        <div className="rt-ai-section">
          <div className="rt-ai-section-label">
            <ThunderboltOutlined /> 自然语言生成
          </div>
          <div className="rt-ai-input-row">
            <input
              type="text"
              className="rt-ai-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="如：匹配中国大陆11位手机号"
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              disabled={loading}
            />
            <button
              type="button"
              className="rt-ai-btn rt-ai-btn--primary"
              onClick={handleGenerate}
              disabled={loading || !description.trim()}
            >
              <SendOutlined /> 生成
            </button>
          </div>
        </div>

        {/* 解释 & 优化 */}
        <div className="rt-ai-section">
          <div className="rt-ai-section-label">
            <BulbOutlined /> 分析当前正则
          </div>
          <div className="rt-ai-actions">
            <button
              type="button"
              className="rt-ai-btn"
              onClick={handleExplain}
              disabled={loading || !hasPattern}
            >
              解释正则
            </button>
            <button
              type="button"
              className="rt-ai-btn"
              onClick={handleOptimize}
              disabled={loading || !hasPattern}
            >
              <RocketOutlined /> 优化建议
            </button>
          </div>
        </div>

        {/* 流式输出中：精致的思考动画，原始 JSON 默认折叠在「查看详情」里 */}
        {streaming && (
          <div className="rt-ai-thinking">
            <div className="rt-ai-thinking-orb">
              <span className="rt-ai-thinking-pulse" />
              <span className="rt-ai-thinking-pulse rt-ai-thinking-pulse--delay" />
              <RobotOutlined className="rt-ai-thinking-icon" />
            </div>
            <div className="rt-ai-thinking-label">AI 正在思考</div>
            <div className="rt-ai-thinking-dots">
              <span />
              <span />
              <span />
            </div>
            {streamText && streamText.length > 20 && (
              <details className="rt-ai-thinking-debug">
                <summary>查看实时输出</summary>
                <pre>{streamText}</pre>
              </details>
            )}
          </div>
        )}

        {/* Error */}
        {error && !streaming && (
          <div className="rt-ai-error">
            <span className="rt-ai-error-icon">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Result */}
        {result && !streaming && (
          <div className="rt-ai-result">
            {result.pattern && (
              <div className="rt-ai-result-pattern">
                <code>/{result.pattern}/</code>
                <button
                  type="button"
                  className="rt-ai-apply-btn"
                  onClick={() => handleApply(result)}
                >
                  <CheckOutlined /> 应用
                </button>
              </div>
            )}
            {result.explanation && (
              <div className="rt-ai-result-section">
                <h5>解释</h5>
                <p>{result.explanation}</p>
              </div>
            )}
            {result.suggestions && result.suggestions.length > 0 && (
              <div className="rt-ai-result-section">
                <h5>优化建议</h5>
                <ul className="rt-ai-result-suggestions">
                  {result.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 兜底：所有展示字段都为空时，按任务类型显示友好提示 */}
            {!result.pattern &&
              !result.explanation &&
              (!result.suggestions || result.suggestions.length === 0) && (
                <div className="rt-ai-result-empty-state">
                  {result.task === 'optimize' ? (
                    <>
                      <CheckCircleOutlined className="rt-ai-result-empty-icon" />
                      <span>当前正则已经很好，无需进一步优化</span>
                    </>
                  ) : result.task === 'explain' ? (
                    <>
                      <BulbOutlined className="rt-ai-result-empty-icon" />
                      <span>暂无解释内容</span>
                    </>
                  ) : (
                    <>
                      <ExperimentOutlined className="rt-ai-result-empty-icon" />
                      <span>生成失败，请重试</span>
                    </>
                  )}
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIPanel;
