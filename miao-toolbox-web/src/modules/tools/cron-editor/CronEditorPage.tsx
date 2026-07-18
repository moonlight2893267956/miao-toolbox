// Cron 表达式编辑器 — 页面（布局语言与正则测试器对齐）
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClockCircleOutlined, ThunderboltOutlined, RobotOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { CronProvider } from './CronProvider';
import { useCronContext } from './useCronContext';
import ExpressionInput from './components/ExpressionInput';
import VisualBuilder from './components/VisualBuilder';
import PresetBar from './components/PresetBar';
import HumanReadable from './components/HumanReadable';
import NextRunsPreview from './components/NextRunsPreview';
import CodeGenerator from './components/CodeGenerator';
import CheatSheet from './components/CheatSheet';
import HistoryPanel from './components/HistoryPanel';
import AIDrawer from './components/AIDrawer';
import { FIELD_DEFS, FIELD_ORDER_5, FIELD_ORDER_6 } from './types';
import { addHistoryItem } from './utils/cronHistory';
import { transformDialect } from './utils/cronDialect';
import './cron-editor.css';

const { Text } = Typography;

const SAMPLE_EXPRESSION = '*/15 9-17 * * 1-5';

const CronEditorContent: React.FC = () => {
  const { state, setExpression, validation } = useCronContext();
  const order = state.dialect === 'linux5' ? FIELD_ORDER_5 : FIELD_ORDER_6;
  const [showAIDrawer, setShowAIDrawer] = useState(false);

  // 按当前方言适配示例：5 位模式直接填入；6 位模式自动补秒字段 0。
  // 这样无论用户当前在哪种方言下点「示例」都不会触发字段数不符的结构错误。
  const fillSample = useCallback(
    () => setExpression(transformDialect(SAMPLE_EXPRESSION, 'linux5', state.dialect)),
    [setExpression, state.dialect],
  );

  // FR-18：表达式校验通过且非空时，防抖（800ms）自动写入本地历史（去重 + 截断 50）
  useEffect(() => {
    const expr = state.expression.trim();
    if (!validation.valid || expr === '') return;
    const timer = window.setTimeout(() => {
      addHistoryItem(expr, state.dialect);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [state.expression, state.dialect, validation.valid]);

  const legend = useMemo(
    () =>
      order.map((type) => ({
        label: FIELD_DEFS[type].label,
        range: `${FIELD_DEFS[type].min}-${FIELD_DEFS[type].max}`,
      })),
    [order],
  );

  return (
    <div className="ce-page">
      <header className="ce-header">
        <div className="ce-header-inner">
          <div className="ce-header-icon">
            <ClockCircleOutlined />
          </div>
          <div className="ce-header-text">
            <h2>Cron 表达式编辑器</h2>
            <div className="ce-header-subtitle">
              <span className="ce-dot" />
              实时语法/语义校验 · 5/6 位方言切换
            </div>
          </div>
          <div className="ce-action-group">
            <button
              type="button"
              className="ce-action-btn"
              onClick={fillSample}
              aria-label="填入示例表达式"
            >
              <ThunderboltOutlined /> 示例
            </button>
            <CodeGenerator />
            <CheatSheet />
            <HistoryPanel />
            <button
              type="button"
              className={`ce-ai-trigger ${showAIDrawer ? 'ce-ai-trigger--active' : ''}`}
              onClick={() => setShowAIDrawer((v) => !v)}
              aria-label="AI Cron 助手"
            >
              <RobotOutlined /> AI 助手
            </button>
          </div>
        </div>
      </header>

      <section className="ce-command-bar">
        <ExpressionInput />
      </section>

      <PresetBar />

      <section className="ce-panel">
        <VisualBuilder />
      </section>

      <section className="ce-preview">
        <HumanReadable />
        <NextRunsPreview />
      </section>

      <div className="ce-legend">
        {legend.map((item, i) => (
          <span key={i} className="ce-legend-item">
            <span className="ce-legend-label">{item.label}</span>
            <Text type="secondary" className="ce-legend-range">
              {item.range}
            </Text>
          </span>
        ))}
      </div>

      <Text type="secondary" className="ce-hint">
        在上方输入框键入或粘贴 Cron 表达式，字段将按位置着色并实时校验。
      </Text>

      <AIDrawer open={showAIDrawer} onClose={() => setShowAIDrawer(false)} />
    </div>
  );
};

const CronEditorPage: React.FC = () => (
  <CronProvider>
    <CronEditorContent />
  </CronProvider>
);

export default CronEditorPage;
