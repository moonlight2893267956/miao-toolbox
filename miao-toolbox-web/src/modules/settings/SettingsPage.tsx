import React from 'react';
import { Card, Tabs } from 'antd';
import ChangePasswordForm from './ChangePasswordForm';
import GitHubBindSection from './GitHubBindSection';

const SettingsPage: React.FC = () => {
  const items = [
    {
      key: 'password',
      label: '修改密码',
      children: <ChangePasswordForm />,
    },
    {
      key: 'github',
      label: '账号绑定',
      children: <GitHubBindSection />,
    },
  ];

  return (
    <div className="miao-settings-page">
      <header className="miao-page-header">
        <div>
          <div className="miao-page-eyebrow">个人设置</div>
          <h1 className="miao-page-title">账户与偏好</h1>
          <p className="miao-page-description">
            管理密码、GitHub 绑定和账户访问状态。
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
