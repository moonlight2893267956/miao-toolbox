/**
 * AI 修复弹窗
 *
 * Story 3.2: 展示原始 JSON vs AI 修复后 JSON 的行级 diff，
 * 用户可预览变更后确认应用或撤销。
 */
import { useMemo } from 'react';
import { Spin } from 'antd';

interface AiRepairModalProps {
  visible: boolean;
  original: string;
  repaired: string | null;
  loading: boolean;
  error: string | null;
  onApply: () => void;
  onCancel: () => void;
}

export default function AiRepairModal({
  visible,
  original,
  repaired,
  loading,
  error,
  onApply,
  onCancel,
}: AiRepairModalProps) {
  if (!visible) return null;

  // 计算行级 diff（LCS-based，避免简单逐行对比的扭曲问题）
  const diffLines = useMemo(() => {
    if (!repaired) return [];
    const origLines = original.split('\n');
    const repLines = repaired.split('\n');
    const result: Array<{ type: 'same' | 'del' | 'add'; num: number; text: string }> = [];

    // LCS 动态规划表
    const m = origLines.length, n = repLines.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = origLines[i - 1] === repLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    // 回溯生成 diff
    const ops: Array<{ type: 'same' | 'del' | 'add'; oi: number; ri: number }> = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && origLines[i - 1] === repLines[j - 1]) {
        ops.push({ type: 'same', oi: i - 1, ri: j - 1 });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.push({ type: 'add', oi: -1, ri: j - 1 });
        j--;
      } else {
        ops.push({ type: 'del', oi: i - 1, ri: -1 });
        i--;
      }
    }
    ops.reverse();

    for (const op of ops) {
      if (op.type === 'same') {
        result.push({ type: 'same', num: op.oi + 1, text: origLines[op.oi] });
      } else if (op.type === 'del') {
        result.push({ type: 'del', num: op.oi + 1, text: origLines[op.oi] });
      } else {
        result.push({ type: 'add', num: op.ri + 1, text: repLines[op.ri] });
      }
    }

    return result.slice(0, 200);
  }, [original, repaired]);

  return (
    <div className="jw-ai-repair-overlay" onClick={onCancel}>
      <div className="jw-ai-repair-modal" onClick={(e) => e.stopPropagation()}>
        <div className="jw-ai-repair-modal__header">
          <h3>AI 修复预览</h3>
          <button className="jw-ai-repair-modal__close" onClick={onCancel}>×</button>
        </div>

        {loading && (
          <div className="jw-ai-repair-modal__loading">
            <Spin /> <span>AI 正在分析修复方案…</span>
          </div>
        )}

        {error && (
          <div className="jw-ai-repair-modal__error">
            <span className="jw-ai-repair-modal__error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {repaired && !loading && !error && (
          <>
            <div className="jw-ai-repair-modal__diff">
              <div className="jw-ai-repair-modal__diff-header">
                <span className="jw-ai-repair-modal__diff-col jw-ai-repair-modal__diff-col--old">原始</span>
                <span className="jw-ai-repair-modal__diff-col jw-ai-repair-modal__diff-col--new">AI 修复</span>
              </div>
              <div className="jw-ai-repair-modal__diff-content">
                {diffLines.map((line, i) => (
                  <div
                    key={i}
                    className={`jw-ai-repair-modal__diff-line ${
                      line.type === 'del' ? 'jw-ai-repair-modal__diff-line--del' :
                      line.type === 'add' ? 'jw-ai-repair-modal__diff-line--add' : ''
                    }`}
                  >
                    <span className="jw-ai-repair-modal__diff-prefix">
                      {line.type === 'del' ? '-' : line.type === 'add' ? '+' : ' '}
                    </span>
                    <code className="jw-ai-repair-modal__diff-text">{line.text}</code>
                  </div>
                ))}
              </div>
            </div>
            <div className="jw-ai-repair-modal__footer">
              <span className="jw-ai-repair-modal__badge">[AI 修复]</span>
              <div className="jw-ai-repair-modal__actions">
                <button className="jw-ai-repair-modal__btn-cancel" onClick={onCancel}>取消</button>
                <button className="jw-ai-repair-modal__btn-apply" onClick={onApply}>应用修复</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
