/**
 * NetworkToolLayout 预览页 — Story nt-1-2 验收与开发对照用。
 * 路由：/tools/network/_layout-preview（仅需登录，非正式产品入口）
 */
import React, { useCallback, useState } from 'react';
import { Input } from 'antd';
import { ApiOutlined } from '@ant-design/icons';
import NetworkToolLayout from './components/NetworkToolLayout';
import './network.css';
import './components/NetworkToolLayout.css';

const NetworkToolLayoutPreview: React.FC = () => {
  const [input, setInput] = useState('hello network');
  const [resultText, setResultText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    setError(null);
    setLoading(true);
    window.setTimeout(() => {
      const trimmed = input.trim();
      if (!trimmed) {
        setResultText('');
        setError('请输入内容');
        setLoading(false);
        return;
      }
      setResultText(`ECHO: ${trimmed}`);
      setLoading(false);
    }, 600);
  }, [input]);

  return (
    <div className="ntl-page ntl-page--tool">
      <div className="ntl-tool-chrome">
      <NetworkToolLayout
        title="布局组件预览"
        icon={<ApiOutlined />}
        description="NetworkToolLayout 通用布局验收页"
        submitText="执行"
        loading={loading}
        onSubmit={handleSubmit}
        resultText={resultText}
        error={error}
      >
        <Input.TextArea
          rows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入任意文本，点击执行"
          data-testid="ntl-preview-input"
        />
      </NetworkToolLayout>
      </div>
    </div>
  );
};

export default NetworkToolLayoutPreview;
