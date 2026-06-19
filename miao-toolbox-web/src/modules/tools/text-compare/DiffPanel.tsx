import React, { useState } from 'react';
import { Upload, message, Select, Button } from 'antd';
import { CloudUploadOutlined, FileTextOutlined, FormatPainterOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useDiffContext } from './useDiffContext';
import CodeEditor from './CodeEditor';
import { useDiffApi } from './useDiffApi';
import {
  formatWithPrettier,
  PRETTIER_LANGUAGES,
  BACKEND_FORMAT_LANGUAGES,
  type PrettierLang,
} from './formatPrettier';

const MAX_FORMAT_BYTES = 1_048_576; // 1MB

const LANGUAGE_OPTIONS = [
  { value: 'java', label: 'Java' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL' },
  { value: 'xml', label: 'XML' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'markdown', label: 'Markdown' },
];

const DiffPanel: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const { state, setLeft, setRight, dispatch } = useDiffContext();
  const { format } = useDiffApi();
  const text = side === 'left' ? state.leftText : state.rightText;
  const label = side === 'left' ? state.leftLabel : state.rightLabel;
  const setText = side === 'left' ? setLeft : setRight;
  const fileAction = side === 'left' ? 'SET_LEFT_FILE' as const : 'SET_RIGHT_FILE' as const;

  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [formatting, setFormatting] = useState(false);

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
          js: 'javascript', jsx: 'javascript', jsx2: 'javascript', ts: 'typescript', tsx: 'typescript',
          css: 'css', html: 'html', xml: 'xml', md: 'markdown', sql: 'sql', sh: 'bash',
        };
        dispatch({ type: 'SET_LANGUAGE', payload: languageMap[ext] ?? null });
      };
      reader.readAsText(file);
      return false;
    },
  };

  const handleFormat = async () => {
    if (!selectedLanguage) {
      message.warning('请先选择语言');
      return;
    }
    if (text.length > MAX_FORMAT_BYTES) {
      message.warning('文本超过 1MB，无法格式化');
      return;
    }
    setFormatting(true);
    try {
      let formatted: string;
      if (PRETTIER_LANGUAGES.has(selectedLanguage as PrettierLang)) {
        formatted = await formatWithPrettier(text, selectedLanguage as PrettierLang);
      } else if (BACKEND_FORMAT_LANGUAGES.has(selectedLanguage)) {
        const res = await format(text, selectedLanguage);
        formatted = res.formatted;
      } else {
        message.error('不支持的格式化语言: ' + selectedLanguage);
        return;
      }
      setText(formatted);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      message.error('格式化失败：' + (err.response?.data?.message || err.message || '未知错误'));
    } finally {
      setFormatting(false);
    }
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
        <div className="tc-panel-actions">
          <Select
            className="tc-select-compact"
            value={selectedLanguage ?? undefined}
            onChange={setSelectedLanguage}
            options={LANGUAGE_OPTIONS}
            placeholder="选择语言"
            size="small"
            allowClear
            style={{ width: 130 }}
          />
          <Button
            className="tc-btn"
            icon={<FormatPainterOutlined />}
            loading={formatting}
            onClick={handleFormat}
            size="small"
          >
            格式化
          </Button>
          <Upload {...uploadProps}>
            <Button className="tc-btn" icon={<CloudUploadOutlined />} size="small">
              上传
            </Button>
          </Upload>
        </div>
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
          onFormatShortcut={handleFormat}
        />
      </div>
    </div>
  );
};

export default DiffPanel;
