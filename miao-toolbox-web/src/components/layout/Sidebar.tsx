import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button } from 'antd';
import {
  ToolOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FileTextOutlined,
  DashboardOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { toolsRegistry } from '../../modules/tools/registry';
import UserDropdown from './UserDropdown';
import logoImg from '../../assets/logo.png';

const { Sider } = Layout;

// #22: 管理菜单仅对 ADMIN 角色显示
const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useAuth();

  const isAdmin = state.userInfo?.role === 'ADMIN';

  // 动态构建菜单项：工具列表 + 已可用工具子项 + 管理后台
  const menuItems = [
    {
      key: 'tools',
      icon: <ToolOutlined />,
      label: '工具列表',
      children: toolsRegistry
        .filter(t => t.category === 'available')
        .map(t => ({
          key: t.key,
          icon: <t.icon />,
          label: t.title,
          path: t.path!,
        })),
    },
    ...(isAdmin
      ? [
          {
            key: 'admin',
            icon: <SettingOutlined />,
            label: '管理后台',
            children: [
              { key: 'admin-dashboard', icon: <DashboardOutlined />, label: '仪表盘', path: '/admin/dashboard' },
              { key: 'admin-logs', icon: <FileTextOutlined />, label: '调用日志', path: '/admin/logs' },
              { key: 'admin-users', icon: <TeamOutlined />, label: '用户管理', path: '/admin/users' },
            ],
          },
        ]
      : []),
  ];

  // 找到当前路径匹配的菜单项 key
  const allLeafItems = menuItems.flatMap(item => item.children || [item]);
  const selectedKey = allLeafItems.find(item => item.path && location.pathname.startsWith(item.path))?.key || 'tools';
  // 如果当前路径是子路径，展开对应父菜单
  const defaultOpenKeys = [
    ...(location.pathname.startsWith('/admin') ? ['admin'] : []),
    ...(location.pathname.startsWith('/tools/') ? ['tools'] : []),
  ];

  const [openKeys, setOpenKeys] = useState<string[]>(defaultOpenKeys);

  return (
    <Sider
      className="miao-sidebar"
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      trigger={null}
      breakpoint="lg"
      width={240}
      collapsedWidth={64}
      style={{
        height: '100vh',
        position: 'sticky',
        top: 0,
        left: 0,
        background: 'var(--miao-sidebar)',
      }}
    >
      <div className="miao-sidebar-brand" onClick={() => navigate('/tools')}>
        <img src={logoImg} alt="阿渺工具箱" className="miao-sidebar-brand-logo" />
        {!collapsed && (
          <span className="miao-sidebar-brand-text">
            <span className="miao-sidebar-brand-title">阿渺工具箱</span>
            <span className="miao-sidebar-brand-subtitle">AI tools portal</span>
          </span>
        )}
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        openKeys={collapsed ? [] : openKeys}
        onOpenChange={setOpenKeys}
        items={menuItems.map(item => ({
          key: item.key,
          icon: item.icon,
          label: item.label,
          children: item.children.map(child => ({
            key: child.key,
            icon: child.icon,
            label: child.label,
            onClick: () => child.path && navigate(child.path),
          })),
        }))}
      />
      <div className="miao-sidebar-footer">
        <UserDropdown collapsed={collapsed} />
        <div className="miao-sidebar-trigger">
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ color: 'rgba(255,255,255,0.65)' }}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          />
        </div>
      </div>
    </Sider>
  );
};

export default Sidebar;
