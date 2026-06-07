import React from 'react';
import { Layout, Button, Space, Dropdown, Avatar } from 'antd';
import {
  SunOutlined,
  MoonOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useTheme } from '../../contexts/ThemeContext';

const { Header: AntHeader } = Layout;

interface AppHeaderProps {
  isAuthenticated?: boolean;
  username?: string;
  onLogout?: () => void;
  onSettings?: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  isAuthenticated = false,
  username,
  onLogout,
  onSettings,
}) => {
  const { isDark, toggleTheme } = useTheme();

  const userMenuItems = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '个人设置',
      onClick: onSettings,
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: onLogout,
      danger: true,
    },
  ];

  return (
    <AntHeader
      style={{
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 12,
        borderBottom: '1px solid',
        borderColor: 'rgba(0,0,0,0.06)',
      }}
    >
      <Button
        type="text"
        icon={isDark ? <SunOutlined /> : <MoonOutlined />}
        onClick={toggleTheme}
        title={isDark ? '切换亮色模式' : '切换暗色模式'}
      />
      {isAuthenticated && username ? (
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space style={{ cursor: 'pointer' }}>
            <Avatar size="small" icon={<UserOutlined />} />
            <span>{username}</span>
          </Space>
        </Dropdown>
      ) : (
        <Avatar size="small" icon={<UserOutlined />} />
      )}
    </AntHeader>
  );
};

export default AppHeader;
