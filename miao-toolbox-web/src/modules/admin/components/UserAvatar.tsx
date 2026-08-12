import React from 'react';

interface UserAvatarProps {
  username: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * 用户首字母色块头像
 * 根据用户名 hash 选色，保证同用户始终同色
 */

const sizeClassMap = {
  sm: 'miao-admin-avatar--sm',
  md: 'miao-admin-avatar--md',
  lg: 'miao-admin-avatar--lg',
};

const UserAvatar: React.FC<UserAvatarProps> = ({ username, avatarUrl, size = 'md' }) => {
  const src = avatarUrl || '/default-avatar.webp';

  return (
    <img
      src={src}
      alt={username}
      className={`miao-admin-avatar miao-admin-avatar-img ${sizeClassMap[size]}`}
      aria-hidden="true"
    />
  );
};

export default UserAvatar;
