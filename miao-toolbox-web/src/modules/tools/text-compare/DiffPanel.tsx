import React from 'react';
import { Upload, message } from 'antd';
import { CloudUploadOutlined, FileTextOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useDiffContext } from './useDiffContext';
import CodeEditor from './CodeEditor';

const DiffPanel: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
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

  return (
    <div className={`tc-panel tc-panel-${side}`}>
      <div className="tc-panel-header">
        <div className="tc-panel-label">
          <span className="tc-panel-tag">{side === 'left' ? 'A' : 'B'}</span>
          <span className="tc-panel-title">{label}</span>
          {text && (
            <span className="tc-panel-meta">
              <FileTextOutlined /> {text.split('\n').length} 行
            </span>
          )}
        </div>
        <Upload {...uploadProps}>
          <button className="tc-btn">
            <CloudUploadOutlined /> 上传
          </button>
        </Upload>
      </div>
      <div className="tc-editor-area">
        <CodeEditor
          value={text}
          onChange={setText}
          language={state.language}
          showLineNumbers={state.showLineNumbers}
          placeholder={side === 'left' ? '粘贴原文或旧版本...' : '粘贴对比文本或新版本...'}
          minRows={16}
          maxRows={52}
          lineWrapping={state.layout !== 'split'}
        />
      </div>
    </div>
  );
};

export default DiffPanel;
