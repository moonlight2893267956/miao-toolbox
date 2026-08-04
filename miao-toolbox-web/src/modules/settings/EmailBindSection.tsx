import { useState } from 'react';
import { Button, Input, Space, Typography, message, Modal } from 'antd';
import { MailOutlined, CheckCircleOutlined, DisconnectOutlined, SendOutlined } from '@ant-design/icons';
import { userService } from '../../services/userService';
import { authService, type EmailCodePurpose } from '../../services/authService';
import type { UserInfoData } from '../../services/userService';

interface EmailBindUser {
  email: string | null;
  emailVerified: boolean;
}

interface EmailBindSectionProps {
  user: EmailBindUser;
  onUserUpdate: (user: UserInfoData) => void;
}

export default function EmailBindSection({ user, onUserUpdate }: EmailBindSectionProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [mode, setMode] = useState<'idle' | 'binding'>('idle');

  const isBound = !!user.email && user.emailVerified;

  const handleSendCode = async () => {
    if (!email) {
      message.warning('请输入邮箱地址');
      return;
    }
    setSendingCode(true);
    try {
      await authService.sendEmailCode({ email, purpose: 'BIND_EMAIL' as EmailCodePurpose });
      message.success('验证码已发送');
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      message.error('发送验证码失败');
    } finally {
      setSendingCode(false);
    }
  };

  const handleBind = async () => {
    if (!email || !code) {
      message.warning('请填写邮箱和验证码');
      return;
    }
    setLoading(true);
    try {
      const updated = await userService.bindEmail(email, code);
      onUserUpdate(updated);
      message.success('邮箱绑定成功');
      setMode('idle');
      setEmail('');
      setCode('');
    } catch {
      message.error('绑定失败，请检查验证码是否正确');
    } finally {
      setLoading(false);
    }
  };

  const handleUnbind = () => {
    Modal.confirm({
      title: '解绑邮箱',
      icon: null,
      content: '解绑后将无法使用邮箱登录和找回密码，确定继续吗？',
      okText: '确定解绑',
      cancelText: '取消',
      okButtonProps: { danger: true },
      centered: true,
      className: 'miao-settings-modal',
      onOk: async () => {
        setLoading(true);
        try {
          const updated = await userService.unbindEmail();
          onUserUpdate(updated);
          message.success('邮箱已解绑');
        } catch {
          message.error('解绑失败');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  if (isBound) {
    return (
      <div className="miao-settings-connection is-bound">
        <div className="miao-settings-connection-main">
          <div className="miao-settings-connection-brand">
            <div className="miao-settings-connection-logo is-email">
              <MailOutlined />
            </div>
            <div className="miao-settings-connection-info">
              <div className="miao-settings-connection-name">邮箱</div>
              <div className="miao-settings-connection-detail">
                <CheckCircleOutlined /> 已绑定账号 <Typography.Text strong copyable={{ text: user.email }}>{user.email}</Typography.Text>
              </div>
            </div>
          </div>

          <div className="miao-settings-connection-actions">
            <Button
              danger
              ghost
              icon={<DisconnectOutlined />}
              loading={loading}
              onClick={handleUnbind}
              className="miao-settings-connection-btn"
            >
              解除绑定
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'idle') {
    return (
      <div className="miao-settings-connection">
        <div className="miao-settings-connection-main">
          <div className="miao-settings-connection-brand">
            <div className="miao-settings-connection-logo is-email">
              <MailOutlined />
            </div>
            <div className="miao-settings-connection-info">
              <div className="miao-settings-connection-name">邮箱</div>
              <div className="miao-settings-connection-detail">未绑定，可使用邮箱登录和找回密码</div>
            </div>
          </div>

          <div className="miao-settings-connection-actions">
            <Button
              type="primary"
              icon={<MailOutlined />}
              onClick={() => setMode('binding')}
              className="miao-settings-connection-btn is-email"
            >
              绑定邮箱
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="miao-settings-connection is-binding">
      <div className="miao-settings-connection-main">
        <div className="miao-settings-connection-brand">
          <div className="miao-settings-connection-logo is-email">
            <MailOutlined />
          </div>
          <div className="miao-settings-connection-info">
            <div className="miao-settings-connection-name">绑定邮箱</div>
            <div className="miao-settings-connection-detail">输入邮箱地址并验证，即可完成绑定</div>
          </div>
        </div>
      </div>

      <div className="miao-settings-connection-form">
        <Space>
          <Input
            placeholder="请输入邮箱"
            value={email}
            onChange={e => setEmail(e.target.value)}
            prefix={<MailOutlined />}
            style={{ width: 240 }}
          />
          <Button
            onClick={handleSendCode}
            loading={sendingCode}
            disabled={countdown > 0 || !email}
            icon={<SendOutlined />}
          >
            {countdown > 0 ? `${countdown}s` : '发送验证码'}
          </Button>
        </Space>
        <Space>
          <Input
            placeholder="请输入验证码"
            value={code}
            onChange={e => setCode(e.target.value)}
            style={{ width: 240 }}
            maxLength={6}
          />
          <Button
            type="primary"
            loading={loading}
            onClick={handleBind}
          >
            确认绑定
          </Button>
          <Button onClick={() => { setMode('idle'); setEmail(''); setCode(''); }}>
            取消
          </Button>
        </Space>
      </div>
    </div>
  );
}
