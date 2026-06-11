import React, { useCallback } from 'react';
import { Button, Space, Typography, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useDiffContext } from './useDiffContext';
import type { DiffHunk as DiffHunkType } from './types';

const { Text } = Typography;

interface DiffViewerProps {
  hunkRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
}

/**
 * 差异结果渲染 — 逐 hunks 展示变更，含 ← / → 应用按钮
 */
const DiffViewer: React.FC<DiffViewerProps> = ({ hunkRefs }) => {
  const { state, dispatch } = useDiffContext();

  // 差异块颜色映射（定义在组件内避免 react-refresh lint 警告）
  const hunkColors: Record<string, { leftBg: string; rightBg: string; leftText: string; rightText: string; tag: string }> = {
    added: {
      leftBg: 'transparent', rightBg: '#e6ffed',
      leftText: 'rgba(0,0,0,0.35)', rightText: '#1a7f37', tag: '新增',
    },
    removed: {
      leftBg: '#ffeef0', rightBg: 'transparent',
      leftText: '#cf222e', rightText: 'rgba(0,0,0,0.35)', tag: '删除',
    },
    modified: {
      leftBg: '#fff8c5', rightBg: '#fff8c5',
      leftText: '#7a6e00', rightText: '#7a6e00', tag: '修改',
    },
    unchanged: {
      leftBg: 'transparent', rightBg: 'transparent',
      leftText: 'inherit', rightText: 'inherit', tag: '',
    },
  };

  const hunks = state.diffResult?.hunks ?? [];
  const diffHunks = hunks.filter(h => h.type !== 'unchanged');

  const applyHunk = useCallback(
    (hunk: DiffHunkType, direction: 'to-left' | 'to-right') => {
      if (!state.diffResult) return;
      if (direction === 'to-left' && hunk.type !== 'removed') {
        const leftLines = state.leftText.split('\n');
        for (let i = 0; i < hunk.changes.length; i++) {
          const change = hunk.changes[i];
          const leftIdx = hunk.oldStart - 1 + i;
          if (leftIdx < leftLines.length && change.type !== 'equal' && change.value) {
            leftLines[leftIdx] = change.value;
          }
        }
        dispatch({ type: 'SET_LEFT', payload: leftLines.join('\n') });
      } else if (direction === 'to-right' && hunk.type !== 'added') {
        const rightLines = state.rightText.split('\n');
        for (let i = 0; i < hunk.changes.length; i++) {
          const change = hunk.changes[i];
          const rightIdx = hunk.newStart - 1 + i;
          if (rightIdx < rightLines.length && change.type !== 'equal' &&
            change.oldValue !== undefined && change.oldValue !== null) {
            rightLines[rightIdx] = change.oldValue;
          }
        }
        dispatch({ type: 'SET_RIGHT', payload: rightLines.join('\n') });
      }
    },
    [state.diffResult, state.leftText, state.rightText, dispatch],
  );

  if (!state.diffResult || diffHunks.length === 0) return null;

  const lineNumWidth = Math.max(
    String(state.leftText.split('\n').length).length,
    String(state.rightText.split('\n').length).length,
    2,
  );

  return (
    <div className="miao-diff-viewer" style={{ marginTop: 12 }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        差异结果（共 {diffHunks.length} 处）
      </Text>

      {diffHunks.map((hunk, idx) => {
        const colors = hunkColors[hunk.type] ?? hunkColors.unchanged;
        return (
          <div
            key={idx}
            ref={(el) => { hunkRefs.current[idx] = el; }}
            style={{
              marginBottom: 12,
              border: '1px solid var(--miao-border, #e6e3f0)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {/* 差异块头部：行号 + 应用按钮 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 12px',
                background: '#f6f8fa',
                borderBottom: '1px solid var(--miao-border, #e6e3f0)',
                fontSize: 12,
              }}
            >
              <Space size={12}>
                <span>第 {hunk.oldStart}-{hunk.oldStart + hunk.oldLines - 1} 行 ↔ 第 {hunk.newStart}-{hunk.newStart + hunk.newLines - 1} 行</span>
                {colors.tag && (
                  <span style={{
                    display: 'inline-block', padding: '0 6px', borderRadius: 4,
                    background: '#f0f0f0', fontSize: 11, fontWeight: 600, color: colors.leftText,
                  }}>
                    {colors.tag}
                  </span>
                )}
              </Space>
              <Space size={4}>
                {hunk.type !== 'added' && (
                  <Tooltip title="将左侧内容应用到右侧">
                    <Button type="text" size="small" icon={<ArrowRightOutlined />}
                      onClick={() => applyHunk(hunk, 'to-right')} aria-label="应用到右侧" />
                  </Tooltip>
                )}
                {hunk.type !== 'removed' && (
                  <Tooltip title="将右侧内容应用到左侧">
                    <Button type="text" size="small" icon={<ArrowLeftOutlined />}
                      onClick={() => applyHunk(hunk, 'to-left')} aria-label="应用到左侧" />
                  </Tooltip>
                )}
              </Space>
            </div>

            {/* 差异行 */}
            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12, lineHeight: 1.6 }}>
              {hunk.changes.map((change, ci) => {
                const isRemoved = change.type === 'removed';
                const isAdded = change.type === 'added';
                const isModified = change.type === 'modified';
                const isChanged = isAdded || isModified;
                return (
                  <div key={ci} style={{
                    display: 'flex',
                    background: isRemoved ? colors.leftBg : isChanged ? colors.rightBg : 'transparent',
                    color: isRemoved ? colors.leftText : isChanged ? colors.rightText : 'inherit',
                    padding: '0 12px',
                  }}>
                    <span style={{
                      width: lineNumWidth + 'ch', textAlign: 'right', paddingRight: 8,
                      color: 'rgba(0,0,0,0.35)', userSelect: 'none', minWidth: 24,
                    }}>
                      {!isAdded ? hunk.oldStart + ci : ''}
                    </span>
                    <span style={{
                      width: lineNumWidth + 'ch', textAlign: 'right', paddingRight: 8,
                      color: 'rgba(0,0,0,0.35)', userSelect: 'none', minWidth: 24,
                    }}>
                      {!isRemoved ? hunk.newStart + ci : ''}
                    </span>
                    <span style={{ width: 16, userSelect: 'none', flexShrink: 0 }}>
                      {isRemoved ? '-' : isAdded ? '+' : isModified ? '~' : ' '}
                    </span>
                    <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {change.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DiffViewer;
