import React from 'react';
import logoImg from '../../assets/logo.png';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

const AuthShell: React.FC<AuthShellProps> = ({ title, subtitle, children }) => {
  return (
    <main className="miao-auth-page">
      <section className="miao-auth-brand" aria-hidden="true">
        <div>
          <img src={logoImg} alt="阿渺工具箱" className="miao-brand-mark-img" />
        </div>

        <div className="miao-auth-copy">
          <h1>把常用 AI 工具，收进一个可靠入口。</h1>
          <p>
            阿渺工具箱让翻译、图像、语音和管理能力集中在同一个自托管门户中。
            风格轻一点，权限和密钥保护稳一点。
          </p>
          <div className="miao-auth-badges">
            <span className="miao-auth-badge">一次登录</span>
            <span className="miao-auth-badge">服务端代理</span>
            <span className="miao-auth-badge">密钥不落前端</span>
          </div>
        </div>

        <div className="miao-auth-footnote">miao-toolbox</div>
      </section>

      <section className="miao-auth-panel-wrap">
        <div className="miao-auth-panel">
          <div className="miao-auth-heading">
            <h2>{title}</h2>
            <span className="miao-auth-subtitle ant-typography ant-typography-secondary">
              {subtitle}
            </span>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
};

export default AuthShell;
