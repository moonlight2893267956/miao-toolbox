import React from 'react';
import { Dropdown, Avatar, Switch } from 'antd';
import type { MenuProps } from 'antd';
import { UserOutlined, LogoutOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

interface UserDropdownProps {
  collapsed?: boolean;
  isMobile?: boolean;
}

const UserDropdown: React.FC<UserDropdownProps> = ({ collapsed = false, isMobile = false }) => {
  const navigate = useNavigate();
  const { state, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // 阻止 MenuItem 的点击事件冒泡到 Dropdown 触发关闭。
  // 关键: 不能用 onClick: () => {} no-op,AntD 5/6 仍会关闭 popup;
  // 必须 stopPropagation domEvent 才能阻止关闭。
  const keepMenuOpen: NonNullable<MenuProps['onClick']> = ({ domEvent }) => {
    domEvent.stopPropagation();
  };

  const menuItems: NonNullable<MenuProps['items']> = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '个人设置',
      onClick: () => navigate('/settings'),
    },
    {
      key: 'theme',
      icon: <Switch
        size="small"
        checked={isDark}
        onChange={toggleTheme}
        // Switch 内部 click 也需阻断冒泡,避免被 AntD 视作菜单项点击
        onClick={(_, e) => e.stopPropagation()}
        checkedChildren="暗"
        unCheckedChildren="亮"
      />,
      label: '暗色模式',
      onClick: keepMenuOpen,
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

  // 桌面端：折叠时显示头像，展开时显示头像+用户名
  // 手机端：只显示头像图标
  const triggerContent = isMobile ? (
    <Avatar size={32} icon={<UserOutlined />} style={{ cursor: 'pointer' }} />
  ) : collapsed ? (
    <Avatar size={32} style={{
      cursor: 'pointer',
      backgroundColor: isDark ? '#A29BFE' : '#5C4FD0',
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
        backgroundColor: isDark ? '#A29BFE' : '#5C4FD0',
        flexShrink: 0,
      }}>
        {firstChar}
      </Avatar>
      <span style={{
        color: isDark ? 'rgba(255,255,255,0.85)' : '#fff',
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
