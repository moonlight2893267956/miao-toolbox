import React from 'react';
import { Form, Input, Button, message, Typography } from 'antd';
import { CheckCircleOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axiosInstance from '../../services/axiosInstance';
import AuthShell from './AuthShell';

const { Text } = Typography;

interface ChangePasswordFormValues {
  newPassword: string;
  confirmPassword: string;
}

const ChangePasswordPage: React.FC = () => {
  const [form] = Form.useForm<ChangePasswordFormValues>();
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

  const handleSubmit = async (values: ChangePasswordFormValues) => {
    setLoading(true);
    try {
      await axiosInstance.put('/api/auth/password', {
        newPassword: values.newPassword,
      });
      message.success('密码已更新，欢迎使用阿渺工具箱');
      await refreshToken();
      navigate('/tools', { replace: true });
    } catch {
      message.error('密码修改失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 如果不是强制改密状态，直接跳转
  React.useEffect(() => {
    if (!state.rehydrating && !state.mustChangePassword && state.isAuthenticated) {
      navigate('/tools', { replace: true });
    }
  }, [state.rehydrating, state.mustChangePassword, state.isAuthenticated, navigate]);

  return (
    <AuthShell
      title="设置新密码"
      subtitle="首次登录需要完成一次安全初始化"
      brandTitle="先把入口守好，再开始使用工具。"
      brandDescription="管理员为你创建了初始账号。请设置一个只有你知道的新密码，后续所有 AI 工具访问都会使用这组安全凭据。"
      badges={['首次登录', '强制改密', '会话保护']}
      footnote="account setup"
      panelClassName="miao-password-panel"
    >
        <div className="miao-password-intro">
          <span className="miao-password-icon">
            <SafetyOutlined />
          </span>
          <div>
            <Text strong>账号安全初始化</Text>
            <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
              设置后将自动进入工具列表。
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
              完成设置
            </Button>
          </Form.Item>
        </Form>
    </AuthShell>
  );
};

export default ChangePasswordPage;
