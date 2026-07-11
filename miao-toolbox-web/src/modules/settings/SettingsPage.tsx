import React from 'react';
import { Card, Divider, Tabs, Typography } from 'antd';
import PageFadeIn from '../../components/shared/PageFadeIn';
import BasicInfoForm from './BasicInfoForm';
import ChangePasswordForm from './ChangePasswordForm';
import GitHubBindSection from './GitHubBindSection';
import GoogleBindSection from './GoogleBindSection';

const SettingsPage: React.FC = () => {
  const items = [
    {
      key: 'basic',
      label: '修改基本信息',
      children: (
        <div>
          <BasicInfoForm />
          <Divider />
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            修改密码
          </Typography.Title>
          <ChangePasswordForm />
        </div>
      ),
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
    <PageFadeIn>
      <div className="miao-settings-page">
        <header className="miao-page-header">
        <div>
          <div className="miao-page-eyebrow">个人设置</div>
          <h1 className="miao-page-title">账户与偏好</h1>
          <p className="miao-page-description">
            管理用户名、密码、账号绑定和账户访问状态。
          </p>
        </div>
      </header>
      <Card>
        <Tabs items={items} />
      </Card>
    </div>
    </PageFadeIn>
  );
};

export default SettingsPage;
