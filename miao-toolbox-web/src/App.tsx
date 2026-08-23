import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { TabProvider } from './contexts/TabContext';
import { NotificationProvider } from './contexts/NotificationContext';
import RequireAuth from './routes/index';
import RequireRoute from './routes/RequireRoute';
import AppLayout from './components/layout/AppLayout';

// 路由级懒加载:每个页面拆成独立 chunk,刷新/进入时只加载当前页所需代码,
// 不再一次性拉取整个应用(含 antd 全家桶),显著缩短首屏与刷新耗时。
const LoginPage = lazy(() => import('./modules/auth/LoginPage'));
const RegisterPage = lazy(() => import('./modules/auth/RegisterPage'));
const ResetPasswordPage = lazy(() => import('./modules/auth/ResetPasswordPage'));
const OAuthCallback = lazy(() => import('./modules/auth/OAuthCallback'));
const ChangePasswordPage = lazy(() => import('./modules/auth/ChangePasswordPage'));
const WelcomeSetupPage = lazy(() => import('./modules/auth/WelcomeSetupPage'));
const SettingsPage = lazy(() => import('./modules/settings/SettingsPage'));
const MessagesPage = lazy(() => import('./modules/messages/MessagesPage'));
const MessageDetailPage = lazy(() => import('./modules/messages/MessageDetailPage'));
const ToolsPage = lazy(() => import('./modules/tools/ToolsPage'));
const TextComparePage = lazy(() => import('./modules/tools/text-compare'));
const JsonWorkbenchPage = lazy(() => import('./modules/tools/json-workbench/JsonWorkbenchPage'));
const CryptoPage = lazy(() => import('./modules/tools/crypto/CryptoPage'));
const TranslatePage = lazy(() => import('./modules/tools/translate'));
const RegexTesterPage = lazy(() => import('./modules/tools/regex-tester'));
const CronEditorPage = lazy(() => import('./modules/tools/cron-editor'));
const PhpLogExtractorPage = lazy(() => import('./modules/tools/php-log-extractor'));
const RalLogParserPage = lazy(() => import('./modules/tools/ral-log-parser'));
const NetworkToolLayoutPreview = lazy(() => import('./modules/tools/network/NetworkToolLayoutPreview'));
const NetworkToolList = lazy(() => import('./modules/tools/network/NetworkToolList'));
const NetworkToolPage = lazy(() => import('./modules/tools/network/NetworkToolPage'));
const FileStoragePage = lazy(() => import('./modules/tools/file-storage'));
const TextBatchProcessorPage = lazy(() => import('./modules/tools/text-batch-processor/TextBatchProcessorPage'));
const DashboardPage = lazy(() => import('./modules/admin/DashboardPage'));
const UserManagePage = lazy(() => import('./modules/admin/UserManagePage'));
const InvocationsPage = lazy(() => import('./modules/admin/InvocationsPage'));
const RoleManagePage = lazy(() => import('./modules/admin/RoleManagePage'));
const RouteManagePage = lazy(() => import('./modules/admin/RouteManagePage'));
const StorageManagePage = lazy(() => import('./modules/admin/StorageManagePage'));
const AnnouncementManagePage = lazy(() => import('./modules/admin/AnnouncementManagePage'));

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
      <Route path="/reset-password" element={<ResetPasswordPage />} />
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
        <Route path="tools/php-log-extractor" element={<RequireRoute code="TOOL_PHP_LOG_EXTRACTOR"><PhpLogExtractorPage /></RequireRoute>} />
        <Route path="tools/ral-log-parser" element={<RequireRoute code="TOOL_RAL_LOG_PARSER"><RalLogParserPage /></RequireRoute>} />
        <Route path="tools/file-storage" element={<RequireRoute code="TOOL_FILE_STORAGE"><FileStoragePage /></RequireRoute>} />
        <Route path="tools/text-batch-processor" element={<RequireRoute code="TOOL_TEXT_BATCH_PROCESSOR"><TextBatchProcessorPage /></RequireRoute>} />
        <Route
          path="tools/network"
          element={
            <RequireRoute code="TOOL_NETWORK_TOOLBOX">
              <NetworkToolList />
            </RequireRoute>
          }
        />
        <Route
          path="tools/network/:category/:toolId"
          element={
            <RequireRoute code="TOOL_NETWORK_TOOLBOX">
              <NetworkToolPage />
            </RequireRoute>
          }
        />
        {/* Story nt-1-2 布局预览：仅需登录，非正式产品入口 */}
        <Route path="tools/network/_layout-preview" element={<NetworkToolLayoutPreview />} />
        <Route path="admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="admin/dashboard" element={<RequireRoute code="ADMIN_DASHBOARD"><DashboardPage /></RequireRoute>} />
        <Route path="admin/invocations" element={<RequireRoute code="ADMIN_INVOCATIONS"><InvocationsPage /></RequireRoute>} />
        <Route path="admin/users" element={<RequireRoute code="ADMIN_USERS"><UserManagePage /></RequireRoute>} />
        <Route path="admin/roles" element={<RequireRoute code="ADMIN_ROLES"><RoleManagePage /></RequireRoute>} />
        <Route path="admin/routes" element={<RequireRoute code="ADMIN_ROUTES"><RouteManagePage /></RequireRoute>} />
        <Route path="admin/storage" element={<RequireRoute code="ADMIN_STORAGE"><StorageManagePage /></RequireRoute>} />
        <Route path="admin/announcements" element={<RequireRoute code="ADMIN_ANNOUNCEMENTS"><AnnouncementManagePage /></RequireRoute>} />
        <Route path="settings" element={<RequireRoute code="PAGE_SETTINGS"><SettingsPage /></RequireRoute>} />
        <Route path="messages" element={<RequireRoute code="PAGE_SETTINGS"><MessagesPage /></RequireRoute>} />
        <Route path="messages/:id" element={<RequireRoute code="PAGE_SETTINGS"><MessageDetailPage /></RequireRoute>} />
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
        <TabProvider>
          <NotificationProvider>
            <AntApp>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </AntApp>
          </NotificationProvider>
        </TabProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
