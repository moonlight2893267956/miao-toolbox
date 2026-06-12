import React, { useCallback } from 'react';
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { Empty, Tooltip } from 'antd';
import { useDiffContext } from './useDiffContext';
import type { DiffHunk as DiffHunkType } from './types';

interface DiffViewerProps {
  hunkRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ hunkRefs }) => {
  const { state, dispatch } = useDiffContext();

  const hunks = state.diffResult?.hunks ?? [];
  const diffHunks = hunks.filter(h => h.type !== 'unchanged');
  const hasText = Boolean(state.leftText || state.rightText);

  const lineNumWidth = Math.max(
    String(state.leftText.split('\n').length).length,
    String(state.rightText.split('\n').length).length,
    2,
  );

  const applyHunk = useCallback(
    (hunk: DiffHunkType, direction: 'to-left' | 'to-right') => {
      if (!state.diffResult) return;
      if (direction === 'to-left' && hunk.type !== 'removed') {
        const lines = state.leftText.split('\n');
        for (let i = 0; i < hunk.changes.length; i++) {
          const c = hunk.changes[i];
          const idx = hunk.oldStart - 1 + i;
          if (idx < lines.length && c.type !== 'equal' && c.value) lines[idx] = c.value;
        }
        dispatch({ type: 'SET_LEFT', payload: lines.join('\n') });
      } else if (direction === 'to-right' && hunk.type !== 'added') {
        const lines = state.rightText.split('\n');
        for (let i = 0; i < hunk.changes.length; i++) {
          const c = hunk.changes[i];
          const idx = hunk.newStart - 1 + i;
          if (idx < lines.length && c.type !== 'equal' && c.oldValue !== undefined && c.oldValue !== null) {
            lines[idx] = c.oldValue;
          }
        }
        dispatch({ type: 'SET_RIGHT', payload: lines.join('\n') });
      }
    },
    [state.diffResult, state.leftText, state.rightText, dispatch],
  );

  if (!state.diffResult || diffHunks.length === 0) {
    return (
      <div className="dt-diff-viewer dt-diff-viewer-empty">
        <div className="dt-diff-title">
          <span>{hasText ? '差异结果 · 共 0 处' : '差异结果'}</span>
          <span>{hasText ? '0 处' : '等待输入'}</span>
        </div>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={hasText ? '两侧内容暂无可展示差异' : '在左右编辑区粘贴文本后自动开始对比'}
        />
      </div>
    );
  }

  const typeLabel: Record<string, string> = { added: '新增', removed: '删除', modified: '修改' };

  return (
    <div className="dt-diff-viewer">
      <div className="dt-diff-title">
        <span>差异结果 · 共 {diffHunks.length} 处</span>
      </div>

      {diffHunks.map((hunk, idx) => (
        <div key={idx} className="dt-diff-block" ref={(el) => { hunkRefs.current[idx] = el; }}>
          <div className="dt-diff-block-header">
            <span className="dt-diff-range">
              {hunk.type === 'added' ? '—' : `第${hunk.oldStart}行`}
              ↔
              {hunk.type === 'removed' ? '—' : `第${hunk.newStart}行`}
            </span>
            <span className="dt-diff-actions">
              <span className={'dt-diff-type-badge ' + hunk.type}>{typeLabel[hunk.type] ?? hunk.type}</span>
              <span className="dt-apply-group">
                {hunk.type !== 'added' && (
                  <Tooltip title="应用到右侧">
                    <button className="dt-apply-btn" onClick={() => applyHunk(hunk, 'to-right')}>
                      <ArrowRightOutlined />
                    </button>
                  </Tooltip>
                )}
                {hunk.type !== 'removed' && (
                  <Tooltip title="应用到左侧">
                    <button className="dt-apply-btn" onClick={() => applyHunk(hunk, 'to-left')}>
                      <ArrowLeftOutlined />
                    </button>
                  </Tooltip>
                )}
              </span>
            </span>
          </div>

          {hunk.changes.map((change, ci) => {
            const cls = change.type === 'removed' ? 'removed' : change.type === 'added' ? 'added' : change.type === 'modified' ? 'modified' : 'equal';
            return (
              <div key={ci} className={'dt-diff-line ' + cls}>
                <span className="ln" style={{ width: lineNumWidth + 'ch' }}>
                  {cls !== 'added' ? hunk.oldStart + ci : ''}
                </span>
                <span className="ln" style={{ width: lineNumWidth + 'ch' }}>
                  {cls !== 'removed' ? hunk.newStart + ci : ''}
                </span>
                <span className="mk">
                  {cls === 'added' ? '+' : cls === 'removed' ? '-' : cls === 'modified' ? '~' : ''}
                </span>
                <span className="ct">{change.value}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default DiffViewer;
