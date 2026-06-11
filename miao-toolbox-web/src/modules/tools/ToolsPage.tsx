import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Input, Space, Tag, Typography, message } from 'antd';
import {
  AudioOutlined,
  DiffOutlined,
  PictureOutlined,
  RightOutlined,
  SearchOutlined,
  TranslationOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const tools = [
  {
    key: 'translate',
    title: '智能翻译',
    description: '面向日常写作和资料整理的多语言翻译入口。',
    icon: <TranslationOutlined />,
    status: '可用',
    tags: ['文本', '多语言'],
    path: null,
  },
  {
    key: 'text-compare',
    title: '文本对照',
    description: '粘贴或上传两段文本，支持字符/词/行级粒度对比，自动识别语言类型。',
    icon: <DiffOutlined />,
    status: '可用',
    tags: ['对比', '代码'],
    path: '/tools/text-compare',
  },
  {
    key: 'image',
    title: '文生图',
    description: '把提示词转成图片素材，适合封面、配图和灵感探索。',
    icon: <PictureOutlined />,
    status: '即将接入',
    tags: ['图像', '创作'],
    path: null,
  },
  {
    key: 'voice',
    title: '文生语音',
    description: '生成自然语音，用于试听、脚本样稿和轻量内容制作。',
    icon: <AudioOutlined />,
    status: '即将接入',
    tags: ['语音', '内容'],
    path: null,
  },
];

const ToolsPage: React.FC = () => {
  const navigate = useNavigate();

  const handleToolClick = (path: string | null, title: string) => {
    if (path) {
      navigate(path);
    } else {
      message.info(`${title} 正在接入中`);
    }
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
            <strong>3</strong>
            <span>工具入口</span>
          </div>
          <div className="miao-stat">
            <strong>1</strong>
            <span>已可用</span>
          </div>
          <div className="miao-stat">
            <strong>JWT</strong>
            <span>认证模式</span>
          </div>
        </div>
      </section>

      <section className="miao-tool-grid" aria-label="AI 工具">
        {tools.map((tool) => (
          <button
            key={tool.key}
            type="button"
            className="miao-tool-card"
            onClick={() => handleToolClick(tool.path, tool.title)}
          >
            <span className="miao-tool-card-top">
              <span className="miao-tool-icon">{tool.icon}</span>
              <span className="miao-tool-status">{tool.status}</span>
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
        ))}
      </section>
    </div>
  );
};

export default ToolsPage;
