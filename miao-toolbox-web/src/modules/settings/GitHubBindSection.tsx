import React from 'react';
import { Button, Typography, Space, Alert, Spin, message } from 'antd';
import { GithubOutlined, LinkOutlined, DisconnectOutlined } from '@ant-design/icons';
import axiosInstance from '../../services/axiosInstance';

const { Text } = Typography;

interface UserInfo {
  id: number;
  username: string;
  role: string;
  githubId: string | null;
  githubUsername: string | null;
  mustChangePassword: boolean;
}

const GitHubBindSection: React.FC = () => {
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

  // 从 OAuth 回调参数中检测绑定成功
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.hash.substring(1));
    if (params.get('bindSuccess') === 'true') {
      message.success('GitHub 账号绑定成功');
      // 清除 hash 参数
      window.history.replaceState(null, '', window.location.pathname);
      // 刷新用户信息
      setLoading(true);
      axiosInstance.get('/api/users/me').then(res => {
        setUserInfo(res.data.data);
      }).finally(() => setLoading(false));
    }
  }, []);

  const handleBind = async () => {
    try {
      const response = await axiosInstance.post('/api/users/me/bind-github');
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
      await axiosInstance.delete('/api/users/me/bind-github');
      message.success('已解绑 GitHub 账号');
      setUserInfo(prev => prev ? { ...prev, githubId: null, githubUsername: null } : null);
    } catch {
      message.error('解绑失败，请重试');
    } finally {
      setUnbindLoading(false);
    }
  };

  if (loading) {
    return <Spin />;
  }

  const isBound = !!(userInfo?.githubId);

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
                <Text>已绑定 GitHub 账号：<strong>{userInfo?.githubUsername || 'GitHub 用户'}</strong></Text>
              </Space>
            }
          />
          <Button
            danger
            icon={<DisconnectOutlined />}
            onClick={handleUnbind}
            loading={unbindLoading}
          >
            解绑 GitHub
          </Button>
        </Space>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Text type="secondary">绑定 GitHub 账号后可使用 GitHub 一键登录</Text>
          <Button
            type="primary"
            icon={<GithubOutlined />}
            onClick={handleBind}
            style={{ borderRadius: 10 }}
          >
            绑定 GitHub
          </Button>
        </Space>
      )}
    </div>
  );
};

export default GitHubBindSection;
