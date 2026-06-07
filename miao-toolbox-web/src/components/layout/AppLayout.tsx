import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';
import Sidebar from './Sidebar';

const { Content } = Layout;

const AppLayout: React.FC = () => {
  return (
    <Layout className="miao-shell">
      <Sidebar />
      <Layout style={{ background: 'transparent' }}>
        <Content className="miao-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
