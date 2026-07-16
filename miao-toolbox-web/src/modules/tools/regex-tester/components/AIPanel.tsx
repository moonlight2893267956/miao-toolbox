import React, { useState } from 'react';
import { CloseOutlined, RobotOutlined, ThunderboltOutlined, BulbOutlined, CheckOutlined } from '@ant-design/icons';
import { useRegexContext } from '../useRegexContext';
import { useRegexAI, type RegexAIResult } from '../hooks/useRegexAI';

/**
 * AI 增强面板（Epic 3 / FR-6/7/8）：
 * - 自然语言生成正则
 * - 正则解释
 * - 优化建议
 * - 结果可一键应用
 */
const AIPanel: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const { state, setPattern } = useRegexContext();
  const { generate, explain, optimize, loading, result, error, reset } = useRegexAI();
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

  return (
    <div className="rt-ai-panel" role="dialog" aria-label="AI 正则助手">
      <div className="rt-ai-head">
        <span className="rt-ai-title">
          <RobotOutlined /> AI 正则助手
        </span>
        <button
          type="button"
          className="rt-ai-close"
          onClick={onClose}
          aria-label="关闭 AI 面板"
        >
          <CloseOutlined />
        </button>
      </div>

      <div className="rt-ai-body">
        {/* 自然语言生成 */}
        <div className="rt-ai-section">
          <div className="rt-ai-section-title">
            <ThunderboltOutlined /> 自然语言生成
          </div>
          <div className="rt-ai-input-row">
            <input
              type="text"
              className="rt-ai-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述你想匹配的内容，如：匹配中国大陆手机号"
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              disabled={loading}
            />
            <button
              type="button"
              className="rt-ai-btn rt-ai-btn--primary"
              onClick={handleGenerate}
              disabled={loading || !description.trim()}
            >
              生成
            </button>
          </div>
        </div>

        {/* 解释 & 优化 */}
        <div className="rt-ai-section">
          <div className="rt-ai-section-title">
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
              优化建议
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="rt-ai-loading">
            <div className="rt-ai-spinner" />
            <span>AI 思考中…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rt-ai-error">
            <span className="rt-ai-error-icon">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
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
              <div className="rt-ai-result-explanation">
                {result.explanation}
              </div>
            )}
            {result.suggestions && result.suggestions.length > 0 && (
              <ul className="rt-ai-result-suggestions">
                {result.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIPanel;
