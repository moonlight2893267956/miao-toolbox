import React from 'react';

interface AdminPageHeaderProps {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
}

/**
 * 管理后台通用页面头
 * - eyebrow: 等宽字体小标（如 ADMIN · 实时概览）
 * - title: Playfair Display 大标题，支持 <em> 高亮
 * - description: 灰色描述行
 * - actions: 右侧操作区（按钮等）
 */
const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  eyebrow,
  title,
  description,
  actions,
}) => (
  <header className="miao-admin-pagehead">
    <div className="miao-admin-pagehead-text">
      <div className="miao-admin-eyebrow">{eyebrow}</div>
      <h1 className="miao-admin-title">{title}</h1>
      {description && <p className="miao-admin-desc">{description}</p>}
    </div>
    {actions && <div className="miao-admin-pagehead-actions">{actions}</div>}
  </header>
);

export default AdminPageHeader;
