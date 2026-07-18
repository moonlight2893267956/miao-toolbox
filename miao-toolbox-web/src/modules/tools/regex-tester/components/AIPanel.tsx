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
  SwapOutlined,
  FileTextOutlined,
  BugOutlined,
} from '@ant-design/icons';
import AiMarkdownSection from '../../../../components/shared/AiMarkdownSection';
import { useRegexContext } from '../useRegexContext';
import { useRegexAI, type RegexAIResult } from '../hooks/useRegexAI';

/** 支持的引擎（与 Agent 的 engine / targetEngine 对齐） */
const ENGINES = ['js', 'pcre', 'python', 'java', 'go', 'rust'];

type TabKey = 'generate' | 'explain' | 'optimize' | 'diagnose' | 'convert';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'generate', label: '生成', icon: <ThunderboltOutlined /> },
  { key: 'explain', label: '解释', icon: <FileTextOutlined /> },
  { key: 'optimize', label: '优化', icon: <BulbOutlined /> },
  { key: 'diagnose', label: '诊断匹配', icon: <BugOutlined /> },
  { key: 'convert', label: '引擎转换', icon: <SwapOutlined /> },
];

const TASK_VERB: Record<TabKey, string> = {
  generate: '生成',
  explain: '解释',
  optimize: '优化',
  diagnose: '诊断',
  convert: '转换',
};

/**
 * 从优化建议文本中解析内嵌的正则表达式。
 * Agent 约定格式为 "{表达式} — {理由}"（分隔符为空格 + 长/短破折号 + 空格）。
 * 无法解析时返回 null，调用方回退为纯文本展示。
 */
function parseSuggestion(text: string): { pattern: string; reason: string } | null {
  const m = text.match(/^(.+?)\s+[—–]\s+(.+)$/);
  if (!m) return null;
  return { pattern: m[1].trim(), reason: m[2].trim() };
}

/**
 * AI 增强面板（Epic 3 / FR-6/7/8）：
 * - 自然语言生成正则
 * - 正则解释
 * - 优化建议（每条建议内嵌表达式，可一键应用）
 * - 匹配诊断（结合样例文本给出修正表达式，可"采纳修正"）
 * - 引擎方言转换（js / pcre / python / java / go / rust）
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
    diagnose,
    convert,
    cancel,
    reset,
    loading,
    streaming,
    streamText,
    result,
    error,
  } = useRegexAI();
  const [description, setDescription] = useState('');
  const [diagnoseSamples, setDiagnoseSamples] = useState('');
  const [convertSource, setConvertSource] = useState('pcre');
  const [convertTarget, setConvertTarget] = useState('js');
  const [activeTab, setActiveTab] = useState<TabKey>('generate');

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

  const handleDiagnose = () => {
    if (!state.pattern) return;
    const samples = diagnoseSamples
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (samples.length === 0) return;
    diagnose(state.pattern, samples, state.flags);
  };

  const handleConvert = () => {
    if (!state.pattern || convertSource === convertTarget) return;
    convert(state.pattern, convertTarget, state.flags, convertSource);
  };

  /** 应用生成/诊断/转换得到的表达式（经 command bar 的本地 test() 安全网） */
  const applyPattern = (p: string) => {
    if (p) setPattern(p);
    reset();
    onClose();
  };

  const handleApply = (aiResult: RegexAIResult) => {
    applyPattern(aiResult.pattern ?? '');
  };

  const hasPattern = state.pattern.length > 0;
  const isActive = loading || streaming;

  /** 切换 Tab：中断进行中的请求并清空旧结果（diagnoseSamples/convert 选项保留） */
  const handleTabChange = (tab: TabKey) => {
    if (isActive) cancel();
    reset();
    setActiveTab(tab);
  };

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

      {/* ── Tab 导航 ── */}
      <div className="rt-ai-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`rt-ai-tab ${activeTab === tab.key ? 'rt-ai-tab--active' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Status Bar ── */}
      {isActive && (
        <div className="rt-ai-status">
          <span className="rt-ai-status-pill rt-ai-status-pill--streaming">
            <span className="rt-ai-status-dot" />
            {streaming ? `${TASK_VERB[activeTab]}中` : '思考中'}
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
        {/* 当前正则上下文：AI 的 diagnose/convert/分析都作用于主编辑框的正则 */}
        <div className="rt-ai-current" title={hasPattern ? `/${state.pattern}/${state.flags}` : '编辑器为空'}>
          <span className="rt-ai-current-label">当前正则</span>
          {hasPattern ? (
            <code className="rt-ai-current-pattern">
              /{state.pattern}/<span className="rt-ai-current-flags">{state.flags}</span>
            </code>
          ) : (
            <span className="rt-ai-current-empty">编辑器为空，请先输入正则</span>
          )}
        </div>

        {/* 空状态：仅生成 Tab 默认展示 */}
        {activeTab === 'generate' && !isActive && !result && !error && (
          <div className="rt-ai-empty">
            <div className="rt-ai-empty-icon">
              <ExperimentOutlined />
            </div>
            <h4>描述你想匹配的内容</h4>
            <p>用自然语言描述，AI 帮你生成正则表达式</p>
          </div>
        )}

        {/* 生成 Tab */}
        {activeTab === 'generate' && (
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
        )}

        {/* 解释 Tab */}
        {activeTab === 'explain' && (
          <div className="rt-ai-section">
            <div className="rt-ai-section-label">
              <FileTextOutlined /> 解释当前正则
            </div>
            <div className="rt-ai-hint">作用于上方「当前正则」</div>
            <button
              type="button"
              className="rt-ai-btn rt-ai-btn--primary rt-ai-run-btn"
              onClick={handleExplain}
              disabled={loading || !hasPattern}
            >
              <SendOutlined /> 解释
            </button>
          </div>
        )}

        {/* 优化 Tab */}
        {activeTab === 'optimize' && (
          <div className="rt-ai-section">
            <div className="rt-ai-section-label">
              <BulbOutlined /> 优化当前正则
            </div>
            <div className="rt-ai-hint">作用于上方「当前正则」</div>
            <button
              type="button"
              className="rt-ai-btn rt-ai-btn--primary rt-ai-run-btn"
              onClick={handleOptimize}
              disabled={loading || !hasPattern}
            >
              <RocketOutlined /> 优化建议
            </button>
          </div>
        )}

        {/* 诊断匹配 Tab */}
        {activeTab === 'diagnose' && (
          <div className="rt-ai-section">
            <div className="rt-ai-section-label">
              <BugOutlined /> 诊断匹配
            </div>
            <textarea
              className="rt-ai-input rt-ai-diagnose-input"
              value={diagnoseSamples}
              onChange={(e) => setDiagnoseSamples(e.target.value)}
              placeholder="粘贴期望匹配 / 未匹配的文本，每行一条"
              disabled={loading}
              rows={3}
            />
            <button
              type="button"
              className="rt-ai-btn rt-ai-btn--primary rt-ai-run-btn"
              onClick={handleDiagnose}
              disabled={loading || !hasPattern || !diagnoseSamples.trim()}
            >
              <SendOutlined /> 诊断
            </button>
          </div>
        )}

        {/* 引擎转换 Tab */}
        {activeTab === 'convert' && (
          <div className="rt-ai-section">
            <div className="rt-ai-section-label">
              <SwapOutlined /> 引擎转换
            </div>
            <div className="rt-ai-convert-row">
              <select
                className="rt-ai-convert-select"
                value={convertSource}
                onChange={(e) => setConvertSource(e.target.value)}
                disabled={loading}
              >
                {ENGINES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              <span className="rt-ai-convert-arrow">→</span>
              <select
                className="rt-ai-convert-select"
                value={convertTarget}
                onChange={(e) => setConvertTarget(e.target.value)}
                disabled={loading}
              >
                {ENGINES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rt-ai-btn rt-ai-btn--primary rt-ai-run-btn"
                onClick={handleConvert}
                disabled={loading || !hasPattern || convertSource === convertTarget}
              >
                <SendOutlined /> 转换
              </button>
            </div>
          </div>
        )}

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
            {/* 生成 / 诊断修正表达式 */}
            {(result.pattern && (result.task === 'generate' || result.task === 'diagnose')) && (
              <div className="rt-ai-result-pattern">
                <code>/{result.pattern}/</code>
                <button
                  type="button"
                  className="rt-ai-apply-btn"
                  onClick={() => handleApply(result)}
                >
                  <CheckOutlined /> {result.task === 'diagnose' ? '采纳修正' : '应用'}
                </button>
              </div>
            )}

            {/* 转换结果 */}
            {result.task === 'convert' && result.convertedPattern && (
              <div className="rt-ai-result-pattern">
                <code>/{result.convertedPattern}/</code>
                <button
                  type="button"
                  className="rt-ai-apply-btn"
                  onClick={() => applyPattern(result.convertedPattern ?? '')}
                >
                  <CheckOutlined /> 应用
                </button>
              </div>
            )}
            {result.task === 'convert' && result.engine && (
              <div className="rt-ai-result-engine">目标引擎：{result.engine}</div>
            )}

            {/* 诊断原文对照 */}
            {result.task === 'diagnose' &&
              result.originalPattern &&
              result.pattern &&
              result.originalPattern !== result.pattern && (
                <div className="rt-ai-result-original">
                  原：<code>/{result.originalPattern}/</code>
                </div>
              )}

            {result.task === 'diagnose' && (
              <AiMarkdownSection prefix="rt" title="诊断" text={result.diagnosis} />
            )}
            {result.task === 'convert' && (
              <AiMarkdownSection prefix="rt" title="说明" text={result.explanation} />
            )}
            {result.task !== 'convert' && (
              <AiMarkdownSection prefix="rt" title="解释" text={result.explanation} />
            )}

            {/* 优化建议：逐条内嵌表达式，可一键应用 */}
            {result.suggestions && result.suggestions.length > 0 && (
              <div className="rt-ai-result-section">
                <h5>优化建议</h5>
                <ul className="rt-ai-result-suggestions">
                  {result.suggestions.map((s, i) => {
                    const parsed = parseSuggestion(s);
                    return (
                      <li key={i} className="rt-ai-suggestion-row">
                        <span className="rt-ai-suggestion-text">
                          {parsed ? parsed.reason : s}
                        </span>
                        {parsed?.pattern && (
                          <button
                            type="button"
                            className="rt-ai-apply-btn rt-ai-apply-btn--sm"
                            onClick={() => applyPattern(parsed.pattern)}
                          >
                            <CheckOutlined /> 应用
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* 兜底：所有展示字段都为空时，按任务类型显示友好提示 */}
            {!result.pattern &&
              !result.convertedPattern &&
              !result.diagnosis &&
              !result.explanation &&
              (!result.suggestions || result.suggestions.length === 0) && (
                <div className="rt-ai-result-empty-state">
                  {result.task === 'optimize' ? (
                    <>
                      <CheckCircleOutlined className="rt-ai-result-empty-icon" />
                      <span>当前正则已经很好，无需进一步优化</span>
                    </>
                  ) : result.task === 'diagnose' ? (
                    <>
                      <CheckCircleOutlined className="rt-ai-result-empty-icon" />
                      <span>当前正则匹配正常，无需修正</span>
                    </>
                  ) : result.task === 'convert' ? (
                    <>
                      <CheckCircleOutlined className="rt-ai-result-empty-icon" />
                      <span>转换完成，表达式无需改动</span>
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
