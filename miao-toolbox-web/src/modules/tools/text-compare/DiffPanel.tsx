import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { Upload, message, Select, Button, Tooltip } from 'antd';
import { CloudUploadOutlined, FileTextOutlined, FormatPainterOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useDiffContext } from './useDiffContext';
import CodeEditor, { type CodeEditorHandle } from './CodeEditor';
import {
  formatWithPrettier,
  FORMAT_LANGUAGES,
  type FormatLang,
} from './formatPrettier';
import { detectLanguage } from './formatDetect';

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

const LANGUAGE_LABEL: Record<FormatLang, string> = Object.fromEntries(
  LANGUAGE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<FormatLang, string>;

export interface DiffPanelHandle {
  setFindQuery: (query: string, caseSensitive: boolean) => void;
  getMatchCount: () => number;
  focusMatch: (index: number) => void;
  clearSelection: () => void;
  blur: () => void;
}

const DiffPanel = forwardRef<DiffPanelHandle, { side: 'left' | 'right'; onFocus?: () => void }>(({ side, onFocus }, ref) => {
  const { state, setLeft, setRight, dispatch } = useDiffContext();
  const text = side === 'left' ? state.leftText : state.rightText;
  const label = side === 'left' ? state.leftLabel : state.rightLabel;
  const setText = side === 'left' ? setLeft : setRight;
  const fileAction = side === 'left' ? 'SET_LEFT_FILE' as const : 'SET_RIGHT_FILE' as const;
  const editorRef = useRef<CodeEditorHandle>(null);

  useImperativeHandle(ref, () => ({
    setFindQuery(query, caseSensitive) {
      editorRef.current?.setFindQuery(query, caseSensitive);
    },
    getMatchCount() {
      return editorRef.current?.getMatchCount() ?? 0;
    },
    focusMatch(index) {
      editorRef.current?.focusMatch(index);
    },
    clearSelection() {
      editorRef.current?.clearSelection();
    },
    blur() {
      editorRef.current?.blur();
    },
  }), []);

  const [selectedLanguage, setSelectedLanguage] = useState<FormatLang | null>(null);
  const [hasManualSelected, setHasManualSelected] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [detecting, setDetecting] = useState(false);

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
        if (detected) {
          setSelectedLanguage(detected);
          setHasManualSelected(true);
        }
        dispatch({ type: 'SET_LANGUAGE', payload: detected ?? null });
      };
      reader.readAsText(file);
      return false;
    },
  };

  const handleManualSelect = (value: FormatLang | null | undefined) => {
    setSelectedLanguage(value ?? null);
    setHasManualSelected(value != null);
  };

  const handleAutoDetect = async () => {
    if (!text.trim()) {
      message.warning('请先粘贴或输入文本');
      return;
    }
    setDetecting(true);
    try {
      const result = await detectLanguage(text);
      if (result) {
        setSelectedLanguage(result.language);
        setHasManualSelected(true);
        message.success(`已识别为 ${LANGUAGE_LABEL[result.language]}`);
      } else {
        message.warning('未能识别，请手动选择语言');
      }
    } catch {
      message.warning('识别失败，请手动选择语言');
    } finally {
      setDetecting(false);
    }
  };

  const handleFormat = async () => {
    let lang = selectedLanguage;
    if (!lang) {
      if (!text.trim()) {
        message.warning('请先粘贴或输入文本');
        return;
      }
      try {
        const result = await detectLanguage(text);
        if (!result) {
          message.warning('未能识别语言，请手动选择');
          return;
        }
        lang = result.language;
        setSelectedLanguage(lang);
        setHasManualSelected(true);
      } catch {
        message.warning('识别失败，请手动选择语言');
        return;
      }
    }
    if (text.length > MAX_FORMAT_BYTES) {
      message.warning('文本超过 1MB，无法格式化');
      return;
    }
    if (!FORMAT_LANGUAGES.has(lang)) {
      message.error('不支持的格式化语言: ' + lang);
      return;
    }
    setFormatting(true);
    try {
      const formatted = await formatWithPrettier(text, lang);
      if (formatted === text) {
        message.info('无需格式化，文本已是规范格式');
      } else {
        setText(formatted);
        message.success(`已格式化为 ${LANGUAGE_LABEL[lang]}`);
      }
    } catch {
      message.warning('当前文本无法被该格式化器解析，已保持原样');
    } finally {
      setFormatting(false);
    }
  };

  const detectDisabled = !text || hasManualSelected;
  const detectTooltip = hasManualSelected
    ? '已手动选择语言，自动识别已停用'
    : !text
      ? '请先粘贴文本'
      : '根据文本内容自动识别语言';

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
          <Tooltip title={detectTooltip}>
            <Button
              className="tc-btn"
              icon={<ThunderboltOutlined />}
              loading={detecting}
              onClick={handleAutoDetect}
              disabled={detectDisabled}
              size="small"
            />
          </Tooltip>
          <Select
            className="tc-select-compact"
            value={selectedLanguage ?? undefined}
            onChange={handleManualSelect}
            options={LANGUAGE_OPTIONS}
            placeholder="选择语言"
            size="middle"
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
          ref={editorRef}
          value={text}
          onChange={setText}
          language={state.language}
          showLineNumbers={state.showLineNumbers}
          placeholder={side === 'left' ? '粘贴原文或旧版本...' : '粘贴对比文本或新版本...'}
          minRows={16}
          maxRows={52}
          fillHeight
          lineWrapping={state.wordWrap}
          onFormatShortcut={handleFormat}
          onFocus={onFocus}
        />
      </div>
    </div>
  );
});

DiffPanel.displayName = 'DiffPanel';
export default DiffPanel;
