import React, { useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Tooltip } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  RobotOutlined,
  HomeOutlined,
  PartitionOutlined,
  SafetyOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import { useAuth, isSuperAdmin } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { toolsRegistry } from '../../modules/tools/registry';
import UserDropdown from './UserDropdown';
import './sidebar.css';

const { Sider } = Layout;

/** Animation tuning */
const STAGGER_MS = 20;         // ms between each item

/** Single nav item data */
interface NavItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  path?: string;
  routeCode?: string;
  badge?: string | number;
  badgeType?: 'count' | 'dot';
}

/** Section group */
interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const siderRef = useRef<HTMLDivElement>(null);

  const admin = isSuperAdmin(state.userInfo);
  const canAccess = useCallback((routeCode?: string) => (
    admin || !routeCode || state.accessibleRoutes.includes(routeCode)
  ), [admin, state.accessibleRoutes]);
  const username = state.userInfo?.username || '用户';
  const firstChar = username.charAt(0).toUpperCase();
  const roleDisplay = useMemo(() => {
    const roles = state.userInfo?.roles ?? [];
    if (roles.length === 0) return '用户';
    return roles.map(r => r.name).join(' / ');
  }, [state.userInfo?.roles]);

  // Build sections with items (always flat, no Collapse)
  const sections: NavSection[] = useMemo(() => {
    const availableTools = toolsRegistry.filter(t => t.category === 'available' && canAccess(t.routeCode));

    const toolItems: NavItem[] = availableTools.map(t => ({
      key: t.key,
      icon: <t.icon />,
      label: t.title,
      path: t.path!,
      routeCode: t.routeCode,
    }));

    const adminItems: NavItem[] = [
      { key: 'admin-dashboard', icon: <DashboardOutlined />, label: '仪表盘', path: '/admin/dashboard', routeCode: 'ADMIN_DASHBOARD' },
      { key: 'admin-invocations', icon: <RobotOutlined />, label: 'AI 调用日志', path: '/admin/invocations', routeCode: 'ADMIN_INVOCATIONS' },
      { key: 'admin-users', icon: <TeamOutlined />, label: '用户管理', path: '/admin/users', routeCode: 'ADMIN_USERS' },
      { key: 'admin-roles', icon: <SafetyOutlined />, label: '角色管理', path: '/admin/roles', routeCode: 'ADMIN_ROLES' },
      { key: 'admin-routes', icon: <PartitionOutlined />, label: '路由管理', path: '/admin/routes', routeCode: 'ADMIN_ROUTES' },
    ].filter(item => canAccess(item.routeCode));

    return [
      {
        key: 'workspace',
        label: 'Workspace',
        items: [
          { key: 'home', icon: <HomeOutlined />, label: '工作台', path: '/tools' },
        ],
      },
      ...(toolItems.length > 0 ? [{
        key: 'tools',
        label: 'Tools',
        items: toolItems,
      }] : []),
      ...(adminItems.length > 0
        ? [{ key: 'admin', label: 'Admin', items: adminItems }]
        : []),
    ];
  }, [admin, canAccess]);

  // Find active key
  const activeKey = useMemo(() => {
    for (const section of sections) {
      for (const item of section.items) {
        if (item.path && item.path !== '/tools' && location.pathname.startsWith(item.path)) {
          return item.key;
        }
        // Exact match for /tools root
        if (item.path === '/tools' && location.pathname === '/tools') {
          return item.key;
        }
      }
    }
    return 'home';
  }, [sections, location.pathname]);

  // ── Stagger slide animation: CSS owns the final values, JS only tunes delay ──
  useLayoutEffect(() => {
    const container = siderRef.current?.querySelector<HTMLElement>('.ant-layout-sider-children');
    if (!container) return;

    const labels   = container.querySelectorAll<HTMLElement>('.miao-nav-label');
    const badges   = container.querySelectorAll<HTMLElement>('.miao-nav-badge');
    const sections = container.querySelectorAll<HTMLElement>('.miao-sidebar-section');
    const brand    = container.querySelector<HTMLElement>('.miao-sidebar-brand-text');
    const userInfo = container.querySelector<HTMLElement>('.miao-user-card-info');
    const userActs = container.querySelector<HTMLElement>('.miao-user-card-actions');

    const total = labels.length;

    const setDelay = (el: HTMLElement | null, ms: number) => {
      if (!el) return;
      el.style.setProperty('--item-delay', `${ms}ms`);
    };

    if (collapsed) {
      // Collapsing: reverse stagger — bottom disappears first
      labels.forEach((el, i)   => setDelay(el, (total - 1 - i) * STAGGER_MS));
      badges.forEach((el, i)   => setDelay(el, (total - 1 - i) * STAGGER_MS));
      sections.forEach((el, i) => setDelay(el, (sections.length - 1 - i) * 30));
      setDelay(brand,     (total + 2) * STAGGER_MS);
      setDelay(userInfo,  0);
      setDelay(userActs,  0);
    } else {
      // Expanding: forward stagger — top appears first
      labels.forEach((el, i)   => setDelay(el, i * STAGGER_MS));
      badges.forEach((el, i)   => setDelay(el, i * STAGGER_MS + 15));
      sections.forEach((el, i) => setDelay(el, i * 60));
      setDelay(brand,     20);
      setDelay(userInfo,  total * STAGGER_MS + 60);
      setDelay(userActs,  total * STAGGER_MS + 60);
    }
  }, [collapsed]);

  return (
    <Sider
      ref={siderRef}
      className="miao-sidebar"
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      trigger={null}
      breakpoint="lg"
      width={256}
      collapsedWidth={72}
      style={{
        height: '100vh',
        position: 'sticky',
        top: 0,
        left: 0,
      }}
    >
      {/* Top gradient strip */}
      <div className="miao-sidebar-strip" />

      {/* Brand header */}
      <div
        className="miao-sidebar-brand"
        onClick={() => navigate('/tools')}
        role="button"
        tabIndex={0}
        aria-label="返回首页"
      >
        <div className="miao-sidebar-brand-mark">渺</div>
        <div className="miao-sidebar-brand-text">
          <span className="miao-sidebar-brand-title">阿渺工具箱</span>
          <span className="miao-sidebar-brand-subtitle">MIAO · TOOLBOX</span>
        </div>
      </div>

      <div className="miao-sidebar-divider" />

      {/* Nav sections */}
      {sections.map(section => (
        <React.Fragment key={section.key}>
          <div className="miao-sidebar-section">
            <div className="miao-sidebar-section-label">{section.label}</div>
          </div>
          <ul className="miao-sidebar-nav">
            {section.items.map(item => {
              const isActive = item.key === activeKey;
              const navItem = (
                <li
                  key={item.key}
                  className={`miao-nav-item${isActive ? ' miao-nav-item-active' : ''}`}
                  onClick={() => item.path && navigate(item.path)}
                  role="button"
                  tabIndex={0}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="miao-nav-icon">{item.icon}</span>
                  <span className="miao-nav-label-clip">
                    <span className="miao-nav-label">{item.label}</span>
                  </span>
                  {item.badgeType === 'dot' && (
                    <span className="miao-nav-badge-clip">
                      <span className="miao-nav-badge miao-nav-badge-dot" />
                    </span>
                  )}
                  {item.badgeType === 'count' && item.badge !== undefined && (
                    <span className="miao-nav-badge-clip">
                      <span className="miao-nav-badge miao-nav-badge-count">{item.badge}</span>
                    </span>
                  )}
                </li>
              );

              // Collapsed: wrap with Tooltip
              if (collapsed) {
                return (
                  <Tooltip
                    key={item.key}
                    title={item.label}
                    placement="right"
                    overlayClassName="miao-nav-item-tooltip"
                  >
                    {navItem}
                  </Tooltip>
                );
              }
              return navItem;
            })}
          </ul>
        </React.Fragment>
      ))}

      {/* Spacer */}
      <div className="miao-sidebar-spacer" />

      {/* Footer: user card */}
      <div className="miao-sidebar-footer">
        <div className="miao-user-card">
          <UserDropdown collapsed={collapsed}>
            <button className="miao-user-card-avatar-trigger" type="button" aria-label="打开用户菜单">
              <span className="miao-user-card-avatar">{firstChar}</span>
            </button>
          </UserDropdown>
          <div className="miao-user-card-info">
            <div className="miao-user-card-name">{username}</div>
            <div className="miao-user-card-role">
              {roleDisplay}
            </div>
          </div>
          <div className="miao-user-card-actions">
            <button
              className="miao-user-card-btn"
              onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
              title={isDark ? '切换亮色' : '切换暗色'}
              aria-label={isDark ? '切换亮色模式' : '切换暗色模式'}
            >
              {isDark ? <SunOutlined /> : <MoonOutlined />}
            </button>
          </div>
        </div>
      </div>

      {/* Unified collapse/expand toggle: 圆形 FAB，骑墙在 sidebar 右边缘，hover 才出现 */}
      <Tooltip
        title={collapsed ? '展开侧栏' : '收起侧栏'}
        placement="left"
        mouseEnterDelay={0.2}
        color="var(--miao-primary, #5C4FD0)"
      >
        <button
          className="miao-sidebar-toggle-fab"
          aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          onClick={() => setCollapsed(!collapsed)}
          type="button"
        >
          {collapsed ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M5 2.5L10 7L5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 2.5L4 7L9 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </Tooltip>
    </Sider>
  );
};

export default Sidebar;
