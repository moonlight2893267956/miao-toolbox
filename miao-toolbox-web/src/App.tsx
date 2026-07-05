import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import RequireAuth from './routes/index';
import RequireRoute from './routes/RequireRoute';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './modules/auth/LoginPage';
import RegisterPage from './modules/auth/RegisterPage';
import OAuthCallback from './modules/auth/OAuthCallback';
import ChangePasswordPage from './modules/auth/ChangePasswordPage';
import SettingsPage from './modules/settings/SettingsPage';
import ToolsPage from './modules/tools/ToolsPage';
import TextComparePage from './modules/tools/text-compare';
import JsonWorkbenchPage from './modules/tools/json-workbench/JsonWorkbenchPage';
import CryptoPage from './modules/tools/crypto/CryptoPage';
import DashboardPage from './modules/admin/DashboardPage';
import UserManagePage from './modules/admin/UserManagePage';
import InvocationsPage from './modules/admin/InvocationsPage';
import RoleManagePage from './modules/admin/RoleManagePage';
import RouteManagePage from './modules/admin/RouteManagePage';

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
        <Route path="tools/text-compare" element={<RequireRoute code="TOOL_TEXT_COMPARE"><TextComparePage /></RequireRoute>} />
        <Route path="tools/json-workbench" element={<RequireRoute code="TOOL_JSON_WORKBENCH"><JsonWorkbenchPage /></RequireRoute>} />
        <Route path="tools/crypto" element={<RequireRoute code="TOOL_CRYPTO"><CryptoPage /></RequireRoute>} />
        <Route path="admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="admin/dashboard" element={<RequireRoute code="ADMIN_DASHBOARD"><DashboardPage /></RequireRoute>} />
        <Route path="admin/invocations" element={<RequireRoute code="ADMIN_INVOCATIONS"><InvocationsPage /></RequireRoute>} />
        <Route path="admin/users" element={<RequireRoute code="ADMIN_USERS"><UserManagePage /></RequireRoute>} />
        <Route path="admin/roles" element={<RequireRoute code="ADMIN_ROLES"><RoleManagePage /></RequireRoute>} />
        <Route path="admin/routes" element={<RequireRoute code="ADMIN_ROUTES"><RouteManagePage /></RequireRoute>} />
        <Route path="settings" element={<RequireRoute code="PAGE_SETTINGS"><SettingsPage /></RequireRoute>} />
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
