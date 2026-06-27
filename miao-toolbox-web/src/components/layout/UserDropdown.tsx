import React from 'react';
import { Dropdown, Avatar } from 'antd';
import type { MenuProps } from 'antd';
import { UserOutlined, LogoutOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface UserDropdownProps {
  collapsed?: boolean;
  isMobile?: boolean;
  children?: React.ReactNode;
}

const UserDropdown: React.FC<UserDropdownProps> = ({ collapsed = false, isMobile = false, children }) => {
  const navigate = useNavigate();
  const { state, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const menuItems: NonNullable<MenuProps['items']> = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '个人设置',
      onClick: () => navigate('/settings'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '登出',
      danger: true,
      onClick: handleLogout,
    },
  ];

  const username = state.userInfo?.username || '用户';
  const firstChar = username.charAt(0).toUpperCase();

  // If children provided (new sidebar design), use them as trigger
  if (children) {
    return (
      <Dropdown
        menu={{ items: menuItems }}
        trigger={['click']}
        placement="topLeft"
        overlayClassName="miao-user-dropdown"
      >
        {children}
      </Dropdown>
    );
  }

  // Legacy trigger (for mobile or fallback)
  const triggerContent = isMobile ? (
    <Avatar size={32} icon={<UserOutlined />} style={{ cursor: 'pointer' }} />
  ) : collapsed ? (
    <Avatar size={32} style={{
      cursor: 'pointer',
      backgroundColor: '#5C4FD0',
    }}>
      {firstChar}
    </Avatar>
  ) : (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      cursor: 'pointer',
      borderRadius: 6,
      transition: 'background-color 0.2s',
    }}>
      <Avatar size={28} style={{
        backgroundColor: '#5C4FD0',
        flexShrink: 0,
      }}>
        {firstChar}
      </Avatar>
      <span style={{
        color: 'rgba(255,255,255,0.85)',
        fontSize: 14,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {username}
      </span>
    </div>
  );

  return (
    <Dropdown
      menu={{ items: menuItems }}
      trigger={['click']}
      placement="topLeft"
      overlayClassName="miao-user-dropdown"
    >
      {triggerContent}
    </Dropdown>
  );
};

export default UserDropdown;
