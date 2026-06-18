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
import TextComparePage from './modules/tools/text-compare';
import LogPage from './modules/admin/LogPage';
import DashboardPage from './modules/admin/DashboardPage';
import UserManagePage from './modules/admin/UserManagePage';

function AppRoutes() {
  return (
    <Routes>
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
        <Route path="tools/text-compare" element={<TextComparePage />} />
        <Route path="admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="admin/dashboard" element={<DashboardPage />} />
        <Route path="admin/logs" element={<LogPage />} />
        <Route path="admin/users" element={<UserManagePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/tools" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AntApp>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AntApp>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
