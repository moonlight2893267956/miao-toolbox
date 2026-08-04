import React, { useEffect, useState } from 'react';
import { Button, message, Modal, Typography } from 'antd';
import { GithubOutlined, CheckCircleOutlined, DisconnectOutlined } from '@ant-design/icons';
import axiosInstance from '../../services/axiosInstance';
import { authService } from '../../services/authService';

interface ConnectionInfo {
  githubId?: string;
  githubUsername?: string;
  googleId?: string;
  googleUsername?: string;
}

const GitHubBindSection: React.FC = () => {
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [unbinding, setUnbinding] = useState(false);

  const fetchConnectionInfo = async () => {
    try {
      const response = await axiosInstance.get('/api/users/me');
      const data = response.data.data;
      setConnectionInfo({
        githubId: data.githubId,
        githubUsername: data.githubUsername,
        googleId: data.googleId,
        googleUsername: data.googleUsername,
      });
    } catch {
      message.error('获取绑定信息失败');
    }
  };

  useEffect(() => {
    fetchConnectionInfo();
  }, []);

  const handleBind = () => {
    window.location.href = authService.getOAuthBindUrl('github');
  };

  const handleUnbind = () => {
    Modal.confirm({
      title: '解绑 GitHub 账号',
      icon: null,
      content: '解绑后将无法使用 GitHub 快速登录，确定继续吗？',
      okText: '确定解绑',
      cancelText: '取消',
      okButtonProps: { danger: true },
      centered: true,
      className: 'miao-settings-modal',
      onOk: async () => {
        setUnbinding(true);
        try {
          await axiosInstance.delete('/api/users/me/bind-github');
          message.success('GitHub 账号解绑成功');
          setConnectionInfo(prev => (prev ? { ...prev, githubId: undefined, githubUsername: undefined } : null));
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'GitHub 账号解绑失败');
        } finally {
          setUnbinding(false);
        }
      },
    });
  };

  const isBound = !!connectionInfo?.githubId;
  const username = connectionInfo?.githubUsername || connectionInfo?.githubId;

  return (
    <div className={`miao-settings-connection ${isBound ? 'is-bound' : ''}`}>
      <div className="miao-settings-connection-main">
        <div className="miao-settings-connection-brand">
          <div className="miao-settings-connection-logo">
            <GithubOutlined />
          </div>
          <div className="miao-settings-connection-info">
            <div className="miao-settings-connection-name">GitHub</div>
            {isBound ? (
              <div className="miao-settings-connection-detail">
                <CheckCircleOutlined /> 已绑定账号 <Typography.Text strong copyable={{ text: username }}>{username}</Typography.Text>
              </div>
            ) : (
              <div className="miao-settings-connection-detail">未绑定，可使用 GitHub 一键登录</div>
            )}
          </div>
        </div>

        <div className="miao-settings-connection-actions">
          {isBound ? (
            <Button
              danger
              ghost
              icon={<DisconnectOutlined />}
              loading={unbinding}
              onClick={handleUnbind}
              className="miao-settings-connection-btn"
            >
              解除绑定
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<GithubOutlined />}
              onClick={handleBind}
              className="miao-settings-connection-btn is-github"
            >
              绑定 GitHub
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GitHubBindSection;
