import React from 'react';
import { Segmented, Switch } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import { useDiffContext } from './useDiffContext';
import type { Granularity, LayoutMode } from './types';

const LANGUAGE_LABEL: Record<string, string> = {
  json: 'JSON', yaml: 'YAML', java: 'Java', python: 'Python',
  javascript: 'JavaScript', typescript: 'TypeScript', css: 'CSS',
  html: 'HTML', xml: 'XML', markdown: 'Markdown', sql: 'SQL', bash: 'Bash',
};

const Toolbar: React.FC = () => {
  const { state, setGranularity, setLayout, setIgnoreWhitespace, setStructuredDiff, setShowLineNumbers } = useDiffContext();
  const isJsonYaml = state.language === 'json' || state.language === 'yaml' || state.language === 'yml';

  return (
    <div className="dt-toolbar">
      <div className="dt-toolbar-group">
        <span className="dt-toolbar-label">粒度</span>
        <Segmented<Granularity>
          value={state.granularity}
          onChange={setGranularity}
          size="small"
          options={[
            { value: 'char', label: '字符级' },
            { value: 'word', label: '词级' },
            { value: 'line', label: '行级' },
          ]}
        />
      </div>

      <div className="dt-toolbar-group">
        <span className="dt-toolbar-label">布局</span>
        <Segmented<LayoutMode>
          value={state.layout}
          onChange={setLayout}
          size="small"
          options={[
            { value: 'split', label: '◫ 分栏' },
            { value: 'unified', label: '☰ 统一' },
            { value: 'stacked', label: '⊞ 堆叠' },
          ]}
        />
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
