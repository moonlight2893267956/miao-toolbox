import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Input, Space, Tag, Typography, message } from 'antd';
import { RightOutlined, SearchOutlined } from '@ant-design/icons';
import { toolsRegistry, getToolsByCategory } from './registry';
import type { ToolMeta } from './registry';

const { Text } = Typography;

const ToolsPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filteredTools = toolsRegistry.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase())),
  );

  const availableTools = getToolsByCategory('available').filter((t) =>
    filteredTools.some((ft) => ft.key === t.key),
  );
  const comingSoonTools = getToolsByCategory('coming-soon').filter((t) =>
    filteredTools.some((ft) => ft.key === t.key),
  );

  const handleToolClick = (path: string | null, title: string) => {
    if (path) {
      navigate(path);
    } else {
      message.info(`${title} 正在接入中`);
    }
  };

  const renderToolCard = (tool: ToolMeta) => {
    const Icon = tool.icon;
    return (
      <button
        key={tool.key}
        type="button"
        className="miao-tool-card"
        onClick={() => handleToolClick(tool.path, tool.title)}
      >
        <span className="miao-tool-card-top">
          <span className="miao-tool-icon"><Icon /></span>
          <span className={`miao-tool-status ${tool.available ? 'miao-tool-status--available' : 'miao-tool-status--coming-soon'}`}>{tool.status}</span>
        </span>
        <span>
          <h3>{tool.title}</h3>
          <p>{tool.description}</p>
          <span className="miao-tool-meta">
            {tool.tags.map((tag) => (
              <span key={tag} className="miao-tool-pill">{tag}</span>
            ))}
          </span>
        </span>
        <span className="miao-tool-card-footer">
          <Tag color="default" style={{ marginInlineEnd: 0 }}>AI Tool</Tag>
          <span
            className="miao-tool-open"
            aria-label={`打开${tool.title}`}
          >
            <RightOutlined />
          </span>
        </span>
      </button>
    );
  };

  return (
    <div>
      <header className="miao-page-header">
        <div>
          <div className="miao-page-eyebrow">工具列表</div>
          <h1 className="miao-page-title">今天想让 AI 帮你做点什么？</h1>
          <p className="miao-page-description">
            常用能力集中在这里。后续接入新的模型或供应商时，入口保持一致，密钥和访问控制留在服务端。
          </p>
        </div>
        <div className="miao-tools-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索工具"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 'min(220px, 100%)' }}
          />
        </div>
      </header>

      <section className="miao-quick-panel" aria-label="工具箱概览">
        <Card className="miao-side-card">
          <Space direction="vertical" size={8}>
            <Text type="secondary">最近状态</Text>
            <Text strong style={{ fontSize: 18 }}>网关、认证和请求签名已启用</Text>
            <Text type="secondary">
              所有 AI 请求会通过服务端代理层转发，前端只保留短期访问凭据。
            </Text>
          </Space>
        </Card>
        <div className="miao-stat-row">
          <div className="miao-stat">
            <strong>{toolsRegistry.length}</strong>
            <span>工具入口</span>
          </div>
          <div className="miao-stat">
            <strong>{getToolsByCategory('available').length}</strong>
            <span>已可用</span>
          </div>
          <div className="miao-stat">
            <strong>JWT</strong>
            <span>认证模式</span>
          </div>
        </div>
      </section>

      {availableTools.length > 0 && (
        <section aria-label="已可用工具">
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '24px 0 12px' }}>已可用</h2>
          <section className="miao-tool-grid" aria-label="AI 工具">
            {availableTools.map(renderToolCard)}
          </section>
        </section>
      )}

      {comingSoonTools.length > 0 && (
        <section aria-label="即将接入工具">
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '24px 0 12px' }}>即将接入</h2>
          <section className="miao-tool-grid" aria-label="AI 工具">
            {comingSoonTools.map(renderToolCard)}
          </section>
        </section>
      )}
    </div>
  );
};

export default ToolsPage;
