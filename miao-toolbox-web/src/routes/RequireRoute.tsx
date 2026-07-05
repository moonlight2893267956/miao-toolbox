import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Spin, message } from 'antd';
import { isSuperAdmin, useAuth } from '../contexts/AuthContext';

interface RequireRouteProps {
  code: string;
  children: React.ReactNode;
}

const RequireRoute: React.FC<RequireRouteProps> = ({ code, children }) => {
  const { state } = useAuth();
  const allowed = isSuperAdmin(state.userInfo) || state.accessibleRoutes.includes(code);

  useEffect(() => {
    if (!state.rehydrating && !state.routesLoading && state.isAuthenticated && !allowed) {
      message.warning('您没有该页面的访问权限');
    }
  }, [allowed, state.isAuthenticated, state.rehydrating, state.routesLoading]);

  if (state.rehydrating || state.routesLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
        <Spin />
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default RequireRoute;
