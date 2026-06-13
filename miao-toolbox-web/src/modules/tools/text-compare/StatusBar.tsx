import React from 'react';
import { Spin } from 'antd';
import { useDiffContext } from './useDiffContext';
import type { DiffHunk } from './types';

interface StatusBarProps {
  /** 当前 hunk 数组（来自 state.diffResult.hunks），便于父组件在加载态下计算 */
  hunks?: DiffHunk[] | null;
  /** 是否正在加载 */
  loading?: boolean;
  /** 错误信息（与 useDiffContext().state.error 二选一） */
  error?: string | null;
  /** 是否有输入（左右任意一侧非空） */
  hasInput?: boolean;
  /** 显式传入 reviewedHunkIds（仅当父组件不通过 context 拿时） */
  reviewedHunkIds?: number[];
}

const EMPTY_HUNKS: DiffHunk[] = [];

/**
 * 顶部状态条 — 嵌入 Toolbar 右侧
 * 格式：「N differences · Y included」，加载中显示对比中…，错误显示错误消息
 */
export const StatusBar: React.FC<StatusBarProps> = (props) => {
  // 默认从 context 拿，props 优先（便于 Story 1.5 之外复用）
  const ctx = useDiffContext();
  const hunks = props.hunks ?? ctx.state.diffResult?.hunks ?? EMPTY_HUNKS;
  const loading = props.loading ?? ctx.state.loading;
  const error = props.error ?? ctx.state.error;
  const hasInput = props.hasInput ?? Boolean(ctx.state.leftText || ctx.state.rightText);
  const reviewedHunkIds = props.reviewedHunkIds ?? ctx.state.reviewedHunkIds;

  if (!hasInput) return null;

  if (loading) {
    return (
      <div className="dt-status-bar is-loading" data-testid="dt-status-bar">
        <span className="dt-status-bar__loading">
          <Spin size="small" /> 对比中…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dt-status-bar is-error" data-testid="dt-status-bar">
        <span className="dt-status-bar__error">对比失败：{error}</span>
      </div>
    );
  }

  const totalDiffs = hunks.filter((h) => h.type !== 'unchanged').length;
  const included = reviewedHunkIds.length;

  return (
    <div className="dt-status-bar" data-testid="dt-status-bar">
      <span className="dt-status-bar__count" data-testid="dt-status-bar-count">
        {totalDiffs} differences
      </span>
      {totalDiffs > 0 && (
        <span className="dt-status-bar__sep"> · </span>
      )}
      {totalDiffs > 0 && (
        <span
          className={`dt-status-bar__included${included > 0 ? ' has-included' : ''}`}
          data-testid="dt-status-bar-included"
        >
          {included} included
        </span>
      )}
    </div>
  );
};

export default StatusBar;
