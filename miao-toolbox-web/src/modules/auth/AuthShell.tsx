import React from 'react';
import { motion } from 'framer-motion';
import logoImg from '../../assets/logo.png';
import useReducedMotion from '../../hooks/useReducedMotion';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  brandTitle?: string;
  brandDescription?: string;
  badges?: string[];
  footnote?: string;
  panelClassName?: string;
}

const AuthShell: React.FC<AuthShellProps> = ({
  title,
  subtitle,
  children,
  brandTitle = '把常用 AI 工具，收进一个可靠入口。',
  brandDescription = '阿渺工具箱让翻译、图像、语音和管理能力集中在同一个自托管门户中。风格轻一点，权限和密钥保护稳一点。',
  badges = ['一次登录', '服务端代理', '密钥不落前端'],
  footnote = 'miao-toolbox',
  panelClassName,
}) => {
  const reducedMotion = useReducedMotion();
  const initialY = reducedMotion ? 0 : 8;
  const duration = reducedMotion ? 0 : 0.22;

  return (
    <motion.main
      className="miao-auth-page"
      initial={{ opacity: 0, y: initialY }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, ease: [0.16, 1, 0.3, 1] }}
    >
      <section className="miao-auth-brand" aria-hidden="true">
        <div>
          <img src={logoImg} alt="阿渺工具箱" className="miao-brand-mark-img" />
        </div>

        <div className="miao-auth-copy">
          <h1>{brandTitle}</h1>
          <p>{brandDescription}</p>
          <div className="miao-auth-badges">
            {badges.map((badge) => (
              <span key={badge} className="miao-auth-badge">{badge}</span>
            ))}
          </div>
        </div>

        <div className="miao-auth-footnote">{footnote}</div>
      </section>

      <section className="miao-auth-panel-wrap">
        <div className={['miao-auth-panel', panelClassName].filter(Boolean).join(' ')}>
          <div className="miao-auth-heading">
            <h2>{title}</h2>
            <span className="miao-auth-subtitle ant-typography ant-typography-secondary">
              {subtitle}
            </span>
          </div>
          {children}
        </div>
      </section>
    </motion.main>
  );
};

export default AuthShell;
