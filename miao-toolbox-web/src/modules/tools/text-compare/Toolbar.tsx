import React from 'react';
import { Select, Switch, Space, Tag, Typography } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import { useDiffContext } from './DiffProvider';
import type { Granularity } from './types';

const { Text } = Typography;

const LANGUAGE_LABEL: Record<string, string> = {
  json: 'JSON',
  yaml: 'YAML',
  java: 'Java',
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  css: 'CSS',
  html: 'HTML',
  xml: 'XML',
  markdown: 'Markdown',
  sql: 'SQL',
  bash: 'Bash',
};

const Toolbar: React.FC = () => {
  const { state, setGranularity, setIgnoreWhitespace, setShowLineNumbers } = useDiffContext();

  return (
    <div
      className="miao-diff-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '12px 16px',
        background: 'var(--miao-surface, #fff)',
        border: '1px solid var(--miao-border, #e6e3f0)',
        borderRadius: 6,
        marginBottom: 12,
        flexWrap: 'wrap',
      }}
    >
      <Space>
        <Text type="secondary">粒度：</Text>
        <Select<Granularity>
          value={state.granularity}
          onChange={setGranularity}
          style={{ width: 110 }}
          options={[
            { value: 'char', label: '字符级' },
            { value: 'word', label: '词级' },
            { value: 'line', label: '行级' },
          ]}
        />
      </Space>

      <Space>
        <Text type="secondary">行号：</Text>
        <Switch checked={state.showLineNumbers} onChange={setShowLineNumbers} />
      </Space>

      <Space>
        <Text type="secondary">忽略空白符：</Text>
        <Switch checked={state.ignoreWhitespace} onChange={setIgnoreWhitespace} />
      </Space>

      <div style={{ flex: 1 }} />

      {state.language && (
        <Tag icon={<CodeOutlined />} color="purple">
          {LANGUAGE_LABEL[state.language] ?? state.language.toUpperCase()}
        </Tag>
      )}
    </div>
  );
};

export default Toolbar;
