import React from 'react';
import { Form, Input, Button, Divider, message } from 'antd';
import { GithubOutlined, GoogleOutlined, UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authService } from '../../services/authService';
import AuthShell from './AuthShell';
import LoginSuccessOverlay from '../../components/shared/LoginSuccessOverlay';

interface LoginFormValues {
  username: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const [form] = Form.useForm<LoginFormValues>();
  const [loading, setLoading] = React.useState(false);
  const [oauthLoading, setOauthLoading] = React.useState<'github' | 'google' | null>(null);
  const [loginSuccess, setLoginSuccess] = React.useState<{ username: string } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const safetyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // 优先从 location.state.from 读取重定向路径，其次从 redirect 查询参数读取
  const redirectPath = (location.state as any)?.from?.pathname || searchParams.get('redirect') || '/tools';

  // 添加页面级 class 以激活专属样式覆写
  React.useEffect(() => {
    document.body.classList.add('miao-page-login');
    return () => {
      document.body.classList.remove('miao-page-login');
    };
  }, []);

  // 组件卸载时清除安全定时器
  React.useEffect(() => {
    return () => {
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const result = await authService.login(values);
      login(result.accessToken, result.signingKey, result.user, result.mustChangePassword);

      if (result.mustChangePassword) {
        message.warning('首次登录，请设置密码');
        navigate('/welcome-setup', { replace: true });
      } else {
        message.success(`欢迎回来，${result.user.username}`);
        // 显示与 OAuth2 一致的成功动画界面
        setLoginSuccess({ username: result.user.username });
      }
    } catch {
      message.error('用户名或密码错误');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthClick = (provider: 'github' | 'google') => {
    setOauthLoading(provider);
    // 安全超时：如果 10 秒内没有离开页面，说明 OAuth 跳转失败，重置 loading
    safetyTimerRef.current = setTimeout(() => {
      setOauthLoading(null);
      message.error('OAuth 服务暂时不可用，请稍后重试');
    }, 10000);
    window.location.href = `/api/auth/oauth/${provider}`;
  };

  // 登录成功后显示成功动画覆盖层
  if (loginSuccess) {
    return (
      <LoginSuccessOverlay
        username={loginSuccess.username}
        redirectTo={redirectPath}
      />
    );
  }

  return (
    <AuthShell title="阿渺工具箱" subtitle="登录以访问你的 AI 工具">
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          requiredMark={false}
          size="large"
        >
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名或邮箱' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名或邮箱" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item className="miao-login-submit-row">
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>

          <div className="miao-login-forgot">
            <Link to="/reset-password">忘记密码？</Link>
          </div>
        </Form>

        <Divider className="miao-login-divider">或</Divider>

        <button
          type="button"
          className="miao-auth-social-btn"
          disabled={oauthLoading !== null}
          onClick={() => handleOAuthClick('github')}
        >
          <GithubOutlined />
          <span>使用 GitHub 登录</span>
        </button>

        <button
          type="button"
          className="miao-auth-social-btn miao-auth-social-btn-last"
          disabled={oauthLoading !== null}
          onClick={() => handleOAuthClick('google')}
        >
          <GoogleOutlined />
          <span>使用 Google 登录</span>
        </button>

        <div className="miao-login-footer">
          还没有账号？{' '}
          <a onClick={() => navigate('/register')}>注册账号</a>
        </div>
    </AuthShell>
  );
};

export default LoginPage;
