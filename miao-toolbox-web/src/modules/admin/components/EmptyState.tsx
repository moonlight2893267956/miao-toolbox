import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * 通用空状态
 * 渐变背景图标 + 标题 + 副标题 + 操作按钮
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => (
  <div className="miao-admin-empty">
    {icon && <div className="miao-admin-empty-art">{icon}</div>}
    <h3 className="miao-admin-empty-title">{title}</h3>
    {description && <p className="miao-admin-empty-desc">{description}</p>}
    {action && <div className="miao-admin-empty-action">{action}</div>}
  </div>
);

export default EmptyState;
