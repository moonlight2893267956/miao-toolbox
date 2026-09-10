import React from 'react';

interface SchedulerHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  /** 副标题状态点是否脉冲（列表/详情表示「调度运行中」，表单页保持静态） */
  live?: boolean;
  /** 右侧动作区 */
  actions?: React.ReactNode;
}

/**
 * 模块页头（与 regex-tester / cron-editor 工作台页头同语言）：
 * 渐变图标 + 光晕、大号标题、脉冲状态点、右侧动作区。
 */
const SchedulerHeader: React.FC<SchedulerHeaderProps> = ({
  icon,
  title,
  subtitle,
  live = false,
  actions,
}) => (
  <header className="ts-header">
    <div className="ts-header-inner">
      <div className="ts-header-icon">{icon}</div>
      <div className="ts-header-text">
        <h2>{title}</h2>
        <div className="ts-header-subtitle">
          <span className={`ts-dot${live ? ' ts-dot--live' : ''}`} aria-hidden="true" />
          {subtitle}
        </div>
      </div>
      {actions ? <div className="ts-header-actions">{actions}</div> : null}
    </div>
  </header>
);

export default SchedulerHeader;
