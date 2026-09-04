import React, { useEffect, useRef, useState } from 'react';

/**
 * macOS Finder 风格的行内重命名输入框。
 *
 * - 挂载后自动聚焦并选中文件名主体（不含扩展名）
 * - Enter 确认、Esc 取消、blur 确认
 * - 确认时若值未变化或为空则静默取消
 * - 阻止 click / doubleClick 冒泡，避免触发卡片选择或预览
 */
interface InlineRenameInputProps {
  /** 当前文件/目录名 */
  value: string;
  /** 是否为目录（目录不剥离扩展名） */
  isDirectory?: boolean;
  /** 确认重命名：传入新名称，由父组件调 API */
  onConfirm: (newName: string) => void;
  /** 取消重命名 */
  onCancel: () => void;
  /** 自定义 class */
  className?: string;
}

export const InlineRenameInput: React.FC<InlineRenameInputProps> = ({
  value,
  isDirectory = false,
  onConfirm,
  onCancel,
  className = '',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  const doneRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();

    // macOS 行为：选中文件名主体（不含扩展名）
    if (!isDirectory) {
      const dotIdx = value.lastIndexOf('.');
      if (dotIdx > 0) {
        input.setSelectionRange(0, dotIdx);
      } else {
        input.select();
      }
    } else {
      input.select();
    }
  }, [value, isDirectory]);

  const finish = (newName: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const trimmed = newName.trim();
    if (trimmed && trimmed !== value) {
      onConfirm(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={text}
      className={`fs-inline-rename ${className}`}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(text);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          doneRef.current = true;
          onCancel();
        }
      }}
      onBlur={() => finish(text)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
};
