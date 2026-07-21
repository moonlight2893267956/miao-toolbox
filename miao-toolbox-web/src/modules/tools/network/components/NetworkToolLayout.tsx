import React, { useCallback, useState } from 'react';
import { Spin, message } from 'antd';
import { CheckOutlined, CopyOutlined, LoadingOutlined } from '@ant-design/icons';
import './NetworkToolLayout.css';

export interface NetworkToolLayoutProps {
  title: string;
  icon: React.ReactNode;
  description?: string;
  submitText?: string;
  showSubmit?: boolean;
  loading?: boolean;
  /**
   * 流式/连续场景：loading 期间若已有结果，仍渲染结果而非用「处理中…」整块覆盖。
   * 默认 false，保持一次性工具「加载时显示处理中」的原有行为。
   */
  keepResultWhileLoading?: boolean;
  onSubmit?: () => void;
  resultText?: string;
  error?: string | null;
  children: React.ReactNode;
  result?: React.ReactNode;
  extraActions?: React.ReactNode;
  headerExtra?: React.ReactNode;
  categoryLabel?: string;
  className?: string;
  showHeader?: boolean;
  inputLabel?: string;
  inputMeta?: string;
  /** 保留兼容，统一使用上下布局 */
  layout?: 'stack' | 'split';
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

/**
 * 网络工具通用布局：页头 + 输入卡片 + 操作条 + 结果卡片（上下排布）
 */
const NetworkToolLayout: React.FC<NetworkToolLayoutProps> = ({
  title,
  icon,
  description = '',
  submitText = '执行',
  showSubmit = true,
  loading = false,
  keepResultWhileLoading = false,
  onSubmit,
  resultText,
  error,
  children,
  result,
  extraActions,
  headerExtra,
  className,
  showHeader = true,
  inputLabel = '输入',
  inputMeta,
}) => {
  const [copied, setCopied] = useState(false);
  const copyable = Boolean(resultText && resultText.trim().length > 0);
  const hasResultSlot = result !== undefined && result !== null;
  const showResultBody = hasResultSlot || copyable;

  const handleCopy = useCallback(async () => {
    if (!copyable || !resultText) return;
    try {
      await writeClipboard(resultText);
      setCopied(true);
      message.success('已复制');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      message.error('复制失败');
    }
  }, [copyable, resultText]);

  const handleSubmit = useCallback(() => {
    if (loading || !onSubmit) return;
    onSubmit();
  }, [loading, onSubmit]);

  return (
    <div className={`ntl-root${className ? ` ${className}` : ''}`} data-testid="ntl-root">
      {showHeader && (
        <header className="ntl-tool-hero">
          <div className="ntl-tool-hero-icon" aria-hidden>
            {icon}
          </div>
          <div className="ntl-tool-hero-text">
            <h1 className="ntl-tool-hero-title">{title}</h1>
            {description ? <p className="ntl-tool-hero-desc">{description}</p> : null}
          </div>
          {headerExtra ? <div className="ntl-tool-hero-extra">{headerExtra}</div> : null}
        </header>
      )}

      <div className="ntl-workbench">
        <section className="ntl-card" aria-label="输入区">
          <div className="ntl-card-head">
            <span className="ntl-card-title">{inputLabel}</span>
            {inputMeta ? <span className="ntl-card-meta">{inputMeta}</span> : null}
          </div>
          <div className="ntl-card-body" data-testid="ntl-input">
            {children}
          </div>
        </section>

        {(showSubmit || extraActions) && (
          <div className="ntl-actions">
            {extraActions}
            {showSubmit && (
              <button
                type="button"
                className="ntl-submit-btn"
                data-testid="ntl-submit"
                disabled={loading}
                onClick={handleSubmit}
              >
                {loading ? <LoadingOutlined /> : null}
                {submitText}
              </button>
            )}
          </div>
        )}

        <section className="ntl-card" aria-label="结果区">
          <div className="ntl-card-head">
            <span className="ntl-card-title">结果</span>
            <button
              type="button"
              className={`ntl-copy-btn${copied ? ' ntl-copy-btn--done' : ''}`}
              data-testid="ntl-copy"
              disabled={!copyable || loading}
              onClick={handleCopy}
            >
              {copied ? <CheckOutlined /> : <CopyOutlined />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>

          {error ? (
            <div className="ntl-error" data-testid="ntl-error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="ntl-card-body ntl-result-body" data-testid="ntl-result">
            {loading && !(keepResultWhileLoading && showResultBody) ? (
              <div className="ntl-loading" data-testid="ntl-loading">
                <Spin size="small" />
                <span>处理中…</span>
              </div>
            ) : showResultBody ? (
              <>
                {loading ? (
                  <div className="ntl-loading ntl-loading--inline" data-testid="ntl-loading">
                    <Spin size="small" />
                    <span>探测中…</span>
                  </div>
                ) : null}
                {hasResultSlot ? (
                  result
                ) : (
                  <pre className="ntl-result-text">{resultText}</pre>
                )}
              </>
            ) : (
              <div className="ntl-result-empty">执行后结果将显示在这里</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default NetworkToolLayout;
