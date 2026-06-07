import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import RequireAuth from './routes/index';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './modules/auth/LoginPage';
import RegisterPage from './modules/auth/RegisterPage';
import OAuthCallback from './modules/auth/OAuthCallback';
import ChangePasswordPage from './modules/auth/ChangePasswordPage';
import SettingsPage from './modules/settings/SettingsPage';
import ToolsPage from './modules/tools/ToolsPage';
import LogPage from './modules/admin/LogPage';
import DashboardPage from './modules/admin/DashboardPage';
import UserManagePage from './modules/admin/UserManagePage';

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 公开路由 */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route
          path="/change-password"
          element={
            <RequireAuth>
              <ChangePasswordPage />
            </RequireAuth>
          }
        />

        {/* 受保护路由 */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/tools" replace />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="admin/dashboard" element={<DashboardPage />} />
          <Route path="admin/logs" element={<LogPage />} />
          <Route path="admin/users" element={<UserManagePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AntApp>
          <AppRoutes />
        </AntApp>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
