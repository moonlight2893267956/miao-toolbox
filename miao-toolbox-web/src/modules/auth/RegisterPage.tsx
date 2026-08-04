import React from 'react';
import { Form, Input, Button, Divider, Tabs, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, GiftOutlined, GithubOutlined, GoogleOutlined, ExclamationCircleOutlined, LoadingOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../../services/authService';
import AuthShell from './AuthShell';

interface RegisterFormValues {
  username: string;
  password: string;
  confirmPassword: string;
}

interface EmailRegisterFormValues {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  code: string;
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
  const [emailForm] = Form.useForm<EmailRegisterFormValues>();
  const [loading, setLoading] = React.useState(false);
  const [oauthLoading, setOauthLoading] = React.useState<'github' | 'google' | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const safetyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // 验证码倒计时
  const [countdown, setCountdown] = React.useState(0);
  const countdownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

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

  // 添加页面级 class 以激活专属样式覆写
  React.useEffect(() => {
    document.body.classList.add('miao-page-register');
    return () => {
      document.body.classList.remove('miao-page-register');
    };
  }, []);

  // Tab 内容高度同步：切换时让面板高度平滑过渡，避免突变
  const tabsBoxRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const box = tabsBoxRef.current;
    if (!box) return;
    const holder = box.querySelector<HTMLElement>('.ant-tabs-content-holder');
    const content = box.querySelector<HTMLElement>('.ant-tabs-content');
    if (!holder || !content) return;

    const sync = () => {
      holder.style.height = `${content.offsetHeight}px`;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // 组件卸载时清除定时器
  React.useEffect(() => {
    return () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const inviteInvalid = Boolean(inviteToken) && inviteValid === false;

  // 用户名注册
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

  // 邮箱注册
  const handleEmailRegister = async (values: EmailRegisterFormValues) => {
    if (inviteInvalid) {
      message.error('邀请链接无效或已过期，请重新获取');
      return;
    }
    setLoading(true);
    try {
      await authService.emailRegister({
        email: values.email,
        username: values.username,
        password: values.password,
        code: values.code,
        inviteToken: inviteToken || undefined,
      });
      message.success('注册成功');
      // 邮箱注册自动登录，直接跳转
      navigate('/');
      // 触发 AuthContext 刷新
      window.location.reload();
    } catch (error: any) {
      const response = error?.response?.data;
      const code = response?.code;
      if (code === 'USER_ALREADY_EXISTS') {
        message.error(response?.message || '用户名或邮箱已存在');
      } else if (code === 'EMAIL_CODE_INVALID') {
        message.error('验证码错误');
      } else if (code === 'EMAIL_CODE_EXPIRED') {
        message.error('验证码已过期，请重新获取');
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

  // 发送验证码
  const handleSendCode = async () => {
    try {
      const email = emailForm.getFieldValue('email');
      if (!email) {
        message.error('请先输入邮箱');
        return;
      }
      // 简单邮箱格式校验
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        message.error('请输入正确的邮箱格式');
        return;
      }
      await authService.sendEmailCode({ email, purpose: 'REGISTER' });
      message.success('验证码已发送');
      // 开始 60 秒倒计时
      setCountdown(60);
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      const response = error?.response?.data;
      const code = response?.code;
      if (code === 'EMAIL_CODE_RATE_LIMIT') {
        message.error('发送过于频繁，请稍后再试');
      } else if (code === 'USER_ALREADY_EXISTS') {
        message.error('该邮箱已被注册');
      } else {
        message.error('验证码发送失败，请重试');
      }
    }
  };

  const handleOAuthRegister = (provider: 'github' | 'google') => {
    if (inviteInvalid) {
      message.error('邀请链接无效或已过期，无法使用第三方注册');
      return;
    }
    setOauthLoading(provider);
    if (inviteToken) {
      sessionStorage.setItem('oauth_invite_token', inviteToken);
    }
    safetyTimerRef.current = setTimeout(() => {
      setOauthLoading(null);
      message.error('OAuth 服务暂时不可用，请稍后重试');
    }, 10000);
    window.location.href = authService.getOAuthRegisterUrl(provider, inviteToken || undefined);
  };

  const passwordRules = [
    { required: true, message: '请输入密码' },
    { min: 8, max: 128, message: '密码长度为8-128位' },
    {
      validator: (_: unknown, value: string) => {
        if (!value) return Promise.resolve();
        const hasLetter = /[a-zA-Z]/.test(value);
        const hasDigit = /\d/.test(value);
        if (!hasLetter || !hasDigit) {
          return Promise.reject(new Error('密码须包含字母和数字'));
        }
        return Promise.resolve();
      },
    },
  ];

  const confirmPasswordRules = [
    { required: true, message: '请确认密码' },
    ({ getFieldValue }: { getFieldValue: (name: string) => string }) => ({
      validator(_: unknown, value: string) {
        if (!value || getFieldValue('password') === value) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('两次输入的密码不一致'));
      },
    }),
  ];

  const tabItems = [
    {
      key: 'username',
      label: '用户名注册',
      children: (
        <Form form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false} size="large">
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

          <Form.Item name="password" rules={passwordRules}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码（至少8位，包含字母和数字）" autoComplete="new-password" />
          </Form.Item>

          <Form.Item name="confirmPassword" dependencies={['password']} rules={confirmPasswordRules}>
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" autoComplete="new-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block disabled={inviteInvalid || inviteLoading}>
              创建账号
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'email',
      label: '邮箱注册',
      children: (
        <Form form={emailForm} onFinish={handleEmailRegister} layout="vertical" requiredMark={false} size="large">
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入正确的邮箱格式' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="邮箱地址" autoComplete="email" />
          </Form.Item>

          <Form.Item
            name="code"
            rules={[{ required: true, message: '请输入验证码' }]}
            className="miao-code-field"
          >
            <Input
              placeholder="6位验证码"
              autoComplete="one-time-code"
              maxLength={6}
              className="miao-code-input"
              suffix={
                <button
                  type="button"
                  className="miao-code-send-btn"
                  disabled={countdown > 0}
                  onClick={handleSendCode}
                >
                  {countdown > 0 ? (
                    <span className="miao-code-countdown">{countdown}s</span>
                  ) : (
                    <span>获取验证码</span>
                  )}
                </button>
              }
            />
          </Form.Item>

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

          <Form.Item name="password" rules={passwordRules}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码（至少8位，包含字母和数字）" autoComplete="new-password" />
          </Form.Item>

          <Form.Item name="confirmPassword" dependencies={['password']} rules={confirmPasswordRules}>
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" autoComplete="new-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block disabled={inviteInvalid || inviteLoading}>
              注册并登录
            </Button>
          </Form.Item>
        </Form>
      ),
    },
  ];

  return (
    <AuthShell title="创建账号" subtitle="加入阿渺工具箱，开始集中管理你的 AI 工具">
        {inviteToken && (
          <InviteCard
            loading={inviteLoading}
            valid={inviteValid}
            roleName={inviteRoleName}
          />
        )}
        <div ref={tabsBoxRef} className="miao-tabs-box">
          <Tabs items={tabItems} centered size="small" />
        </div>

        <Divider className="miao-register-divider">或使用第三方账号注册</Divider>

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
          className="miao-auth-social-btn miao-auth-social-btn-last"
          disabled={oauthLoading !== null || inviteInvalid || inviteLoading}
          onClick={() => handleOAuthRegister('google')}
        >
          {oauthLoading === 'google' ? <LoadingOutlined /> : <GoogleOutlined />}
          <span>使用 Google 注册</span>
        </button>

        <div className="miao-register-footer">
          已有账号？{' '}
          <a onClick={() => navigate('/login')}>去登录</a>
        </div>
    </AuthShell>
  );
};

export default RegisterPage;
