import React from 'react';
import { Form, Input, Button, Divider, Typography, message } from 'antd';
import { GithubOutlined, GoogleOutlined, UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authService } from '../../services/authService';
import AuthShell from './AuthShell';
import LoginSuccessOverlay from '../../components/shared/LoginSuccessOverlay';

const { Text } = Typography;

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
        message.warning('首次登录请修改密码');
        navigate('/change-password', { replace: true });
      } else {
        message.success(`欢迎回来，${result.user.username}`);
        // 显示与 OAuth2 一致的成功动画界面
        setLoginSuccess({ username: result.user.username });
      }
    } catch (error: any) {
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
              { required: true, message: '请输入用户名' },
              { min: 3, max: 20, message: '用户名长度为3-20位' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>

        <Divider style={{ margin: '16px 0' }}>或</Divider>

        <div className="miao-auth-social-link" style={{ marginBottom: 12 }}>
          <Button
            block
            size="large"
            icon={<GithubOutlined />}
            loading={oauthLoading === 'github'}
            disabled={oauthLoading !== null}
            onClick={() => handleOAuthClick('github')}
          >
            使用 GitHub 登录
          </Button>
        </div>

        <div className="miao-auth-social-link" style={{ marginBottom: 16 }}>
          <Button
            block
            size="large"
            icon={<GoogleOutlined />}
            loading={oauthLoading === 'google'}
            disabled={oauthLoading !== null}
            onClick={() => handleOAuthClick('google')}
          >
            使用 Google 登录
          </Button>
        </div>

        <div style={{ textAlign: 'center' }}>
          <Text type="secondary">
            还没有账号？{' '}
            <a onClick={() => navigate('/register')}>注册账号</a>
          </Text>
        </div>
    </AuthShell>
  );
};

export default LoginPage;
