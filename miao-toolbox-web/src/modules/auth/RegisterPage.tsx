import React from 'react';
import { Form, Input, Button, Divider, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, GiftOutlined, GithubOutlined, GoogleOutlined, ExclamationCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../../services/authService';
import AuthShell from './AuthShell';

const { Text } = Typography;

interface RegisterFormValues {
  username: string;
  password: string;
  confirmPassword: string;
}

/* 邀请提示卡：深色玻璃质感，含加载/有效/无效三种状态 */
const InviteCard: React.FC<{
  loading: boolean;
  valid: boolean | null;
  roleName: string | null;
}> = ({ loading, valid, roleName }) => {
  type Variant = { className: string; icon: React.ReactNode; title: React.ReactNode; desc: string };

  const variant: Variant = loading
    ? {
        className: 'miao-invite-card is-loading',
        icon: <LoadingOutlined />,
        title: '正在校验邀请链接',
        desc: '请稍候，正在验证该邀请的有效性',
      }
    : valid
    ? {
        className: 'miao-invite-card',
        icon: <GiftOutlined />,
        title: (
          <>
            受 <strong>{roleName ?? '该'}</strong> 角色邀请注册
          </>
        ),
        desc: '通过此链接注册后，你将自动获得该角色权限',
      }
    : {
        className: 'miao-invite-card is-invalid',
        icon: <ExclamationCircleOutlined />,
        title: '邀请链接无效或已过期',
        desc: '该链接无法使用，请向邀请人重新获取',
      };

  return (
    <div className={variant.className} role="status">
      <span className="miao-invite-card-icon">{variant.icon}</span>
      <div className="miao-invite-card-body">
        <div className="miao-invite-card-title">{variant.title}</div>
        <div className="miao-invite-card-desc">{variant.desc}</div>
      </div>
    </div>
  );
};

const RegisterPage: React.FC = () => {
  const [form] = Form.useForm<RegisterFormValues>();
  const [loading, setLoading] = React.useState(false);
  const [oauthLoading, setOauthLoading] = React.useState<'github' | 'google' | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const safetyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const inviteToken = searchParams.get('invite') || '';
  const [inviteLoading, setInviteLoading] = React.useState(Boolean(inviteToken));
  const [inviteValid, setInviteValid] = React.useState<boolean | null>(inviteToken ? null : false);
  const [inviteRoleName, setInviteRoleName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!inviteToken) {
      setInviteValid(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const preview = await authService.previewInvite(inviteToken);
        if (cancelled) return;
        setInviteValid(preview.valid);
        setInviteRoleName(preview.roleName);
      } catch {
        if (!cancelled) {
          setInviteValid(false);
          setInviteRoleName(null);
        }
      } finally {
        if (!cancelled) setInviteLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [inviteToken]);

  // 组件卸载时清除安全定时器
  React.useEffect(() => {
    return () => {
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
      }
    };
  }, []);

  const inviteInvalid = Boolean(inviteToken) && inviteValid === false;

  const handleSubmit = async (values: RegisterFormValues) => {
    if (inviteInvalid) {
      message.error('邀请链接无效或已过期，请重新获取');
      return;
    }
    setLoading(true);
    try {
      await authService.register({
        username: values.username,
        password: values.password,
        inviteToken: inviteToken || undefined,
      });
      message.success('注册成功，请登录');
      navigate('/login');
    } catch (error: any) {
      const response = error?.response?.data;
      const code = response?.code;
      if (code === 'USER_ALREADY_EXISTS') {
        message.error('用户名已存在');
      } else if (code === 'VALIDATION_FAILED') {
        message.error(response?.message || '输入校验失败');
      } else if (code === 'INVITE_TOKEN_INVALID' || code === 'INVITE_TOKEN_EXPIRED') {
        message.error('邀请链接无效或已过期，请重新获取');
        setInviteValid(false);
      } else {
        message.error('注册失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthRegister = (provider: 'github' | 'google') => {
    if (inviteInvalid) {
      message.error('邀请链接无效或已过期，无法使用第三方注册');
      return;
    }
    setOauthLoading(provider);
    // 将 inviteToken 存入 sessionStorage，以便 OAuthCallback 在回调时恢复
    if (inviteToken) {
      sessionStorage.setItem('oauth_invite_token', inviteToken);
    }
    // 安全超时：如果 10 秒内没有离开页面，说明 OAuth 跳转失败，重置 loading
    safetyTimerRef.current = setTimeout(() => {
      setOauthLoading(null);
      message.error('OAuth 服务暂时不可用，请稍后重试');
    }, 10000);
    // 跳转到带 state 的 OAuth URL，state 中编码 inviteToken
    window.location.href = authService.getOAuthRegisterUrl(provider, inviteToken || undefined);
  };

  return (
    <AuthShell title="创建账号" subtitle="加入阿渺工具箱，开始集中管理你的 AI 工具">
        {inviteToken && (
          <InviteCard
            loading={inviteLoading}
            valid={inviteValid}
            roleName={inviteRoleName}
          />
        )}
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
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, max: 128, message: '密码长度为8-128位' },
              {
                validator: (_, value: string) => {
                  if (!value) return Promise.resolve();
                  const hasLetter = /[a-zA-Z]/.test(value);
                  const hasDigit = /\d/.test(value);
                  if (!hasLetter || !hasDigit) {
                    return Promise.reject(new Error('密码须包含字母和数字'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码（至少8位，包含字母和数字）" autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value: string) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" autoComplete="new-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" loading={loading} block disabled={inviteInvalid || inviteLoading}>
              创建账号
            </Button>
          </Form.Item>
        </Form>

        <Divider style={{ margin: '16px 0' }}>或使用第三方账号注册</Divider>

        <button
          type="button"
          className="miao-auth-social-btn"
          disabled={oauthLoading !== null || inviteInvalid || inviteLoading}
          onClick={() => handleOAuthRegister('github')}
        >
          {oauthLoading === 'github' ? <LoadingOutlined /> : <GithubOutlined />}
          <span>使用 GitHub 注册</span>
        </button>

        <button
          type="button"
          className="miao-auth-social-btn"
          disabled={oauthLoading !== null || inviteInvalid || inviteLoading}
          onClick={() => handleOAuthRegister('google')}
          style={{ marginBottom: 16 }}
        >
          {oauthLoading === 'google' ? <LoadingOutlined /> : <GoogleOutlined />}
          <span>使用 Google 注册</span>
        </button>

        <div style={{ textAlign: 'center' }}>
          <Text type="secondary">
            已有账号？{' '}
            <a onClick={() => navigate('/login')}>去登录</a>
          </Text>
        </div>
    </AuthShell>
  );
};

export default RegisterPage;
