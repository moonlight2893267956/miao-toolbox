import React from 'react';
import { Card, Tabs } from 'antd';
import ChangePasswordForm from './ChangePasswordForm';
import GitHubBindSection from './GitHubBindSection';
import GoogleBindSection from './GoogleBindSection';

const SettingsPage: React.FC = () => {
  const items = [
    {
      key: 'password',
      label: '修改密码',
      children: <ChangePasswordForm />,
    },
    {
      key: 'github',
      label: 'GitHub 绑定',
      children: <GitHubBindSection />,
    },
    {
      key: 'google',
      label: 'Google 绑定',
      children: <GoogleBindSection />,
    },
  ];

  return (
    <div className="miao-settings-page">
      <header className="miao-page-header">
        <div>
          <div className="miao-page-eyebrow">个人设置</div>
          <h1 className="miao-page-title">账户与偏好</h1>
          <p className="miao-page-description">
            管理密码、账号绑定和账户访问状态。
          </p>
        </div>
      </header>
      <Card>
        <Tabs items={items} />
      </Card>
    </div>
  );
};

export default SettingsPage;
