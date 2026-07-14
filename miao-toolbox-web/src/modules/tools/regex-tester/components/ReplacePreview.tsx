import React, { useMemo } from 'react';
import { SwapOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import { useRegexContext } from '../useRegexContext';

/**
 * 替换预览（FR-3）：
 * - 替换结果由 Web Worker 内 String.replace 派生（replacedText），与高亮/详情同源
 * - 支持 $1 / $2 与 ${name} 命名引用（AC1/AC2）
 * - 空替换串删除匹配、无 g 仅替换首个（AC3/AC4）由 Worker 用原始 flags 计算，前端不特殊处理
 * - 无效正则时 replacedText 为 null，展示提示而非报错（AC5）
 */
const ReplacePreview: React.FC = () => {
  const { state, setReplaceText } = useRegexContext();
  const result = state.replacedText;
  const isError = result === null;
  const noMatch = !isError && state.matchCount === 0;

  const statusText = useMemo(() => {
    if (isError) return '正则无效，无法预览替换';
    if (state.testText.length === 0) return '输入测试文本与正则后，此处显示替换结果';
    if (noMatch) return '当前无匹配，替换结果与原文本一致';
    return `共 ${state.matchCount} 处匹配 · ${state.flags.includes('g') ? '已全部替换' : '仅替换首个'}`;
  }, [isError, noMatch, state.testText, state.matchCount, state.flags]);

  return (
    <section className="rt-panel rt-replace">
      <div className="rt-panel-head">
        <span className="rt-panel-label">替换预览</span>
        <span className="rt-panel-meta">{'支持 $1 / $<name> / ${name}'}</span>
      </div>
      <div className="rt-panel-body rt-replace-body">
        <div className="rt-replace-inputrow">
          <span className="rt-replace-label">替换为</span>
          <Input
            value={state.replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="输入替换字符串，例如 $2 $1"
            spellCheck={false}
            className="rt-replace-input"
            prefix={<SwapOutlined style={{ color: 'var(--miao-text-tertiary)' }} />}
            allowClear
          />
        </div>

        <div className="rt-replace-output">
          {isError ? (
            <div className="rt-replace-hint">正则无效，请修正上方正则后再预览替换结果。</div>
          ) : (
            <pre className="rt-replace-pre">{result}</pre>
          )}
        </div>

        <div className={`rt-replace-status ${noMatch && !isError ? 'rt-replace-status--muted' : ''}`}>
          {statusText}
        </div>
      </div>
    </section>
  );
};

export default ReplacePreview;
