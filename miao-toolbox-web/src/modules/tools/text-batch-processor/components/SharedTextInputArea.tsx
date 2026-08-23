import React, { useCallback, useRef, useEffect, useState } from 'react';
import { Input, Alert } from 'antd';
import { UndoOutlined } from '@ant-design/icons';
import type { TbpAction } from '../types';

const MAX_INPUT_SIZE = 1_048_576;

interface SharedTextInputAreaProps {
  inputText: string;
  canUndoBackfill: boolean;
  dispatch: React.Dispatch<TbpAction>;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

const SharedTextInputArea: React.FC<SharedTextInputAreaProps> = ({ inputText, canUndoBackfill, dispatch }) => {
  const [stats, setStats] = useState({ chars: 0, lines: 0 });
  const rafRef = useRef<number | null>(null);

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

  const handleUndoBackfill = useCallback(() => {
    dispatch({ type: 'TBP_UNDO_BACKFILL' });
  }, [dispatch]);

  const isOverLimit = inputText.length > MAX_INPUT_SIZE;

  return (
    <div className="tbp-input-panel">
      <div className="tbp-panel-head">
        <span className="tbp-input-dot" />
        <span className="tbp-panel-label">输入文本</span>
        <span className="tbp-input-stats">
          {formatNumber(stats.chars)} 字符 · {formatNumber(stats.lines)} 行
        </span>
        {canUndoBackfill && (
          <button
            className="tbp-undo-btn"
            onClick={handleUndoBackfill}
            title="恢复回填前的原始文本"
          >
            <UndoOutlined />
            撤销回填
          </button>
        )}
      </div>
      <Input.TextArea
        className="tbp-textarea"
        value={inputText}
        onChange={handleChange}
        spellCheck={false}
        placeholder="粘贴或输入待处理文本…"
      />
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
