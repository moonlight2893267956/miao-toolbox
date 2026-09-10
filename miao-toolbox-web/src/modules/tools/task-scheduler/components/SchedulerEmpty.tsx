import React from 'react';

interface SchedulerEmptyProps {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}

/** 空状态（图标浮动 + 标题 + 提示），用于表格与执行历史 */
const SchedulerEmpty: React.FC<SchedulerEmptyProps> = ({ icon, title, hint }) => (
  <div className="ts-empty">
    {icon ? <div className="ts-empty-icon">{icon}</div> : null}
    <p className="ts-empty-title">{title}</p>
    {hint ? <p className="ts-empty-hint">{hint}</p> : null}
  </div>
);

export default SchedulerEmpty;
