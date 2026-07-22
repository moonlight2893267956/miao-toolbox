import React from 'react';
import {
  ColumnHeightOutlined, EyeOutlined, AlignLeftOutlined,
  ApartmentOutlined, CodeOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useDiffContext } from './useDiffContext';
import type { LayoutMode } from './types';

const LANGUAGE_LABEL: Record<string, string> = {
  json: 'JSON', yaml: 'YAML',
  javascript: 'JavaScript', typescript: 'TypeScript', css: 'CSS',
  html: 'HTML', xml: 'XML', markdown: 'Markdown', sql: 'SQL',
};

interface ChipProps {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  ariaLabel: string;
}

const Chip: React.FC<ChipProps> = ({ icon, label, active, onClick, ariaLabel }) => (
  <button
    type="button"
    className={`tc-pill${active ? ' is-active' : ''}`}
    onClick={onClick}
    role="switch"
    aria-checked={active ?? undefined}
    aria-label={ariaLabel}
  >
    {icon}
    <span className="tc-pill-label">{label}</span>
  </button>
);

const Toolbar: React.FC<{ onCompare: () => void }> = ({ onCompare }) => {
  const { state, setLayout, setIgnoreWhitespace, setStructuredDiff, setShowLineNumbers, setWordWrap } = useDiffContext();
  const isJsonYaml = state.language === 'json' || state.language === 'yaml' || state.language === 'yml';
  const canCompare = Boolean(state.leftText || state.rightText);

  const layoutOptions: Array<{ value: LayoutMode; label: string; icon: React.ReactNode }> = [
    { value: 'split', label: '分栏', icon: <ColumnHeightOutlined /> },
    { value: 'stacked', label: '堆叠', icon: <ApartmentOutlined /> },
  ];

  return (
    <div className="tc-toolbar">
      <div className="tc-toolbar-group">
        <span className="tc-toolbar-label">布局</span>
        <div className="tc-pill-group" role="radiogroup" aria-label="展示布局">
          {layoutOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`tc-pill${state.layout === opt.value ? ' is-active' : ' is-icon-only'}`}
              onClick={() => setLayout(opt.value)}
              role="radio"
              aria-checked={state.layout === opt.value}
            >
              {opt.icon}
              <span className="tc-pill-label">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="tc-toolbar-group">
        <Chip
          icon={<EyeOutlined />}
          label="行号"
          active={state.showLineNumbers}
          onClick={() => setShowLineNumbers(!state.showLineNumbers)}
          ariaLabel="切换行号显示"
        />
        <Chip
          label="换行"
          active={state.wordWrap}
          onClick={() => setWordWrap(!state.wordWrap)}
          ariaLabel="切换自动换行"
        />
        <Chip
          icon={<AlignLeftOutlined />}
          label="忽略空白"
          active={state.ignoreWhitespace}
          onClick={() => setIgnoreWhitespace(!state.ignoreWhitespace)}
          ariaLabel="切换忽略空白"
        />
        {isJsonYaml && (
          <Chip
            icon={<CodeOutlined />}
            label="结构化"
            active={state.structuredDiff}
            onClick={() => setStructuredDiff(!state.structuredDiff)}
            ariaLabel="切换结构化对比"
          />
        )}
      </div>

      <div className="tc-toolbar-group" style={{ marginLeft: 'auto' }}>
        {state.language && (
          <span className="tc-lang-tag">
            {LANGUAGE_LABEL[state.language] ?? state.language.toUpperCase()}
          </span>
        )}
        <Tooltip title="Ctrl + Enter" mouseEnterDelay={0.4}>
          <button
            type="button"
            className="tc-pill tc-compare-btn is-active"
            onClick={onCompare}
            disabled={!canCompare || state.loading}
            aria-label="开始对比 (Ctrl+Enter)"
          >
            <ThunderboltOutlined />
            <span className="tc-pill-label">{state.loading ? '对比中…' : '对比'}</span>
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default Toolbar;
