import React from 'react';
import { Form, Input, Button, message, Typography } from 'antd';
import { CheckCircleOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axiosInstance from '../../services/axiosInstance';
import AuthShell from './AuthShell';

const { Text } = Typography;

interface SetupFormValues {
  newPassword: string;
  confirmPassword: string;
}

const WelcomeSetupPage: React.FC = () => {
  const [form] = Form.useForm<SetupFormValues>();
  const [loading, setLoading] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const navigate = useNavigate();
  const { state, refreshToken } = useAuth();

  const hasLength = password.length >= 8 && password.length <= 128;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /\d/.test(password);

  const rules = [
    { key: 'length', label: '8-128 位字符', checked: hasLength },
    { key: 'letter', label: '包含英文字母', checked: hasLetter },
    { key: 'digit', label: '包含数字', checked: hasDigit },
  ];

  // 守卫：如果不需要改密码，跳转到工具页
  React.useEffect(() => {
    if (!state.rehydrating && !state.mustChangePassword && state.isAuthenticated) {
      navigate('/tools', { replace: true });
    }
  }, [state.rehydrating, state.mustChangePassword, state.isAuthenticated, navigate]);

  const handleSubmit = async (values: SetupFormValues) => {
    setLoading(true);
    try {
      await axiosInstance.put('/api/auth/password', {
        newPassword: values.newPassword,
      });
      message.success('密码设置成功，欢迎使用阿渺工具箱');
      // 关键：刷新 token 清除 mustChangePassword 标记
      await refreshToken();
      navigate('/tools', { replace: true });
    } catch {
      message.error('密码设置失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="欢迎！设置你的密码"
      subtitle="通过 OAuth 完成了首次登录"
      brandTitle="再添一道安全锁。"
      brandDescription="你已通过 GitHub/Google 成功登录。设置一个密码作为备用登录方式，即使第三方服务暂时不可用，你也能随时访问工具箱。"
      badges={['OAuth 登录', '密码备用', '账号安全']}
      footnote="account setup"
      panelClassName="miao-password-panel"
    >
      <div className="miao-password-intro">
        <span className="miao-password-icon">
          <SafetyOutlined />
        </span>
        <div>
          <Text strong>为什么需要设置密码？</Text>
          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            密码是备用登录方式。当 GitHub 或 Google 服务不可用时，你仍可通过用户名和密码登录。
          </Text>
        </div>
      </div>

      <Form
        form={form}
        onFinish={handleSubmit}
        onValuesChange={(_, values) => setPassword(values.newPassword || '')}
        layout="vertical"
        requiredMark={false}
        size="large"
      >
        <Form.Item
          name="newPassword"
          rules={[
            { required: true, message: '请输入新密码' },
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
          <Input.Password prefix={<LockOutlined />} placeholder="新密码（至少8位，包含字母和数字）" />
        </Form.Item>

        <div className="miao-password-rules" aria-label="密码要求">
          {rules.map((rule) => (
            <span
              key={rule.key}
              className={rule.checked ? 'is-pass' : undefined}
            >
              <CheckCircleOutlined />
              {rule.label}
            </span>
          ))}
        </div>

        <Form.Item
          name="confirmPassword"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: '请确认新密码' },
            ({ getFieldValue }) => ({
              validator(_, value: string) {
                if (!value || getFieldValue('newPassword') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="确认新密码" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            完成设置，开始使用
          </Button>
        </Form.Item>
      </Form>
    </AuthShell>
  );
};

export default WelcomeSetupPage;
