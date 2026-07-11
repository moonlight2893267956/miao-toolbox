import React from 'react';
import { Button, Form, Input, Typography, message } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { userService } from '../../services/userService';

interface BasicInfoFormValues {
  username: string;
}

interface ApiErrorLike {
  response?: {
    data?: {
      code?: string;
      message?: string;
    };
  };
}

function getApiError(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as ApiErrorLike).response?.data;
}

const BasicInfoForm: React.FC = () => {
  const [form] = Form.useForm<BasicInfoFormValues>();
  const [loading, setLoading] = React.useState(false);
  const [initializing, setInitializing] = React.useState(true);
  const [serverUsername, setServerUsername] = React.useState('');
  const { state, updateUserInfo, refreshToken } = useAuth();

  React.useEffect(() => {
    let cancelled = false;
    const loadCurrentUser = async () => {
      try {
        const userInfo = await userService.getCurrentUser();
        if (cancelled) return;
        setServerUsername(userInfo.username);
        form.setFieldsValue({ username: userInfo.username });
        updateUserInfo({
          id: userInfo.id,
          username: userInfo.username,
          roles: userInfo.roles,
        });
      } catch {
        if (!cancelled) {
          // 加载失败时保持当前 AuthContext 中的用户名
          const fallback = state.userInfo?.username ?? '';
          setServerUsername(fallback);
          form.setFieldsValue({ username: fallback });
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    };

    loadCurrentUser();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在 mount 时加载一次，state/updateUserInfo/form 引用稳定
  }, []);

  const handleSubmit = async (values: BasicInfoFormValues) => {
    const username = values.username.trim();
    if (username === serverUsername) {
      message.info('用户名没有变化');
      return;
    }

    setLoading(true);
    try {
      const userInfo = await userService.updateProfile({ username });
      updateUserInfo({
        id: userInfo.id,
        username: userInfo.username,
        roles: userInfo.roles,
      });
      setServerUsername(userInfo.username);
      form.setFieldsValue({ username: userInfo.username });
      await refreshToken();
      message.success('用户名更新成功');
    } catch (error: unknown) {
      const response = getApiError(error);
      if (response?.code === 'USER_ALREADY_EXISTS') {
        message.error('用户名已存在');
      } else if (response?.code === 'VALIDATION_FAILED') {
        message.error(response.message || '用户名格式不正确');
      } else {
        message.error('用户名更新失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        基本信息
      </Typography.Title>
      <Form
        form={form}
        onFinish={handleSubmit}
        layout="vertical"
        requiredMark={false}
        size="large"
      >
        <Form.Item
          label="用户名"
          name="username"
          rules={[
            { required: true, message: '请输入用户名' },
            { min: 3, max: 20, message: '用户名长度为3-20位' },
          { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' },
        ]}
      >
          <Input prefix={<UserOutlined />} placeholder="用户名" maxLength={20} disabled={initializing} />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} disabled={initializing}>
            更新用户名
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

export default BasicInfoForm;
