import React from 'react';
import { Button, Card, Input, Space, Upload, message } from 'antd';
import { UploadOutlined, FileTextOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useDiffContext } from './useDiffContext';

interface DiffPanelProps {
  side: 'left' | 'right';
}

/**
 * 左右分栏编辑器面板 — 只做文本输入和文件上传，对比逻辑由父组件统一处理
 */
const DiffPanel: React.FC<DiffPanelProps> = ({ side }) => {
  const { state, setLeft, setRight, dispatch } = useDiffContext();

  const text = side === 'left' ? state.leftText : state.rightText;
  const label = side === 'left' ? state.leftLabel : state.rightLabel;
  const setText = side === 'left' ? setLeft : setRight;
  const fileAction = side === 'left' ? 'SET_LEFT_FILE' as const : 'SET_RIGHT_FILE' as const;

  const handleTextChange = (val: string) => {
    setText(val);
  };

  const uploadProps: UploadProps = {
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.size > 100 * 1024 * 1024) {
        message.error('文件大小超过 100MB 限制');
        return Upload.LIST_IGNORE;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        dispatch({ type: fileAction, payload: { name: file.name, content } });
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const languageMap: Record<string, string> = {
          json: 'json', yaml: 'yaml', yml: 'yaml', java: 'java', py: 'python',
          js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
          css: 'css', html: 'html', xml: 'xml', md: 'markdown', sql: 'sql', sh: 'bash',
        };
        dispatch({ type: 'SET_LANGUAGE', payload: languageMap[ext] ?? null });
      };
      reader.readAsText(file);
      return false;
    },
  };

  return (
    <Card
      className="miao-diff-panel"
      title={
        <Space>
          <FileTextOutlined />
          <span>{label}</span>
        </Space>
      }
      extra={
        <Upload {...uploadProps}>
          <Button icon={<UploadOutlined />} size="small">上传文件</Button>
        </Upload>
      }
      styles={{ body: { padding: 0 } }}
    >
      <Input.TextArea
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder={side === 'left' ? '在此粘贴或输入原文...' : '在此粘贴或输入对比文本...'}
        autoSize={{ minRows: 18, maxRows: 30 }}
        bordered={false}
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 13,
          lineHeight: 1.6,
          padding: '12px 16px',
        }}
      />
    </Card>
  );
};

export default DiffPanel;
