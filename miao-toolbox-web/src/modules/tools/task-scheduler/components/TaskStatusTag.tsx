import React from 'react';
import type { TaskStatus } from '../types';

/** 任务状态标签（AC2：ENABLED=绿 / PAUSED=灰） */
const META: Record<TaskStatus, { label: string; tone: string }> = {
  ENABLED: { label: '启用', tone: 'success' },
  PAUSED: { label: '暂停', tone: 'muted' },
};

const TaskStatusTag: React.FC<{ status?: TaskStatus | null }> = ({ status }) => {
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

export default TaskStatusTag;
