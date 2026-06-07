import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';
import Sidebar from './Sidebar';
import AppHeader from './Header';

const { Content } = Layout;

interface AppLayoutProps {
  isAuthenticated?: boolean;
  username?: string;
  onLogout?: () => void;
  onSettings?: () => void;
}

const AppLayout: React.FC<AppLayoutProps> = ({
  isAuthenticated,
  username,
  onLogout,
  onSettings,
}) => {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sidebar />
      <Layout>
        <AppHeader
          isAuthenticated={isAuthenticated}
          username={username}
          onLogout={onLogout}
          onSettings={onSettings}
        />
        <Content style={{ margin: 24, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
