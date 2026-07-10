import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '../contexts/AuthContext';

interface RequireAuthProps {
  children: React.ReactNode;
}

const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const { state } = useAuth();
  const location = useLocation();

  // 页面刷新时静默刷新 token，显示 loading 避免白闪
  if (state.rehydrating) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!state.isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (state.mustChangePassword && location.pathname !== '/welcome-setup') {
    return <Navigate to="/welcome-setup" replace />;
  }

  return <>{children}</>;
};

export default RequireAuth;
