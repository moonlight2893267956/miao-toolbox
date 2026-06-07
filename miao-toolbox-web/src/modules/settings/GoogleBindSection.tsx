import React from 'react';
import { Button, Typography, Space, Alert, Spin, message } from 'antd';
import { GoogleOutlined, LinkOutlined, DisconnectOutlined } from '@ant-design/icons';
import axiosInstance from '../../services/axiosInstance';

const { Text } = Typography;

interface UserInfo {
  id: number;
  username: string;
  role: string;
  googleId: string | null;
  googleUsername: string | null;
  mustChangePassword: boolean;
}

const GoogleBindSection: React.FC = () => {
  const [userInfo, setUserInfo] = React.useState<UserInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [unbindLoading, setUnbindLoading] = React.useState(false);

  React.useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await axiosInstance.get('/api/users/me');
        setUserInfo(response.data.data);
      } catch {
        message.error('获取用户信息失败');
      } finally {
        setLoading(false);
      }
    };
    fetchUserInfo();
  }, []);

  const handleBind = async () => {
    try {
      const response = await axiosInstance.post('/api/users/me/bind-google');
      const oauthUrl = response.data.data;
      sessionStorage.setItem('oauth_bind_mode', 'true');
      window.location.href = oauthUrl;
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(msg || '获取绑定链接失败');
    }
  };

  const handleUnbind = async () => {
    setUnbindLoading(true);
    try {
      await axiosInstance.delete('/api/users/me/bind-google');
      message.success('已解绑 Google 账号');
      setUserInfo(prev => prev ? { ...prev, googleId: null, googleUsername: null } : null);
    } catch {
      message.error('解绑失败，请重试');
    } finally {
      setUnbindLoading(false);
    }
  };

  if (loading) {
    return <Spin />;
  }

  const isBound = !!(userInfo?.googleId);

  return (
    <div>
      {isBound ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="success"
            showIcon
            icon={<LinkOutlined />}
            message={
              <Space>
                <Text>已绑定 Google 账号：<strong>{userInfo?.googleUsername || 'Google 用户'}</strong></Text>
              </Space>
            }
          />
          <Button
            danger
            icon={<DisconnectOutlined />}
            onClick={handleUnbind}
            loading={unbindLoading}
          >
            解绑 Google
          </Button>
        </Space>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Text type="secondary">绑定 Google 账号后可使用 Google 一键登录</Text>
          <Button
            type="primary"
            icon={<GoogleOutlined />}
            onClick={handleBind}
            style={{ borderRadius: 10 }}
          >
            绑定 Google
          </Button>
        </Space>
      )}
    </div>
  );
};

export default GoogleBindSection;
