import React from 'react';
import type { ExecutionStatus } from '../types';

/** 执行状态标签（AC2：SUCCESS=绿 / FAILED=红 / TIMEOUT=橙 / SKIPPED=灰，未运行显示 -） */
const META: Record<ExecutionStatus, { label: string; tone: string }> = {
  SUCCESS: { label: '成功', tone: 'success' },
  FAILED: { label: '失败', tone: 'error' },
  TIMEOUT: { label: '超时', tone: 'warning' },
  SKIPPED: { label: '跳过', tone: 'muted' },
};

const ExecutionStatusTag: React.FC<{ status?: ExecutionStatus | null }> = ({ status }) => {
  if (!status) {
    return <span className="ts-muted">-</span>;
  }
  const meta = META[status] ?? { label: status, tone: 'muted' };
  return (
    <span className={`ts-chip ts-chip--${meta.tone}`}>
      <span className="ts-chip-dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
};

export default ExecutionStatusTag;
