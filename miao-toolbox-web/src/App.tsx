import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './modules/auth/LoginPage';
import RegisterPage from './modules/auth/RegisterPage';
import OAuthCallback from './modules/auth/OAuthCallback';

// Placeholder pages for modules not yet built
const ToolsPage = () => <div>工具列表</div>;
const AdminPage = () => <div>管理后台</div>;
const SettingsPage = () => <div>个人设置</div>;

function App() {
  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('signingKey');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />

          {/* Authenticated routes */}
          <Route
            path="/"
            element={
              <AppLayout
                isAuthenticated
                username="admin"
                onLogout={handleLogout}
                onSettings={() => window.location.href = '/settings'}
              />
            }
          >
            <Route index element={<Navigate to="/tools" replace />} />
            <Route path="tools" element={<ToolsPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
