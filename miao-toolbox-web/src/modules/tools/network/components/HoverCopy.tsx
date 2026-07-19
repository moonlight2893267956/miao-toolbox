/**
 * 悬停显示的复制按钮（与 Cookie / MIME 等交互一致）
 */
import React, { useState } from 'react';
import { message } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import './HoverCopy.css';

export interface HoverCopyProps {
  value: string;
  /** 成功提示用，如「Value」「Subject」 */
  label?: string;
  className?: string;
  children?: React.ReactNode;
  /** 始终显示图标（默认悬停才显示） */
  alwaysShow?: boolean;
  /** 仅图标，不渲染 value 文本（旁路已有输入框时用） */
  iconOnly?: boolean;
}

const HoverCopy: React.FC<HoverCopyProps> = ({
  value,
  label,
  className,
  children,
  alwaysShow = false,
  iconOnly = false,
}) => {
  const [done, setDone] = useState(false);
  const empty = !value;

  const onCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (empty) return;
    void navigator.clipboard?.writeText(value).then(
      () => {
        message.success(label ? `已复制 ${label}` : '已复制');
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      },
      () => message.error('复制失败'),
    );
  };

  return (
    <div
      className={`ntl-hover-copy${alwaysShow ? ' ntl-hover-copy--always' : ''}${iconOnly ? ' ntl-hover-copy--icon' : ''}${className ? ` ${className}` : ''}`}
    >
      {!iconOnly && (
        <span className="ntl-hover-copy-text">
          {children ?? (empty ? '—' : value)}
        </span>
      )}
      <button
        type="button"
        className={`ntl-hover-copy-btn${done ? ' ntl-hover-copy-btn--done' : ''}${empty ? ' is-disabled' : ''}`}
        title={empty ? '无内容' : label ? `复制 ${label}` : '复制'}
        aria-label={empty ? '无内容' : label ? `复制 ${label}` : '复制'}
        disabled={empty}
        onClick={onCopy}
      >
        {done ? <CheckOutlined /> : <CopyOutlined />}
      </button>
    </div>
  );
};

export default HoverCopy;
