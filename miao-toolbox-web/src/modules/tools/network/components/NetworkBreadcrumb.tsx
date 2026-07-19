import React from 'react';
import { Link } from 'react-router-dom';
import { RightOutlined } from '@ant-design/icons';

export interface CrumbItem {
  label: string;
  to?: string;
  /** 用于验收：列表返回 */
  testId?: string;
}

interface NetworkBreadcrumbProps {
  items: CrumbItem[];
}

/**
 * 网络工具子页面包屑：工具箱 / 网络工具箱 / 当前工具
 */
const NetworkBreadcrumb: React.FC<NetworkBreadcrumbProps> = ({ items }) => {
  if (!items.length) return null;
  return (
    <nav className="ntl-crumb" aria-label="面包屑" data-testid="network-breadcrumb">
      <ol className="ntl-crumb-list">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="ntl-crumb-item">
              {i > 0 && <RightOutlined className="ntl-crumb-sep" aria-hidden />}
              {item.to && !last ? (
                <Link
                  to={item.to}
                  className="ntl-crumb-link"
                  data-testid={item.testId}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={`ntl-crumb-current${last ? ' is-current' : ''}`}
                  aria-current={last ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default NetworkBreadcrumb;
