import React, { useMemo, useState } from 'react';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { useRegexContext } from '../useRegexContext';
import { generateCode, LANGUAGE_TABS } from '../data/codeTemplates';

/**
 * 代码生成 Modal（FR-11 增强版，2026-07-16）：
 * - 点击按钮弹出 Modal
 * - Tab 式语言切换（JS/Java/Python/Go/PHP/C#）
 * - 完整可运行代码片段（含 import、正则声明、匹配循环、输出）
 * - 自动转义 + 标志位映射
 * - 一键复制到剪贴板
 */
const CodeGenerator: React.FC = () => {
  const { state, setCodeGenLanguage, toggleCodeGen } = useRegexContext();
  const { codeGenLanguage, pattern, flags, showCodeGen } = state;
  const [copied, setCopied] = useState(false);

  const result = useMemo(
    () => generateCode(codeGenLanguage, pattern, flags),
    [codeGenLanguage, pattern, flags],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = result.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <Modal
      title={null}
      open={showCodeGen && !!pattern}
      onCancel={toggleCodeGen}
      footer={null}
      width={680}
      destroyOnHidden
      className="rt-code-gen-modal"
      closable
    >
      <div className="rt-code-gen">
        <div className="rt-code-gen-head">
          <span className="rt-code-gen-title">
            代码生成
          </span>
          <button
            type="button"
            className="rt-code-gen-copy"
            onClick={handleCopy}
            title="复制代码"
          >
            {copied ? <CheckOutlined /> : <CopyOutlined />}
            {copied ? '已复制' : '复制'}
          </button>
        </div>
        <div className="rt-code-gen-tabs">
          {LANGUAGE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`rt-code-gen-tab ${codeGenLanguage === tab.key ? 'rt-code-gen-tab--active' : ''}`}
              onClick={() => setCodeGenLanguage(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <pre className="rt-code-gen-code">
          <code>{result.code}</code>
        </pre>
        {result.flagNotes.length > 0 && (
          <div className="rt-code-gen-notes">
            {result.flagNotes.map((note, i) => (
              <div key={i} className="rt-code-gen-note">• {note}</div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default CodeGenerator;
