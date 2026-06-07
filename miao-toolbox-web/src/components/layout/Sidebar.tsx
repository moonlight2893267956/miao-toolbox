import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button } from 'antd';
import {
  ToolOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import UserDropdown from './UserDropdown';
import logoImg from '../../assets/logo.png';

const { Sider } = Layout;

interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  path: string;
  adminOnly?: boolean;
}

const menuItems: MenuItem[] = [
  { key: 'tools', icon: <ToolOutlined />, label: '工具列表', path: '/tools' },
  { key: 'admin', icon: <SettingOutlined />, label: '管理后台', path: '/admin', adminOnly: true },
];

// #22: 管理菜单仅对 ADMIN 角色显示
const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useAuth();

  const visibleItems = menuItems.filter(item => !item.adminOnly || state.userInfo?.role === 'ADMIN');
  const selectedKey = visibleItems.find(item => location.pathname.startsWith(item.path))?.key || 'tools';

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
        items={visibleItems.map(item => ({
          key: item.key,
          icon: item.icon,
          label: item.label,
          onClick: () => navigate(item.path),
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
