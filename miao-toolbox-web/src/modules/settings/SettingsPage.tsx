import React, { useRef, useState } from 'react';
import {
  UserOutlined,
  SafetyOutlined,
  LinkOutlined,
  GithubOutlined,
  GoogleOutlined,
  EditOutlined,
  CrownOutlined,
  MailOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  IdcardOutlined,
  CopyOutlined,
  CameraOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import PageFadeIn from '../../components/shared/PageFadeIn';
import BasicInfoForm from './BasicInfoForm';
import ChangePasswordForm from './ChangePasswordForm';
import GitHubBindSection from './GitHubBindSection';
import GoogleBindSection from './GoogleBindSection';
import EmailBindSection from './EmailBindSection';
import { useAuth } from '../../contexts/AuthContext';
import { userService } from '../../services/userService';
import './settings-page.css';

const DEFAULT_AVATAR = '/default-avatar.webp';

const PRESET_AVATARS = [
  { name: 'cat', label: '猫咪' },
  { name: 'dog', label: '小狗' },
  { name: 'fox', label: '狐狸' },
  { name: 'panda', label: '熊猫' },
  { name: 'rabbit', label: '兔子' },
  { name: 'owl', label: '猫头鹰' },
  { name: 'penguin', label: '企鹅' },
  { name: 'bear', label: '小熊' },
];

type SettingsSection = 'profile' | 'password' | 'connections';

interface NavItem {
  key: SettingsSection;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { key: 'profile', label: '基本资料', icon: <UserOutlined /> },
  { key: 'password', label: '安全设置', icon: <SafetyOutlined /> },
  { key: 'connections', label: '账号绑定', icon: <LinkOutlined /> },
];

const roleTagClass = (code: string) => {
  if (code === 'SUPER_ADMIN') return 'is-admin';
  if (code === 'BETA_TESTER' || code.includes('BETA')) return 'is-beta';
  return 'is-user';
};

const SettingsPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [presetLoading, setPresetLoading] = useState<string | null>(null);
  const { state, updateUserInfo } = useAuth();
  const userInfo = state.userInfo;
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 前端校验
    if (file.size > 2 * 1024 * 1024) {
      message.error('头像文件不能超过 2MB');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      message.error('仅支持 JPG、PNG、GIF、WebP 格式');
      return;
    }

    setAvatarUploading(true);
    try {
      const avatarUrl = await userService.uploadAvatar(file);
      updateUserInfo({ ...userInfo!, avatarUrl });
      message.success('头像更新成功');
    } catch (error: any) {
      message.error(error?.response?.data?.message || '头像上传失败');
    } finally {
      setAvatarUploading(false);
      // 重置 input 以便重复选择同一文件
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handlePresetSelect = async (presetName: string) => {
    setPresetLoading(presetName);
    try {
      const avatarUrl = await userService.setPresetAvatar(presetName);
      updateUserInfo({ ...userInfo!, avatarUrl });
      message.success('头像已更换');
    } catch (error: any) {
      message.error(error?.response?.data?.message || '设置头像失败');
    } finally {
      setPresetLoading(null);
    }
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <div className="miao-settings-panels">
            <section className="miao-settings-card">
              <div className="miao-settings-card-header">
                <div className="miao-settings-card-icon">
                  <IdcardOutlined />
                </div>
                <div>
                  <h3 className="miao-settings-card-title">基本资料</h3>
                  <p className="miao-settings-card-desc">您的账号信息概览与用户名修改。</p>
                </div>
              </div>
              <div className="miao-settings-card-body">
                <div className="miao-settings-avatar-upload">
                  <div
                    className={`miao-settings-avatar-edit ${avatarUploading ? 'is-uploading' : ''}`}
                    onClick={handleAvatarClick}
                    title="点击更换头像"
                  >
                    <img src={userInfo?.avatarUrl || DEFAULT_AVATAR} alt={userInfo?.username ?? 'avatar'} className="miao-settings-avatar-edit-img" />
                    <div className="miao-settings-avatar-edit-overlay">
                      <CameraOutlined />
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      style={{ display: 'none' }}
                      onChange={handleAvatarChange}
                    />
                  </div>
                  <div className="miao-settings-avatar-upload-hint">
                    <p className="miao-settings-avatar-upload-title">点击头像更换</p>
                    <p className="miao-settings-avatar-upload-subtitle">支持 JPG、PNG、GIF、WebP，不超过 2MB</p>
                  </div>
                </div>
                <div className="miao-settings-preset-avatars">
                  <p className="miao-settings-preset-title">选择默认头像</p>
                  <div className="miao-settings-preset-grid">
                    {PRESET_AVATARS.map(preset => {
                      const presetUrl = `/avatars/${preset.name}.webp`;
                      const isActive = userInfo?.avatarUrl === presetUrl || userInfo?.avatarUrl === `/avatars/${preset.name}.png`;
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          className={`miao-settings-preset-item ${isActive ? 'is-active' : ''} ${presetLoading === preset.name ? 'is-loading' : ''}`}
                          onClick={() => handlePresetSelect(preset.name)}
                          disabled={presetLoading !== null}
                          title={preset.label}
                        >
                          <img src={presetUrl} alt={preset.label} className="miao-settings-preset-img" />
                          {isActive && <span className="miao-settings-preset-check"><CheckCircleOutlined /></span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="miao-settings-profile-grid">
                  <div className="miao-settings-profile-cell">
                    <span className="miao-settings-profile-label">用户名</span>
                    <span className="miao-settings-profile-value">{userInfo?.username ?? '—'}</span>
                  </div>
                  <div className="miao-settings-profile-cell">
                    <span className="miao-settings-profile-label">邮箱</span>
                    <span className="miao-settings-profile-value">
                      {userInfo?.email ? (
                        <>
                          <span className="miao-settings-profile-plain">{userInfo.email}</span>
                          {userInfo.emailVerified ? (
                            <span className="miao-settings-badge is-verified"><CheckCircleOutlined /> 已验证</span>
                          ) : (
                            <span className="miao-settings-badge is-unverified"><CloseCircleOutlined /> 未验证</span>
                          )}
                          <button
                            type="button"
                            className="miao-settings-copy-btn"
                            onClick={() => { navigator.clipboard.writeText(userInfo.email ?? ''); }}
                            title="复制邮箱"
                          >
                            <CopyOutlined />
                          </button>
                        </>
                      ) : (
                        <span className="miao-settings-badge is-empty">未绑定</span>
                      )}
                    </span>
                  </div>
                  <div className="miao-settings-profile-cell">
                    <span className="miao-settings-profile-label">GitHub</span>
                    <span className="miao-settings-profile-value">
                      {userInfo?.githubUsername ? (
                        <>
                          <span className="miao-settings-profile-plain">{userInfo.githubUsername}</span>
                          <span className="miao-settings-badge is-verified"><CheckCircleOutlined /> 已绑定</span>
                        </>
                      ) : (
                        <span className="miao-settings-badge is-empty">未绑定</span>
                      )}
                    </span>
                  </div>
                  <div className="miao-settings-profile-cell">
                    <span className="miao-settings-profile-label">Google</span>
                    <span className="miao-settings-profile-value">
                      {userInfo?.googleUsername ? (
                        <>
                          <span className="miao-settings-profile-plain">{userInfo.googleUsername}</span>
                          <span className="miao-settings-badge is-verified"><CheckCircleOutlined /> 已绑定</span>
                        </>
                      ) : (
                        <span className="miao-settings-badge is-empty">未绑定</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="miao-settings-card">
              <div className="miao-settings-card-header">
                <div className="miao-settings-card-icon">
                  <EditOutlined />
                </div>
                <div>
                  <h3 className="miao-settings-card-title">修改用户名</h3>
                  <p className="miao-settings-card-desc">修改后所有页面将同步展示新的用户名。</p>
                </div>
              </div>
              <div className="miao-settings-card-body">
                <BasicInfoForm />
              </div>
            </section>
          </div>
        );
      case 'password':
        return (
          <section className="miao-settings-card">
            <div className="miao-settings-card-header">
              <div className="miao-settings-card-icon">
                <SafetyOutlined />
              </div>
              <div>
                <h3 className="miao-settings-card-title">修改密码</h3>
                <p className="miao-settings-card-desc">建议定期更换密码，避免使用与其他网站相同的密码。</p>
              </div>
            </div>
            <div className="miao-settings-card-body">
              <ChangePasswordForm />
            </div>
          </section>
        );
      case 'connections':
        return (
          <div className="miao-settings-panels">
            <section className="miao-settings-card">
              <div className="miao-settings-card-header">
                <div className="miao-settings-card-icon is-email">
                  <MailOutlined />
                </div>
                <div>
                  <h3 className="miao-settings-card-title">邮箱绑定</h3>
                  <p className="miao-settings-card-desc">绑定邮箱后可使用邮箱登录、找回密码。</p>
                </div>
              </div>
              <div className="miao-settings-card-body">
                <EmailBindSection
                  user={userInfo!}
                  onUserUpdate={(updated) => {
                    updateUserInfo(updated);
                  }}
                />
              </div>
            </section>

            <section className="miao-settings-card">
              <div className="miao-settings-card-header">
                <div className="miao-settings-card-icon is-github">
                  <GithubOutlined />
                </div>
                <div>
                  <h3 className="miao-settings-card-title">GitHub 绑定</h3>
                  <p className="miao-settings-card-desc">绑定后可使用 GitHub 账号一键登录。</p>
                </div>
              </div>
              <div className="miao-settings-card-body">
                <GitHubBindSection />
              </div>
            </section>

            <section className="miao-settings-card">
              <div className="miao-settings-card-header">
                <div className="miao-settings-card-icon is-google">
                  <GoogleOutlined />
                </div>
                <div>
                  <h3 className="miao-settings-card-title">Google 绑定</h3>
                  <p className="miao-settings-card-desc">绑定后可使用 Google 账号一键登录。</p>
                </div>
              </div>
              <div className="miao-settings-card-body">
                <GoogleBindSection />
              </div>
            </section>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <PageFadeIn>
      <div className="miao-settings-dashboard">
        {/* 左侧导航栏 */}
        <aside className="miao-settings-aside">
          <div className="miao-settings-profile-brief">
            <div className="miao-settings-avatar has-image">
              <img src={userInfo?.avatarUrl || DEFAULT_AVATAR} alt={userInfo?.username ?? 'avatar'} className="miao-settings-avatar-img" />
            </div>
            <div className="miao-settings-user-meta">
              <h2 className="miao-settings-username">{userInfo?.username ?? '加载中…'}</h2>
              <div className="miao-settings-roles">
                {userInfo?.roles?.length ? (
                  userInfo.roles.map(role => (
                    <span key={role.code} className={`miao-settings-role-tag ${roleTagClass(role.code)}`}>
                      {role.code === 'SUPER_ADMIN' && <CrownOutlined />}
                      {role.name}
                    </span>
                  ))
                ) : (
                  <span className="miao-settings-role-tag is-user">普通用户</span>
                )}
              </div>
            </div>
          </div>

          <nav className="miao-settings-nav">
            {navItems.map(item => (
              <button
                key={item.key}
                className={`miao-settings-nav-item ${activeSection === item.key ? 'is-active' : ''}`}
                onClick={() => setActiveSection(item.key)}
                type="button"
              >
                <span className="miao-settings-nav-icon">{item.icon}</span>
                <span className="miao-settings-nav-label">{item.label}</span>
                <span className="miao-settings-nav-indicator" />
              </button>
            ))}
          </nav>
        </aside>

        {/* 主内容区 */}
        <main className="miao-settings-main">
          <div className="miao-settings-main-header">
            <span className="miao-settings-eyebrow">
              {navItems.find(n => n.key === activeSection)?.label}
            </span>
            <h1 className="miao-settings-main-title">
              {activeSection === 'profile' && '完善您的个人资料'}
              {activeSection === 'password' && '保护账户安全'}
              {activeSection === 'connections' && '连接第三方账号'}
            </h1>
            <p className="miao-settings-main-desc">
              {activeSection === 'profile' && '管理用户名和系统标识信息。'}
              {activeSection === 'password' && '定期更新密码以降低账户风险。'}
              {activeSection === 'connections' && '绑定 OAuth 账号，让登录更便捷。'}
            </p>
          </div>

          <div className="miao-settings-content-wrapper" key={activeSection}>
            {renderContent()}
          </div>
        </main>
      </div>
    </PageFadeIn>
  );
};

export default SettingsPage;
