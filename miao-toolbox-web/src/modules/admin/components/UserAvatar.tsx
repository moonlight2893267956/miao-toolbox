import React from 'react';

interface UserAvatarProps {
  username: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * 用户首字母色块头像
 * 根据用户名 hash 选色，保证同用户始终同色
 */

// 预设渐变色盘
const gradients = [
  'linear-gradient(135deg, #5C4FD0, #A29BFE)',
  'linear-gradient(135deg, #D97020, #F59E0B)',
  'linear-gradient(135deg, #237A55, #4FD89E)',
  'linear-gradient(135deg, #2D6BD6, #7AB5FF)',
  'linear-gradient(135deg, #C2362F, #FF7875)',
  'linear-gradient(135deg, #B27000, #FBBF24)',
  'linear-gradient(135deg, #6366f1, #a5b4fc)',
  'linear-gradient(135deg, #ec4899, #f9a8d4)',
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

const sizeClassMap = {
  sm: 'miao-admin-avatar--sm',
  md: 'miao-admin-avatar--md',
  lg: 'miao-admin-avatar--lg',
};

const UserAvatar: React.FC<UserAvatarProps> = ({ username, size = 'md' }) => {
  const initial = username.charAt(0).toUpperCase();
  const bg = getGradient(username);

  return (
    <span
      className={`miao-admin-avatar ${sizeClassMap[size]}`}
      style={{ background: bg }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
};

export default UserAvatar;
