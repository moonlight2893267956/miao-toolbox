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
import {
  useTabs,
  isTabbable,
  makeTabKey,
  resolveTabIcon,
  resolveTabLabel,
} from '../../contexts/TabContext';
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
  const { openTab } = useTabs();
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
    const root = siderRef.current;
    if (!root) return;

    // 导航在中间滚动区，品牌/用户在固定区
    const navScroll =
      root.querySelector<HTMLElement>('.miao-sidebar-nav-scroll') ??
      root.querySelector<HTMLElement>('.miao-sidebar-body');
    const labels = navScroll?.querySelectorAll<HTMLElement>('.miao-nav-label') ?? [];
    const badges = navScroll?.querySelectorAll<HTMLElement>('.miao-nav-badge') ?? [];
    const sections = navScroll?.querySelectorAll<HTMLElement>('.miao-sidebar-section') ?? [];
    const brand = root.querySelector<HTMLElement>('.miao-sidebar-brand-text');
    const userInfo = root.querySelector<HTMLElement>('.miao-user-card-info');
    const userActs = root.querySelector<HTMLElement>('.miao-user-card-actions');

    const total = labels.length;

    const setDelay = (el: HTMLElement | null, ms: number) => {
      if (!el) return;
      el.style.setProperty('--item-delay', `${ms}ms`);
    };

    if (collapsed) {
      // Collapsing: reverse stagger — bottom disappears first
      labels.forEach((el, i) => setDelay(el, (total - 1 - i) * STAGGER_MS));
      badges.forEach((el, i) => setDelay(el, (total - 1 - i) * STAGGER_MS));
      sections.forEach((el, i) => setDelay(el, (sections.length - 1 - i) * 30));
      setDelay(brand, (total + 2) * STAGGER_MS);
      setDelay(userInfo, 0);
      setDelay(userActs, 0);
    } else {
      // Expanding: forward stagger — top appears first
      labels.forEach((el, i) => setDelay(el, i * STAGGER_MS));
      badges.forEach((el, i) => setDelay(el, i * STAGGER_MS + 15));
      sections.forEach((el, i) => setDelay(el, i * 60));
      setDelay(brand, 20);
      setDelay(userInfo, total * STAGGER_MS + 60);
      setDelay(userActs, total * STAGGER_MS + 60);
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
      {/*
        三段式布局：
        1. 顶：品牌（固定）
        2. 中：菜单可滚动
        3. 底：用户信息（固定）
      */}
      <div className="miao-sidebar-body">
        <div className="miao-sidebar-strip" />

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

        <div className="miao-sidebar-nav-scroll" data-testid="sidebar-nav-scroll">
          {sections.map((section) => (
            <React.Fragment key={section.key}>
              <div className="miao-sidebar-section">
                <div className="miao-sidebar-section-label">{section.label}</div>
              </div>
              <ul className="miao-sidebar-nav">
                {section.items.map((item) => {
                  const isActive = item.key === activeKey;
                  const navItem = (
                    <li
                      key={item.key}
                      className={`miao-nav-item${isActive ? ' miao-nav-item-active' : ''}`}
                      onClick={() => {
                        if (!item.path) return;
                        // 路径可纳入 Tab 时先 openTab，否则直接导航
                        if (isTabbable(item.path)) {
                          openTab({
                            key: makeTabKey(item.path),
                            label: item.label || resolveTabLabel(item.path),
                            path: item.path,
                            // admin 项本身有 icon；工具页走 resolveTabIcon
                            icon: item.icon ?? resolveTabIcon(item.path),
                            closable: true,
                          });
                        }
                        navigate(item.path);
                      }}
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
        </div>

        <div className="miao-sidebar-footer">
          <div className="miao-user-card">
            <UserDropdown collapsed={collapsed}>
              <button className="miao-user-card-avatar-trigger" type="button" aria-label="打开用户菜单">
                <span className="miao-user-card-avatar">{firstChar}</span>
              </button>
            </UserDropdown>
            <div className="miao-user-card-info">
              <div className="miao-user-card-name">{username}</div>
              <div className="miao-user-card-role">{roleDisplay}</div>
            </div>
            <div className="miao-user-card-actions">
              <Tooltip
                title={isDark ? '切换亮色' : '切换暗色'}
                placement="right"
                overlayClassName="miao-nav-item-tooltip"
              >
                <button
                  className="miao-user-card-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTheme();
                  }}
                  aria-label={isDark ? '切换亮色模式' : '切换暗色模式'}
                  type="button"
                >
                  {isDark ? <SunOutlined /> : <MoonOutlined />}
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {/* 始终可见的边线把手：不参与滚动，不因 hover 显隐（避免抖动） */}
      <Tooltip
        title={collapsed ? '展开侧栏' : '收起侧栏'}
        placement="right"
        mouseEnterDelay={0.25}
        overlayClassName="miao-sidebar-toggle-tip"
      >
        <button
          className={`miao-sidebar-toggle${collapsed ? ' is-collapsed' : ''}`}
          aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          type="button"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M7.4 2.4 3.9 6l3.5 3.6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </Tooltip>
    </Sider>
  );
};

export default Sidebar;
