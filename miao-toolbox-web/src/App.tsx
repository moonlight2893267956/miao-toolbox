import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import RequireAuth from './routes/index';
import RequireRoute from './routes/RequireRoute';
import AppLayout from './components/layout/AppLayout';

// 路由级懒加载:每个页面拆成独立 chunk,刷新/进入时只加载当前页所需代码,
// 不再一次性拉取整个应用(含 antd 全家桶),显著缩短首屏与刷新耗时。
const LoginPage = lazy(() => import('./modules/auth/LoginPage'));
const RegisterPage = lazy(() => import('./modules/auth/RegisterPage'));
const OAuthCallback = lazy(() => import('./modules/auth/OAuthCallback'));
const ChangePasswordPage = lazy(() => import('./modules/auth/ChangePasswordPage'));
const WelcomeSetupPage = lazy(() => import('./modules/auth/WelcomeSetupPage'));
const SettingsPage = lazy(() => import('./modules/settings/SettingsPage'));
const ToolsPage = lazy(() => import('./modules/tools/ToolsPage'));
const TextComparePage = lazy(() => import('./modules/tools/text-compare'));
const JsonWorkbenchPage = lazy(() => import('./modules/tools/json-workbench/JsonWorkbenchPage'));
const CryptoPage = lazy(() => import('./modules/tools/crypto/CryptoPage'));
const TranslatePage = lazy(() => import('./modules/tools/translate'));
const RegexTesterPage = lazy(() => import('./modules/tools/regex-tester'));
const CronEditorPage = lazy(() => import('./modules/tools/cron-editor'));
const DashboardPage = lazy(() => import('./modules/admin/DashboardPage'));
const UserManagePage = lazy(() => import('./modules/admin/UserManagePage'));
const InvocationsPage = lazy(() => import('./modules/admin/InvocationsPage'));
const RoleManagePage = lazy(() => import('./modules/admin/RoleManagePage'));
const RouteManagePage = lazy(() => import('./modules/admin/RouteManagePage'));

function PageFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        color: 'var(--miao-text-secondary)',
        fontSize: 14,
      }}
    >
      加载中…
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
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
        path="/welcome-setup"
        element={
          <RequireAuth>
            <WelcomeSetupPage />
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
        <Route path="tools/translate" element={<RequireRoute code="TOOL_TRANSLATE"><TranslatePage /></RequireRoute>} />
        <Route path="tools/regex-tester" element={<RequireRoute code="TOOL_REGEX_TESTER"><RegexTesterPage /></RequireRoute>} />
        <Route path="tools/cron-editor" element={<RequireRoute code="TOOL_CRON_EDITOR"><CronEditorPage /></RequireRoute>} />
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
    </Suspense>
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
