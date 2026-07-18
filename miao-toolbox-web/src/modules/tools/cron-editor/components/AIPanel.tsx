import React, { useState } from 'react';
import {
  CloseOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  CheckOutlined,
  StopOutlined,
  SendOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  BulbOutlined,
  BugOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import AiMarkdownSection from '../../../../components/shared/AiMarkdownSection';
import { useCronContext } from '../useCronContext';
import { useCronAI, type CronAIResult } from '../hooks/useCronAI';
import { validate } from '../utils/cronValidator';
import type { CronDialect } from '../types';

/**
 * AI 增强面板（Epic 3 / Story 3.1–3.3）：
 * - 生成（GENERATE）：自然语言 → Cron 表达式 + 说明，可采纳回填
 * - 详解（EXPLAIN）：当前表达式 → 中文深度解读（只读）
 * - 优化（OPTIMIZE）：当前表达式 → 优化建议 + 优化后表达式，可采纳回填
 * - 排错（DIAGNOSE）：当前表达式 + 现象 → 根因诊断（只读）
 * - 转换（CONVERT）：当前表达式 → 目标方言表达式 + 说明，可采纳回填并切方言
 *
 * 所有「采纳」均经本地校验安全网（validate），非法表达式拦截，防止 LLM 幻觉污染编辑器。
 */
type TabKey = 'generate' | 'explain' | 'optimize' | 'diagnose' | 'convert';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'generate', label: '生成', icon: <ThunderboltOutlined /> },
  { key: 'explain', label: '详解', icon: <FileTextOutlined /> },
  { key: 'optimize', label: '优化', icon: <BulbOutlined /> },
  { key: 'diagnose', label: '排错', icon: <BugOutlined /> },
  { key: 'convert', label: '转换', icon: <SwapOutlined /> },
];

const TASK_VERB: Record<TabKey, string> = {
  generate: '生成',
  explain: '解释',
  optimize: '优化',
  diagnose: '诊断',
  convert: '转换',
};

/**
 * 从诊断/说明文本中提取 Cron 表达式（Agent 可能不输出结构化 expression，
 * 而是把修正结果嵌在 prose / 反引号中，如「建议改为 `0 0 L 2 *`」）。
 * 仅当片段形如 5/6 段合法 Cron（且至少一段含特殊字符）才认领，避免误匹配普通数字序列。
 */
const CRON_FIELD = '[0-9*,?/\\-LW#H]+';
const CRON_RE = new RegExp(`(?:${CRON_FIELD}\\s+){4,5}${CRON_FIELD}`, 'g');

function looksLikeCron(s: string): boolean {
  const fields = s.trim().split(/\s+/);
  if (fields.length !== 5 && fields.length !== 6) return false;
  return fields.some((f) => /[*?,/\-LW#H]/.test(f));
}

function extractCronExpression(text: string): string | null {
  if (!text) return null;
  // 1) 优先：反引号 / 代码块包裹的片段
  const ticks = text.match(/`([^`]+)`/g);
  if (ticks) {
    for (const t of ticks) {
      const inner = t.slice(1, -1).trim();
      if (looksLikeCron(inner)) return inner;
    }
  }
  // 2) 行内 5/6 段 Cron
  const matches = text.match(CRON_RE);
  if (matches) {
    for (const m of matches) {
      const candidate = m.trim();
      if (looksLikeCron(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * 按表达式字段数推断方言：5 段 → linux5，6 段 → spring6。
 * 用于 AI 采纳兜底校验（避免误用「转换 Tab 的 targetDialect」导致方言错位）。
 */
function detectDialectFromExpression(expr: string): CronDialect | null {
  const fields = expr.trim().split(/\s+/).filter((f) => f.length > 0);
  if (fields.length === 5) return 'linux5';
  if (fields.length === 6) return 'spring6';
  return null;
}

const AIPanel: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const { state, setExpression, setDialect } = useCronContext();
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
  } = useCronAI();

  const [activeTab, setActiveTab] = useState<TabKey>('generate');
  const [description, setDescription] = useState('');
  const [exprInput, setExprInput] = useState(state.expression);
  const [phenomenon, setPhenomenon] = useState('');
  const [targetDialect, setTargetDialect] = useState<CronDialect>(
    state.dialect === 'linux5' ? 'spring6' : 'linux5',
  );
  const [adoptError, setAdoptError] = useState<string | null>(null);

  const isActive = loading || streaming;

  /** 切换 Tab：清空旧结果与采纳拦截提示，并把表达式输入同步为当前编辑器表达式 */
  const handleTabChange = (tab: TabKey) => {
    if (isActive) cancel();
    reset();
    setAdoptError(null);
    setActiveTab(tab);
    setExprInput(state.expression);
  };

  /** 通用采纳：经本地 validate 安全网，通过才回填（可选同时切方言） */
  const acceptExpression = (expr: string, dialect: CronDialect, switchDialect?: CronDialect) => {
    const validation = validate(expr, dialect);
    if (!validation.valid) {
      const reason = validation.errors.map((e) => e.message).join('；');
      setAdoptError(`AI 返回的表达式无效（${reason}），已忽略，可重试`);
      return;
    }
    setExpression(expr);
    if (switchDialect) setDialect(switchDialect);
    reset();
    setAdoptError(null);
    onClose();
  };

  /* ── 各任务触发 ── */
  const handleGenerate = () => {
    if (!description.trim()) return;
    setAdoptError(null);
    generate(description.trim(), state.dialect);
  };

  const handleExplain = () => {
    if (!exprInput.trim()) return;
    setAdoptError(null);
    explain(exprInput.trim(), state.dialect);
  };

  const handleOptimize = () => {
    if (!exprInput.trim()) return;
    setAdoptError(null);
    optimize(exprInput.trim(), state.dialect);
  };

  const handleDiagnose = () => {
    if (!exprInput.trim() || !phenomenon.trim()) return;
    setAdoptError(null);
    diagnose(exprInput.trim(), phenomenon.trim(), state.dialect);
  };

  const handleConvert = () => {
    if (!exprInput.trim()) return;
    setAdoptError(null);
    convert(exprInput.trim(), targetDialect, state.dialect);
  };

  const dialectLabel = (d: CronDialect) => (d === 'spring6' ? '6 位 / Quartz' : '5 位 / Linux');

  return (
    <div className="ce-ai-panel">
      {/* ── Header ── */}
      <div className="ce-ai-header">
        <div className="ce-ai-header-left">
          <div className="ce-ai-icon">
            <RobotOutlined />
          </div>
          <div className="ce-ai-title-block">
            <span className="ce-ai-title">AI Cron 助手</span>
            <span className="ce-ai-subtitle">CRON ASSISTANT</span>
          </div>
        </div>
        <button
          type="button"
          className="ce-ai-close"
          onClick={onClose}
          aria-label="关闭 AI 面板"
        >
          <CloseOutlined />
        </button>
      </div>

      {/* ── Tab 导航 ── */}
      <div className="ce-ai-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`ce-ai-tab ${activeTab === tab.key ? 'ce-ai-tab--active' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Status Bar ── */}
      {isActive && (
        <div className="ce-ai-status">
          <span className="ce-ai-status-pill ce-ai-status-pill--streaming">
            <span className="ce-ai-status-dot" />
            {streaming ? `${TASK_VERB[activeTab]}中` : '思考中'}
          </span>
          {streaming && (
            <button
              type="button"
              className="ce-ai-icon-btn ce-ai-icon-btn--cancel"
              onClick={cancel}
            >
              <StopOutlined /> 停止
            </button>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className="ce-ai-body">
        {/* 空状态 */}
        {!isActive && !result && !error && !adoptError && (
          <div className="ce-ai-empty">
            <div className="ce-ai-empty-icon">
              <ExperimentOutlined />
            </div>
            <h4>AI Cron 助手</h4>
            <p>用自然语言生成、详解、优化、排错或转换 Cron 表达式</p>
          </div>
        )}

        {/* 生成 Tab */}
        {activeTab === 'generate' && (
          <div className="ce-ai-section">
            <div className="ce-ai-section-label">
              <ThunderboltOutlined /> 自然语言生成
            </div>
            <div className="ce-ai-input-row">
              <input
                type="text"
                className="ce-ai-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="如：每天工作日早上 9 点半"
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                disabled={loading}
              />
              <button
                type="button"
                className="ce-ai-btn ce-ai-btn--primary"
                onClick={handleGenerate}
                disabled={loading || !description.trim()}
              >
                <SendOutlined /> 生成
              </button>
            </div>
          </div>
        )}

        {/* 详解 / 优化 / 排错 / 转换 Tab 共用的表达式输入 */}
        {activeTab !== 'generate' && (
          <div className="ce-ai-section">
            <div className="ce-ai-section-label">
              {TABS.find((t) => t.key === activeTab)?.icon} 当前表达式
            </div>
            <input
              type="text"
              className="ce-ai-input"
              value={exprInput}
              onChange={(e) => setExprInput(e.target.value)}
              placeholder="留空则使用编辑器当前表达式"
              disabled={loading}
            />
          </div>
        )}

        {/* 排错 Tab 现象输入 */}
        {activeTab === 'diagnose' && (
          <div className="ce-ai-section">
            <div className="ce-ai-section-label">
              <BugOutlined /> 现象描述
            </div>
            <input
              type="text"
              className="ce-ai-input"
              value={phenomenon}
              onChange={(e) => setPhenomenon(e.target.value)}
              placeholder="如：我的任务没有按时触发"
              onKeyDown={(e) => e.key === 'Enter' && handleDiagnose()}
              disabled={loading}
            />
          </div>
        )}

        {/* 转换 Tab 目标方言选择 */}
        {activeTab === 'convert' && (
          <div className="ce-ai-section">
            <div className="ce-ai-section-label">
              <SwapOutlined /> 目标方言
            </div>
            <div className="ce-ai-dialect-switch">
              {(['linux5', 'spring6'] as CronDialect[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`ce-ai-dialect-btn ${
                    targetDialect === d ? 'ce-ai-dialect-btn--active' : ''
                  }`}
                  onClick={() => setTargetDialect(d)}
                  disabled={loading}
                >
                  {dialectLabel(d)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 任务触发按钮（非生成 Tab） */}
        {activeTab !== 'generate' && (
          <div className="ce-ai-section">
            <button
              type="button"
              className="ce-ai-btn ce-ai-btn--primary ce-ai-run-btn"
              onClick={
                activeTab === 'explain'
                  ? handleExplain
                  : activeTab === 'optimize'
                    ? handleOptimize
                    : activeTab === 'diagnose'
                      ? handleDiagnose
                      : handleConvert
              }
              disabled={
                loading ||
                !exprInput.trim() ||
                (activeTab === 'diagnose' && !phenomenon.trim())
              }
            >
              <SendOutlined />
              {TASK_VERB[activeTab]}
            </button>
          </div>
        )}

        {/* 流式输出中：思考动画，原始 JSON 默认折叠 */}
        {streaming && (
          <div className="ce-ai-thinking">
            <div className="ce-ai-thinking-orb">
              <span className="ce-ai-thinking-pulse" />
              <span className="ce-ai-thinking-pulse ce-ai-thinking-pulse--delay" />
              <RobotOutlined className="ce-ai-thinking-icon" />
            </div>
            <div className="ce-ai-thinking-label">AI 正在{streaming ? TASK_VERB[activeTab] : '思考'}</div>
            <div className="ce-ai-thinking-dots">
              <span />
              <span />
              <span />
            </div>
            {streamText && streamText.length > 20 && (
              <details className="ce-ai-thinking-debug">
                <summary>查看实时输出</summary>
                <pre>{streamText}</pre>
              </details>
            )}
          </div>
        )}

        {/* Error */}
        {error && !streaming && (
          <div className="ce-ai-error">
            <span className="ce-ai-error-icon">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* 采纳安全网拦截提示 */}
        {adoptError && !streaming && (
          <div className="ce-ai-error">
            <span className="ce-ai-error-icon">⚠</span>
            <span>{adoptError}</span>
          </div>
        )}

        {/* 结果区：根据任务类型渲染 */}
        {result && !streaming && (
          <CronAIResultView
            result={result}
            targetDialect={targetDialect}
            currentExpression={state.expression}
            currentDialect={state.dialect}
            streamText={streamText}
            onAdopt={acceptExpression}
          />
        )}
      </div>
    </div>
  );
};

/** 结果渲染：按 task 展示对应字段 */
const CronAIResultView: React.FC<{
  result: CronAIResult;
  targetDialect: CronDialect;
  currentExpression: string;
  currentDialect: CronDialect;
  streamText: string;
  onAdopt: (expr: string, dialect: CronDialect, switchDialect?: CronDialect) => void;
}> = ({ result, targetDialect, currentExpression, currentDialect, streamText, onAdopt }) => {
  /**
   * 非 convert 任务的「采纳」方言解析：result.dialect 优先（Agent 显式声明），
   * 否则按表达式字段数推断（5→linux5 / 6→spring6），最后回退到编辑器当前方言。
   * 关键：不能回退到 targetDialect（那是 convert Tab 的目标方言，与当前场景无关）。
   */
  const resolveAdoptDialect = (expr: string): CronDialect => {
    if (result.dialect === 'linux5' || result.dialect === 'spring6') return result.dialect;
    return detectDialectFromExpression(expr) ?? currentDialect;
  };
  const { task } = result;

  // 生成：有 expression 可采纳
  if (task === 'generate' && result.expression) {
    const adoptDialect = resolveAdoptDialect(result.expression);
    return (
      <div className="ce-ai-result">
        <div className="ce-ai-result-expression">
          <code>{result.expression}</code>
          {result.dialect && (
            <span className="ce-ai-result-dialect">
              {result.dialect === 'spring6' ? '6 位 / Quartz' : '5 位 / Linux'}
            </span>
          )}
          <button
            type="button"
            className="ce-ai-apply-btn"
            onClick={() => onAdopt(result.expression!, adoptDialect, adoptDialect)}
          >
            <CheckOutlined /> 采纳
          </button>
        </div>
        <AiMarkdownSection prefix="ce" title="说明" text={result.explanation} />
      </div>
    );
  }

  // 优化：兼容两种 agent 契约
  //  - 文档契约（design-cron-ai-agent.md §6）：每条 suggestion 内嵌优化后表达式 "{expr} — {理由}"，逐条「应用」
  //  - 兼容旧契约：结构化 optimizedExpression / expression 单条「采纳」
  if (task === 'optimize') {
    const singleExpr = result.expression || result.optimizedExpression;
    const hasSuggestions = result.suggestions && result.suggestions.length > 0;
    if (singleExpr || hasSuggestions || result.explanation) {
      return (
        <div className="ce-ai-result">
          {singleExpr && !hasSuggestions && (
            <div className="ce-ai-result-expression">
              {result.originalExpression && (
                <span className="ce-ai-result-from">{result.originalExpression}</span>
              )}
              <code>{singleExpr}</code>
              {result.dialect && (
                <span className="ce-ai-result-dialect">
                  {result.dialect === 'spring6' ? '6 位 / Quartz' : '5 位 / Linux'}
                </span>
              )}
              <button
                type="button"
                className="ce-ai-apply-btn"
                onClick={() => {
                  const d = resolveAdoptDialect(singleExpr);
                  onAdopt(singleExpr, d, d);
                }}
              >
                <CheckOutlined /> 采纳
              </button>
            </div>
          )}
          <AiMarkdownSection prefix="ce" title="说明" text={result.explanation} />
          {hasSuggestions && (
            <div className="ce-ai-result-section">
              <h5>优化建议</h5>
              <ul className="ce-ai-suggest-list">
                {result.suggestions!.map((s, i) => {
                  const expr = extractCronExpression(s);
                  const canApply = expr != null && expr !== currentExpression;
                  return (
                    <li key={i} className="ce-ai-suggest-item">
                      <span className="ce-ai-suggest-text">{s}</span>
                      {canApply && (
                        <button
                          type="button"
                          className="ce-ai-apply-btn ce-ai-apply-btn--mini"
                          onClick={() => {
                            const d = resolveAdoptDialect(expr!);
                            onAdopt(expr!, d, d);
                          }}
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
        </div>
      );
    }
  }

  // 转换：有 convertedExpression 可采纳 + 切方言
  if (task === 'convert' && result.convertedExpression) {
    return (
      <div className="ce-ai-result">
        <div className="ce-ai-result-expression">
          <code>{result.convertedExpression}</code>
          <span className="ce-ai-result-dialect">
            {targetDialect === 'spring6' ? '6 位 / Quartz' : '5 位 / Linux'}
          </span>
          <button
            type="button"
            className="ce-ai-apply-btn"
            onClick={() => onAdopt(result.convertedExpression!, targetDialect, targetDialect)}
          >
            <CheckOutlined /> 采纳
          </button>
        </div>
        <AiMarkdownSection prefix="ce" title="转换说明" text={result.explanation} />
      </div>
    );
  }

  // 排错：修正表达式（结构化 expression/optimizedExpression，或嵌在诊断文本中）+ 采纳修正
  if (task === 'diagnose') {
    const fromText =
      extractCronExpression(result.diagnosis || '') ||
      extractCronExpression(result.explanation || '');
    const adoptExpr =
      result.expression ||
      result.optimizedExpression ||
      (fromText && fromText !== currentExpression ? fromText : null);
    const originalForDisplay =
      result.originalExpression ??
      (adoptExpr && currentExpression && currentExpression !== adoptExpr ? currentExpression : null);
    if (adoptExpr || result.explanation || result.diagnosis) {
      return (
        <div className="ce-ai-result">
          {adoptExpr && (
            <div className="ce-ai-result-expression">
              {originalForDisplay && (
                <span className="ce-ai-result-from">{originalForDisplay}</span>
              )}
              <code>{adoptExpr}</code>
              {result.dialect && (
                <span className="ce-ai-result-dialect">
                  {result.dialect === 'spring6' ? '6 位 / Quartz' : '5 位 / Linux'}
                </span>
              )}
              <button
                type="button"
                className="ce-ai-apply-btn"
                onClick={() => {
                  const d = resolveAdoptDialect(adoptExpr);
                  onAdopt(adoptExpr, d, d);
                }}
              >
                <CheckOutlined /> 采纳修正
              </button>
            </div>
          )}
          <AiMarkdownSection prefix="ce" title="说明" text={result.explanation} />
          <AiMarkdownSection prefix="ce" title="诊断" text={result.diagnosis} />
        </div>
      );
    }
  }

  // 详解 / 其它文本类结果
  if (result.explanation || result.diagnosis) {
    const readOnlyExpr = task === 'explain' ? result.expression : null;
    return (
      <div className="ce-ai-result">
        {readOnlyExpr && (
          <div className="ce-ai-result-expression">
            <code>{readOnlyExpr}</code>
          </div>
        )}
        <AiMarkdownSection
          prefix="ce"
          title={task === 'explain' ? '详解' : '说明'}
          text={result.explanation}
        />
        <AiMarkdownSection prefix="ce" title="诊断" text={result.diagnosis} />
      </div>
    );
  }

  // 兜底空状态（展示原始输出便于排查）
  return (
    <div className="ce-ai-result-empty-state">
      <ExperimentOutlined className="ce-ai-result-empty-icon" />
      <span>未获得有效结果，请重试</span>
      {streamText && (
        <pre className="ce-ai-raw-output">{streamText}</pre>
      )}
    </div>
  );
};

export default AIPanel;
