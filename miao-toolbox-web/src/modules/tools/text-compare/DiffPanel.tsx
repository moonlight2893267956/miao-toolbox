import React, { useState } from 'react';
import { Upload, message, Select, Button } from 'antd';
import { CloudUploadOutlined, FileTextOutlined, FormatPainterOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useDiffContext } from './useDiffContext';
import CodeEditor from './CodeEditor';
import {
  formatWithPrettier,
  FORMAT_LANGUAGES,
  type FormatLang,
} from './formatPrettier';

const MAX_FORMAT_BYTES = 1_048_576; // 1MB

const LANGUAGE_OPTIONS: Array<{ value: FormatLang; label: string }> = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'json', label: 'JSON' },
  { value: 'css', label: 'CSS' },
  { value: 'html', label: 'HTML' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'sql', label: 'SQL' },
  { value: 'xml', label: 'XML' },
];

const DiffPanel: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const { state, setLeft, setRight, dispatch } = useDiffContext();
  const text = side === 'left' ? state.leftText : state.rightText;
  const label = side === 'left' ? state.leftLabel : state.rightLabel;
  const setText = side === 'left' ? setLeft : setRight;
  const fileAction = side === 'left' ? 'SET_LEFT_FILE' as const : 'SET_RIGHT_FILE' as const;

  const [selectedLanguage, setSelectedLanguage] = useState<FormatLang | null>(null);
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
        const languageMap: Record<string, FormatLang> = {
          json: 'json', yaml: 'yaml', yml: 'yaml',
          js: 'javascript', jsx: 'javascript', jsx2: 'javascript', ts: 'typescript', tsx: 'typescript',
          css: 'css', html: 'html', xml: 'xml', md: 'markdown', sql: 'sql',
        };
        const detected = languageMap[ext] as FormatLang | undefined;
        dispatch({ type: 'SET_LANGUAGE', payload: detected ?? null });
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
    if (!FORMAT_LANGUAGES.has(selectedLanguage)) {
      message.error('不支持的格式化语言: ' + selectedLanguage);
      return;
    }
    setFormatting(true);
    try {
      const formatted = await formatWithPrettier(text, selectedLanguage);
      setText(formatted);
    } catch (e: unknown) {
      const err = e as { message?: string };
      message.error('格式化失败：' + (err.message || '未知错误'));
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
            onChange={(v) => setSelectedLanguage(v ?? null)}
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
