import React from 'react';
import { Spin } from 'antd';
import { useDiffContext } from './useDiffContext';

const StatCard: React.FC = () => {
  const { state } = useDiffContext();

  if (state.loading) {
    return (
      <div className="dt-stat-card" style={{ justifyContent: 'center' }}>
        <span className="dt-loading"><Spin size="small" /> 正在对比...</span>
      </div>
    );
  }

  if (state.error) {
    return <div className="dt-error">{state.error}</div>;
  }

  const hasText = state.leftText || state.rightText;

  if (!state.diffResult || !state.diffResult.hunks || state.diffResult.hunks.length === 0) {
    if (hasText) {
      return (
        <div className="dt-stat-card" style={{ justifyContent: 'center' }}>
          <span className="dt-stat-empty">无差异</span>
        </div>
      );
    }
    return null;
  }

  const stats = state.diffResult.statistics;

  return (
    <div className="dt-stat-card">
      <div className="dt-stat-item">
        <span className="dt-stat-num added">+{stats.additions}</span>
        <span className="dt-stat-label">新增</span>
      </div>
      <div className="dt-stat-item">
        <span className="dt-stat-num removed">-{stats.deletions}</span>
        <span className="dt-stat-label">删除</span>
      </div>
      <div className="dt-stat-item">
        <span className="dt-stat-num modified">~{stats.modifications}</span>
        <span className="dt-stat-label">修改</span>
      </div>
    </div>
  );
};

export default StatCard;
