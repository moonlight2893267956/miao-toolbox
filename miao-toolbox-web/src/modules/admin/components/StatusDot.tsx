import React from 'react';

type StatusType = 'success' | 'failure' | 'warning' | 'info';

interface StatusDotProps {
  status: StatusType;
  label: string;
}

const statusClassMap: Record<StatusType, string> = {
  success: 'miao-admin-status--success',
  failure: 'miao-admin-status--failure',
  warning: 'miao-admin-status--warn',
  info: 'miao-admin-status--info',
};

/**
 * 状态圆点徽章
 * 绿色圆点=成功, 红色=失败, 橙色=警告, 蓝色=信息
 */
const StatusDot: React.FC<StatusDotProps> = ({ status, label }) => (
  <span className={`miao-admin-status-dot ${statusClassMap[status]}`}>
    {label}
  </span>
);

export default StatusDot;
