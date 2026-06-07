import React from 'react';
import { Form, Input, Button, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import axiosInstance from '../../services/axiosInstance';
import { useAuth } from '../../contexts/AuthContext';

interface ChangePasswordFormValues {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const ChangePasswordForm: React.FC = () => {
  const [form] = Form.useForm<ChangePasswordFormValues>();
  const [loading, setLoading] = React.useState(false);
  const { state, refreshToken } = useAuth();

  const handleSubmit = async (values: ChangePasswordFormValues) => {
    setLoading(true);
    try {
      await axiosInstance.put('/api/users/me/password', {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success('密码修改成功');
      form.resetFields();

      // 修改密码后刷新用户信息（mustChangePassword 可能变为 false）
      if (state.mustChangePassword) {
        await refreshToken();
      }
    } catch (error: any) {
      const response = error?.response?.data;
      if (response?.code === 'AUTH_LOGIN_FAILED') {
        message.error('旧密码不正确');
      } else if (response?.code === 'VALIDATION_FAILED') {
        message.error(response.message || '密码不符合要求');
      } else {
        message.error('密码修改失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      form={form}
      onFinish={handleSubmit}
      layout="vertical"
      requiredMark={false}
      size="large"
    >
      <Form.Item
        name="oldPassword"
        rules={[{ required: true, message: '请输入旧密码' }]}
      >
        <Input.Password prefix={<LockOutlined />} placeholder="旧密码" />
      </Form.Item>

      <Form.Item
        name="newPassword"
        rules={[
          { required: true, message: '请输入新密码' },
          { min: 8, max: 72, message: '密码长度为8-72位' },
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
          修改密码
        </Button>
      </Form.Item>
    </Form>
  );
};

export default ChangePasswordForm;
