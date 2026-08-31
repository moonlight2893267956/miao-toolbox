import React, { useRef, useState } from 'react';

export interface AccessCodeInputProps {
  /** 提取码位数，默认 4 */
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  /** 错误态：整体红色描边并抖动 */
  error?: boolean;
}

/**
 * 分段式提取码输入框
 *
 * 每段是一个独立的 <input>，支持：
 * - 输入一个字符后自动聚焦下一段
 * - 退格回到上一段
 * - 粘贴整串提取码自动填充
 * - 回车提交
 */
const AccessCodeInput: React.FC<AccessCodeInputProps> = ({
  length = 4,
  value,
  onChange,
  onSubmit,
  disabled = false,
  error = false,
}) => {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const [shake, setShake] = useState(false);

  const chars = Array.from({ length }, (_, i) => value[i] ?? '');

  const commit = (next: string) => {
    onChange(next.slice(0, length).toUpperCase());
  };

  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 420);
  };

  const handleChange = (index: number, raw: string) => {
    // 只保留字母数字，取最后一个输入的字符（覆盖式输入）
    const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!cleaned) {
      // 清空当前位
      const arr = [...chars];
      arr[index] = '';
      commit(arr.join(''));
      return;
    }
    const arr = [...chars];
    arr[index] = cleaned[cleaned.length - 1];
    commit(arr.join(''));
    if (index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (chars[index]) {
        const arr = [...chars];
        arr[index] = '';
        commit(arr.join(''));
        return;
      }
      if (index > 0) {
        const arr = [...chars];
        arr[index - 1] = '';
        commit(arr.join(''));
        inputsRef.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
      return;
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (value.length === length) {
        onSubmit?.();
      } else {
        triggerShake();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!pasted) return;
    commit(pasted);
    const focusIndex = Math.min(pasted.length, length - 1);
    inputsRef.current[focusIndex]?.focus();
  };

  const wrapperClass = [
    'share-code-input',
    error ? 'share-code-input--error' : '',
    shake ? 'share-code-input--shake' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={wrapperClass}>
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(el) => { inputsRef.current[index] = el; }}
          className="share-code-cell"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          maxLength={1}
          value={char}
          disabled={disabled}
          aria-label={`提取码第 ${index + 1} 位`}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
};

export default AccessCodeInput;
