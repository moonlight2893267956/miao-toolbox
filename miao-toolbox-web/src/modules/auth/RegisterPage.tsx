import React from 'react';
import { Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

  const handleSubmit = async (values: RegisterFormValues) => {
    setLoading(true);
    try {
      await authService.register({ username: values.username, password: values.password });
      message.success('注册成功，请登录');
      navigate('/login');
    } catch (error: any) {
      const response = error?.response?.data;
      const code = response?.code;
      if (code === 'USER_ALREADY_EXISTS') {
        message.error('用户名已存在');
      } else if (code === 'VALIDATION_FAILED') {
        message.error(response?.message || '输入校验失败');
      } else {
        message.error('注册失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="创建账号" subtitle="加入阿渺工具箱，开始集中管理你的 AI 工具">
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
            <Button type="primary" htmlType="submit" loading={loading} block>
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
