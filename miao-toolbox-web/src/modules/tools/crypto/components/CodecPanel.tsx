/**
 * CodecPanel — 通用分栏布局组件
 *
 * 左侧：输入面板（编辑器风格）
 * 中间：操作按钮条
 * 右侧：输出面板（终端风格）
 */

import React from 'react';
import { SwapOutlined } from '@ant-design/icons';

export interface CodecPanelProps {
  /** 输入值 */
  input: string;
  /** 输入变更回调 */
  onInputChange: (value: string) => void;
  /** 输出值 */
  output: string;
  /** 输入区 placeholder */
  inputPlaceholder?: string;
  /** 输出区空状态提示 */
  outputPlaceholder?: string;
  /** 输入区标签 */
  inputLabel?: string;
  /** 输出区标签 */
  outputLabel?: string;
  /** 输入字符统计 */
  inputMeta?: string;
  /** 输出字符统计 */
  outputMeta?: string;
  /** 模式切换按钮（如 编码/解码） */
  modeButtons?: Array<{
    key: string;
    label: string;
    active: boolean;
    onClick: () => void;
  }>;
  /** 交换按钮回调 */
  onSwap?: () => void;
  /** 复制按钮 */
  copyable?: boolean;
  /** 底部工具栏（已弃用，请使用 outputHeader 替代） */
  toolbar?: React.ReactNode;
  /** 输出面板顶部工具栏（如 MD5 格式、HMAC 密钥） */
  outputHeader?: React.ReactNode;
  /** 输出区额外内容 */
  outputExtra?: React.ReactNode;
  /** 自定义输入区（替代 textarea） */
  customInput?: React.ReactNode;
  /** 自定义输出区（替代文本输出） */
  customOutput?: React.ReactNode;
  /** 输入面板底部内容（如模式徽章） */
  inputFooter?: React.ReactNode;
}

const CodecPanel: React.FC<CodecPanelProps> = ({
  input,
  onInputChange,
  output,
  inputPlaceholder = '在此输入文本...',
  outputPlaceholder = '输出将显示在这里...',
  inputLabel = '输入',
  outputLabel = '输出',
  inputMeta,
  outputMeta,
  modeButtons,
  onSwap,
  copyable = true,
  toolbar,
  outputHeader,
  outputExtra,
  customInput,
  customOutput,
  inputFooter,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="crypto-codec">
      {/* 输入面板 */}
      <div className="crypto-codec-input">
        <div className="crypto-panel-header">
          <span className="crypto-panel-label">{inputLabel}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {modeButtons && modeButtons.length > 0 && (
              <div className="crypto-mode-inline">
                {modeButtons.map((btn) => (
                  <button
                    key={btn.key}
                    className={`crypto-mode-inline-btn ${btn.active ? 'active' : ''}`}
                    onClick={btn.onClick}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}
            {inputMeta && <span className="crypto-panel-meta">{inputMeta}</span>}
          </div>
        </div>
        {customInput || (
          <textarea
            placeholder={inputPlaceholder}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        )}
        {inputFooter && <div className="crypto-codec-input-footer">{inputFooter}</div>}
      </div>

      {/* 中间仅保留交换按钮 */}
      {onSwap && (
        <div className="crypto-action-swap-only">
          <button
            className="crypto-swap-btn"
            onClick={onSwap}
            title="交换输入输出"
            disabled={!output}
          >
            <SwapOutlined />
            <span>转换</span>
          </button>
        </div>
      )}

      {/* 输出面板 */}
      <div className="crypto-codec-output">
        <div className="crypto-panel-header">
          <span className="crypto-panel-label">{outputLabel}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {outputMeta && <span className="crypto-panel-meta">{outputMeta}</span>}
            {copyable && output && (
              <button className={`crypto-copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
                {copied ? '✓ 已复制' : '复制'}
              </button>
            )}
          </div>
        </div>
        {outputHeader && <div className="crypto-output-header">{outputHeader}</div>}
        {customOutput || (
          <div className="crypto-output-content">
            {output ? output : <span className="crypto-output-empty">{outputPlaceholder}</span>}
          </div>
        )}
        {outputExtra}
        {toolbar && <div className="crypto-toolbar">{toolbar}</div>}
      </div>
    </div>
  );
};

export default CodecPanel;
