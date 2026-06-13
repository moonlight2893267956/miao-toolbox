import React from 'react';
import { Switch } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import { useDiffContext } from './useDiffContext';
import type { LayoutMode } from './types';

const LANGUAGE_LABEL: Record<string, string> = {
  json: 'JSON', yaml: 'YAML', java: 'Java', python: 'Python',
  javascript: 'JavaScript', typescript: 'TypeScript', css: 'CSS',
  html: 'HTML', xml: 'XML', markdown: 'Markdown', sql: 'SQL', bash: 'Bash',
};

const Toolbar: React.FC = () => {
  const { state, setLayout, setIgnoreWhitespace, setStructuredDiff, setShowLineNumbers } = useDiffContext();
  const isJsonYaml = state.language === 'json' || state.language === 'yaml' || state.language === 'yml';
  const layoutOptions: Array<{ value: LayoutMode; label: string }> = [
    { value: 'split', label: '◫ 分栏' },
    { value: 'stacked', label: '⊞ 堆叠' },
  ];

  return (
    <div className="dt-toolbar">
      <div className="dt-toolbar-group">
        <span className="dt-toolbar-label">布局</span>
        <div className="dt-pill-group" role="radiogroup" aria-label="展示布局">
          {layoutOptions.map(option => (
            <button
              key={option.value}
              type="button"
              className={`dt-pill${state.layout === option.value ? ' is-active' : ''}`}
              onClick={() => setLayout(option.value)}
              role="radio"
              aria-checked={state.layout === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <label className="dt-toolbar-group dt-switch-group">
        <span className="dt-toolbar-label">行号</span>
        <Switch checked={state.showLineNumbers} onChange={setShowLineNumbers} size="small" />
      </label>

      <label className="dt-toolbar-group dt-switch-group">
        <span className="dt-toolbar-label">忽略空白</span>
        <Switch checked={state.ignoreWhitespace} onChange={setIgnoreWhitespace} size="small" />
      </label>

      {isJsonYaml && (
        <label className="dt-toolbar-group dt-switch-group">
          <span className="dt-toolbar-label">结构化</span>
          <Switch checked={state.structuredDiff} onChange={setStructuredDiff} size="small" />
        </label>
      )}

      <div className="dt-toolbar-group dt-toolbar-tail">
        {state.language && (
          <span className="dt-lang-tag">
            <CodeOutlined /> {LANGUAGE_LABEL[state.language] ?? state.language.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
};

export default Toolbar;
