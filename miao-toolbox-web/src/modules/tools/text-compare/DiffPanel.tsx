import React from 'react';
import { Button, Card, Space, Upload, message } from 'antd';
import { UploadOutlined, FileTextOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useDiffContext } from './useDiffContext';
import CodeEditor from './CodeEditor';

interface DiffPanelProps {
  side: 'left' | 'right';
}

/**
 * 左右分栏编辑器面板 — CodeMirror 6 编辑器 + 文件上传
 */
const DiffPanel: React.FC<DiffPanelProps> = ({ side }) => {
  const { state, setLeft, setRight, dispatch } = useDiffContext();

  const text = side === 'left' ? state.leftText : state.rightText;
  const label = side === 'left' ? state.leftLabel : state.rightLabel;
  const setText = side === 'left' ? setLeft : setRight;
  const fileAction = side === 'left' ? 'SET_LEFT_FILE' as const : 'SET_RIGHT_FILE' as const;

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
          js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
          css: 'css', html: 'html', xml: 'xml', md: 'markdown', sql: 'sql', sh: 'bash',
        };
        dispatch({ type: 'SET_LANGUAGE', payload: languageMap[ext] ?? null });
      };
      reader.readAsText(file);
      return false;
    },
  };

  const placeholderLabel = side === 'left'
    ? '在此粘贴或输入原文...'
    : '在此粘贴或输入对比文本...';

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
      <CodeEditor
        value={text}
        onChange={setText}
        language={state.language}
        showLineNumbers={state.showLineNumbers}
        placeholder={placeholderLabel}
        minRows={12}
        maxRows={30}
      />
    </Card>
  );
};

export default DiffPanel;
