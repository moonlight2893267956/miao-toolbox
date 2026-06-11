import React from 'react';
import { Select, Switch, Space, Tag, Typography, Radio } from 'antd';
import { CodeOutlined, ColumnWidthOutlined, AlignLeftOutlined, BorderlessTableOutlined } from '@ant-design/icons';
import { useDiffContext } from './useDiffContext';
import type { Granularity, LayoutMode } from './types';

const { Text } = Typography;

const LANGUAGE_LABEL: Record<string, string> = {
  json: 'JSON', yaml: 'YAML', java: 'Java', python: 'Python',
  javascript: 'JavaScript', typescript: 'TypeScript', css: 'CSS',
  html: 'HTML', xml: 'XML', markdown: 'Markdown', sql: 'SQL', bash: 'Bash',
};

const LAYOUT_OPTIONS: { value: LayoutMode; label: string; icon: React.ReactNode }[] = [
  { value: 'split', label: '左右分栏', icon: <ColumnWidthOutlined /> },
  { value: 'unified', label: '行内统一', icon: <AlignLeftOutlined /> },
  { value: 'stacked', label: '上下分层', icon: <BorderlessTableOutlined /> },
];

const Toolbar: React.FC = () => {
  const {
    state, setGranularity, setLayout, setIgnoreWhitespace, setShowLineNumbers,
  } = useDiffContext();

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
      {/* 粒度选择器 */}
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

      {/* 布局切换 */}
      <Space>
        <Text type="secondary">布局：</Text>
        <Radio.Group
          value={state.layout}
          onChange={(e) => setLayout(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="small"
        >
          {LAYOUT_OPTIONS.map(opt => (
            <Radio.Button key={opt.value} value={opt.value}>
              <Space size={4}>
                {opt.icon}
                <span style={{ fontSize: 12 }}>{opt.label}</span>
              </Space>
            </Radio.Button>
          ))}
        </Radio.Group>
      </Space>

      {/* 行号开关 */}
      <Space>
        <Text type="secondary">行号：</Text>
        <Switch checked={state.showLineNumbers} onChange={setShowLineNumbers} />
      </Space>

      {/* 忽略空白符开关 */}
      <Space>
        <Text type="secondary">忽略空白符：</Text>
        <Switch checked={state.ignoreWhitespace} onChange={setIgnoreWhitespace} />
      </Space>

      <div style={{ flex: 1 }} />

      {/* 语言类型标识 */}
      {state.language && (
        <Tag icon={<CodeOutlined />} color="purple">
          {LANGUAGE_LABEL[state.language] ?? state.language.toUpperCase()}
        </Tag>
      )}
    </div>
  );
};

export default Toolbar;
