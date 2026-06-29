import { useMemo } from 'react';
import type { RepairAction } from '../types';

interface RepairPreviewModalProps {
  visible: boolean;
  original: string;
  repaired: string;
  fixes: RepairAction[];
  onConfirm: () => void;
  onCancel: () => void;
}

/** 简单的行级 diff：找出新增行和删除行 */
function computeLineDiff(original: string, repaired: string) {
  const oldLines = original.split('\n');
  const newLines = repaired.split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);

  const diff: { type: 'same' | 'add' | 'del'; oldLine?: string; newLine?: string }[] = [];

  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === undefined) {
      diff.push({ type: 'add', newLine: n });
    } else if (n === undefined) {
      diff.push({ type: 'del', oldLine: o });
    } else if (o === n) {
      diff.push({ type: 'same', oldLine: o, newLine: n });
    } else {
      diff.push({ type: 'del', oldLine: o });
      diff.push({ type: 'add', newLine: n });
    }
  }

  return diff;
}

export default function RepairPreviewModal({
  visible,
  original,
  repaired,
  fixes,
  onConfirm,
  onCancel,
}: RepairPreviewModalProps) {
  const diff = useMemo(() => computeLineDiff(original, repaired), [original, repaired]);

  if (!visible) return null;

  return (
    <div className="jw-repair-overlay" onClick={onCancel}>
      <div className="jw-repair-modal" onClick={(e) => e.stopPropagation()}>
        <div className="jw-repair-modal__header">
          <h3>修复预览</h3>
          <button className="jw-repair-modal__close" onClick={onCancel}>&times;</button>
        </div>

        <div className="jw-repair-modal__fixes">
          <h4>修复操作</h4>
          <ul>
            {fixes.map((fix, i) => (
              <li key={i} className="jw-repair-modal__fix-item">
                <span className={`jw-repair-modal__fix-badge jw-repair-modal__fix-badge--${fix.type}`}>
                  {fix.type === 'single-quotes' ? '引号' :
                   fix.type === 'trailing-comma' ? '逗号' :
                   fix.type === 'line-comment' ? '//注释' :
                   fix.type === 'block-comment' ? '/*注释*/' :
                   fix.type === 'unquoted-key' ? 'Key' : '大小写'}
                </span>
                <span className="jw-repair-modal__fix-desc">{fix.description}</span>
                <span className="jw-repair-modal__fix-count">&times;{fix.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="jw-repair-modal__diff">
          <h4>变更预览</h4>
          <div className="jw-repair-modal__diff-content">
            {diff.map((line, i) => (
              <div
                key={i}
                className={`jw-repair-modal__diff-line jw-repair-modal__diff-line--${line.type}`}
              >
                <span className="jw-repair-modal__diff-num">{i + 1}</span>
                <span className="jw-repair-modal__diff-prefix">
                  {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                </span>
                <span className="jw-repair-modal__diff-text">
                  {line.type === 'del' ? line.oldLine : line.newLine}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="jw-repair-modal__footer">
          <button className="jw-repair-modal__cancel" onClick={onCancel}>取消</button>
          <button className="jw-repair-modal__confirm" onClick={onConfirm}>确认修复</button>
        </div>
      </div>
    </div>
  );
}
