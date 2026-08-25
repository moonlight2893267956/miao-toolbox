import React, { useCallback, useRef, useEffect, useState } from 'react';
import { Input, Alert } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { TbpAction } from '../types';
import FindReplaceBar from './FindReplaceBar';

const MAX_INPUT_SIZE = 1_048_576;

export interface HighlightRange {
  start: number;
  end: number;
}

interface SharedTextInputAreaProps {
  inputText: string;
  dispatch: React.Dispatch<TbpAction>;
  highlightRange?: HighlightRange | null;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

const SharedTextInputArea: React.FC<SharedTextInputAreaProps> = ({ inputText, dispatch, highlightRange }) => {
  const [stats, setStats] = useState({ chars: 0, lines: 0 });
  const rafRef = useRef<number | null>(null);
  const textareaRef = useRef<TextAreaRef>(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setStats({
        chars: inputText.length,
        lines: inputText === '' ? 0 : inputText.split('\n').length,
      });
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [inputText]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      dispatch({ type: 'TBP_SET_INPUT', payload: e.target.value });
    },
    [dispatch],
  );

  // 定位高亮：选中匹配区间并滚动到可视区
  useEffect(() => {
    if (!highlightRange) return;
    const el = textareaRef.current?.nativeElement as HTMLTextAreaElement | undefined;
    if (!el) return;
    const { start, end } = highlightRange;
    if (start < 0 || end > inputText.length || start >= end) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(start, end);
    // 估算匹配行号，按行高滚动
    const lineNum = inputText.slice(0, start).split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.scrollTop = Math.max(0, lineNum * lineHeight - el.clientHeight / 3);
  }, [highlightRange, inputText]);

  const isOverLimit = inputText.length > MAX_INPUT_SIZE;

  return (
    <div className={`tbp-input-panel${highlightRange ? ' is-locating' : ''}`}>
      <div className="tbp-panel-head">
        <span className="tbp-input-dot" />
        <span className="tbp-panel-label">输入文本</span>
        <span className="tbp-input-stats">
          {formatNumber(stats.chars)} 字符 · {formatNumber(stats.lines)} 行
        </span>
      </div>
      <div className="tbp-textarea-wrap">
        <FindReplaceBar
          textareaRef={textareaRef}
          value={inputText}
          onChange={(text) => dispatch({ type: 'TBP_SET_INPUT', payload: text })}
        />
        <Input.TextArea
          ref={textareaRef}
          className="tbp-textarea"
          value={inputText}
          onChange={handleChange}
          spellCheck={false}
          placeholder="粘贴或输入待处理文本…"
        />
      </div>
      {isOverLimit && (
        <Alert
          type="warning"
          message="文本过大（> 1MB），建议拆分；大文件支持开发中"
          showIcon
          className="tbp-input-alert"
        />
      )}
    </div>
  );
};

export default SharedTextInputArea;
