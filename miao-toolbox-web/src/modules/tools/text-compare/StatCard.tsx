import React from 'react';
import { Spin } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useDiffContext } from './useDiffContext';

const StatCard: React.FC = () => {
  const { state } = useDiffContext();

  if (state.loading) {
    return (
      <div className="tc-stat-card">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tc-text-secondary)' }}>
          <Spin size="small" /> 正在对比...
        </span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="tc-stat-card" style={{ color: 'var(--tc-accent-removed)' }}>
        {state.error}
      </div>
    );
  }

  const hasText = state.leftText || state.rightText;

  if (!state.diffResult || !state.diffResult.hunks || state.diffResult.hunks.length === 0) {
    if (hasText) {
      return (
        <div className="tc-stat-card">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tc-cool-primary)' }}>
            <CheckCircleOutlined /> 无差异
          </span>
        </div>
      );
    }
    return null;
  }

  const stats = state.diffResult.statistics;

  return (
    <div className="tc-stat-card">
      <div className="tc-stat-item">
        <span className="tc-stat-num added">+{stats.additions}</span>
        <span className="tc-stat-label">新增</span>
      </div>
      <div className="tc-stat-item">
        <span className="tc-stat-num removed">-{stats.deletions}</span>
        <span className="tc-stat-label">删除</span>
      </div>
      <div className="tc-stat-item">
        <span className="tc-stat-num modified">~{stats.modifications}</span>
        <span className="tc-stat-label">修改</span>
      </div>
    </div>
  );
};

export default StatCard;
