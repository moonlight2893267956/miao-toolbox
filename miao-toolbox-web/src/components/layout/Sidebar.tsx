import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button } from 'antd';
import {
  ToolOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';

const { Sider } = Layout;

interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  path: string;
}

const menuItems: MenuItem[] = [
  { key: 'tools', icon: <ToolOutlined />, label: '工具', path: '/tools' },
  { key: 'admin', icon: <SettingOutlined />, label: '管理', path: '/admin' },
];

const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = menuItems.find(item => location.pathname.startsWith(item.path))?.key || 'tools';

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      trigger={null}
      breakpoint="lg"
      collapsedWidth={64}
      style={{ height: '100vh', position: 'sticky', top: 0, left: 0 }}
    >
      <div style={{
        height: 48,
        margin: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.1)',
        color: '#fff',
        fontWeight: 700,
        fontSize: collapsed ? 16 : 18,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}>
        {collapsed ? '🐱' : '阿渺工具箱'}
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems.map(item => ({
          key: item.key,
          icon: item.icon,
          label: item.label,
          onClick: () => navigate(item.path),
        }))}
      />
      <div style={{ position: 'absolute', bottom: 0, width: '100%', padding: '8px 0', textAlign: 'center' }}>
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => setCollapsed(!collapsed)}
          style={{ color: 'rgba(255,255,255,0.65)' }}
        />
      </div>
    </Sider>
  );
};

export default Sidebar;
