import React, { useState } from 'react';
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
} from '@ant-design/icons';
import PageFadeIn from '../../components/shared/PageFadeIn';
import BasicInfoForm from './BasicInfoForm';
import ChangePasswordForm from './ChangePasswordForm';
import GitHubBindSection from './GitHubBindSection';
import GoogleBindSection from './GoogleBindSection';
import EmailBindSection from './EmailBindSection';
import { useAuth } from '../../contexts/AuthContext';
import { Typography } from 'antd';
import './settings-page.css';

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
  const { state, updateUserInfo } = useAuth();
  const userInfo = state.userInfo;

  const avatarInitial = (userInfo?.username?.[0] ?? '?').toUpperCase();

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
                  <h3 className="miao-settings-card-title">个人信息</h3>
                  <p className="miao-settings-card-desc">您的基本账号信息概览。</p>
                </div>
              </div>
              <div className="miao-settings-card-body">
                <div className="miao-settings-info-grid">
                  <div className="miao-settings-info-item">
                    <span className="miao-settings-info-label">用户名</span>
                    <span className="miao-settings-info-value">{userInfo?.username ?? '—'}</span>
                  </div>
                  <div className="miao-settings-info-item">
                    <span className="miao-settings-info-label">邮箱</span>
                    <span className="miao-settings-info-value">
                      {userInfo?.email ? (
                        <>
                          {userInfo.email}
                          {userInfo.emailVerified
                            ? <CheckCircleOutlined className="miao-settings-info-verified" />
                            : <CloseCircleOutlined className="miao-settings-info-unverified" />
                          }
                          <Typography.Text copyable={{ text: userInfo.email ?? '' }} />
                        </>
                      ) : (
                        <span className="miao-settings-info-empty">未绑定</span>
                      )}
                    </span>
                  </div>
                  <div className="miao-settings-info-item">
                    <span className="miao-settings-info-label">角色</span>
                    <span className="miao-settings-info-value">
                      {userInfo?.roles?.length
                        ? userInfo.roles.map(r => r.name).join('、')
                        : '普通用户'
                      }
                    </span>
                  </div>
                  <div className="miao-settings-info-item">
                    <span className="miao-settings-info-label">GitHub</span>
                    <span className="miao-settings-info-value">
                      {userInfo?.githubUsername
                        ? <>{userInfo.githubUsername} <CheckCircleOutlined className="miao-settings-info-verified" /></>
                        : <span className="miao-settings-info-empty">未绑定</span>
                      }
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
                  <p className="miao-settings-card-desc">用户名是您在系统中的唯一标识，修改后会同步到所有工具页面。</p>
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
            <div className="miao-settings-avatar">
              <span>{avatarInitial}</span>
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
