// Cron 字段气泡（摘要展示）
// 极简胶囊：字段名 + 摘要值（避免长列表撑爆 UI）。
import React from 'react';
import type { FieldDef } from '../types';

interface FieldBubbleProps {
  def: FieldDef;
  /** 由 summarizeField 派生的简短摘要 */
  summary: string;
  /** 完整原始 raw（用于 tooltip） */
  full: string;
  hasError: boolean;
  active: boolean;
  onToggle: () => void;
}

const FieldBubble: React.FC<FieldBubbleProps> = ({
  def,
  summary,
  full,
  hasError,
  active,
  onToggle,
}) => {
  return (
    <button
      type="button"
      className={`ce-field-bubble ${active ? 'is-active' : ''} ${hasError ? 'is-invalid' : ''}`}
      onClick={onToggle}
      aria-pressed={active}
      title={full}
    >
      <span className="ce-bubble-label">{def.label}</span>
      <span className="ce-bubble-value">{summary}</span>
    </button>
  );
};

export default FieldBubble;
