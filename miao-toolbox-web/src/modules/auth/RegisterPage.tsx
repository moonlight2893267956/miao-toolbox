import React from 'react';
import { Form, Input, Button, Typography, message, Alert } from 'antd';
import { UserOutlined, LockOutlined, GiftOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../../services/authService';
import AuthShell from './AuthShell';

const { Text } = Typography;

interface RegisterFormValues {
  username: string;
  password: string;
  confirmPassword: string;
}

const RegisterPage: React.FC = () => {
  const [form] = Form.useForm<RegisterFormValues>();
  const [loading, setLoading] = React.useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

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

  return (
    <AuthShell title="创建账号" subtitle="加入阿渺工具箱，开始集中管理你的 AI 工具">
        {inviteToken && (
          <div style={{ marginBottom: 20 }}>
            {inviteLoading ? (
              <Alert type="info" showIcon message="正在校验邀请链接…" />
            ) : inviteValid ? (
              <Alert
                type="success"
                showIcon
                icon={<GiftOutlined />}
                message={`受「${inviteRoleName ?? '该'}」角色邀请注册`}
                description="通过此链接注册后，你将自动获得该角色权限。"
              />
            ) : (
              <Alert
                type="error"
                showIcon
                message="邀请链接无效或已过期"
                description="该链接无法使用，请向邀请人重新获取。"
              />
            )}
          </div>
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
            <Input prefix={<UserOutlined />} placeholder="用户名" />
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
            <Input.Password prefix={<LockOutlined />} placeholder="密码（至少8位，包含字母和数字）" />
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
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" loading={loading} block disabled={inviteInvalid || inviteLoading}>
              注册
            </Button>
          </Form.Item>
        </Form>

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
