import React from 'react';
import { Form, Input, Button, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axiosInstance from '../../services/axiosInstance';
import AuthShell from './AuthShell';

interface ChangePasswordFormValues {
  newPassword: string;
  confirmPassword: string;
}

const ChangePasswordPage: React.FC = () => {
  const [form] = Form.useForm<ChangePasswordFormValues>();
  const [loading, setLoading] = React.useState(false);
  const navigate = useNavigate();
  const { state } = useAuth();

  const handleSubmit = async (values: ChangePasswordFormValues) => {
    setLoading(true);
    try {
      await axiosInstance.put('/api/auth/password', {
        newPassword: values.newPassword,
      });
      message.success('密码修改成功');
      navigate('/tools', { replace: true });
    } catch {
      message.error('密码修改失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 如果不是强制改密状态，直接跳转
  React.useEffect(() => {
    if (!state.mustChangePassword && state.isAuthenticated) {
      navigate('/tools', { replace: true });
    }
  }, [state.mustChangePassword, state.isAuthenticated, navigate]);

  return (
    <AuthShell title="修改密码" subtitle="首次登录需要修改默认密码">
        <Form
          form={form}
          onFinish={handleSubmit}
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
              确认修改
            </Button>
          </Form.Item>
        </Form>
    </AuthShell>
  );
};

export default ChangePasswordPage;
