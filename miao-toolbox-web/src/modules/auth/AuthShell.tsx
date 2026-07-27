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
  brandTitle = 'AI 工具集成门户',
  brandDescription = '翻译、文生图、文生语音等能力一站可达。服务端代理转发，密钥与权限始终可控。',
  badges = ['一次登录', '服务端代理', '密钥不落前端'],
  footnote = 'miao-toolbox',
  panelClassName,
}) => {
  const reducedMotion = useReducedMotion();
  const animate = !reducedMotion;

  return (
    <main className="miao-auth-page">
      {/* Left: hero illustration with brand copy */}
      <section className="miao-auth-brand" aria-hidden="true">
        <div className="miao-auth-hero-bg" />
        <div className="miao-auth-hero-overlay" />

        <motion.div
          className="miao-auth-hero-content"
          initial={animate ? { opacity: 0, y: 24 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="miao-auth-logo-row">
            <img src={logoImg} alt="" className="miao-brand-mark-img" />
            <span className="miao-auth-logo-text">阿渺工具箱</span>
          </div>

          <div className="miao-auth-copy">
            <span className="miao-auth-eyebrow">{brandTitle}</span>
            <p>{brandDescription}</p>
            <div className="miao-auth-badges">
              {badges.map((badge) => (
                <span key={badge} className="miao-auth-badge">{badge}</span>
              ))}
            </div>
          </div>

          <div className="miao-auth-footnote">{footnote}</div>
        </motion.div>
      </section>

      {/* Right: glass form panel */}
      <section className="miao-auth-panel-wrap">
        <motion.div
          className={['miao-auth-panel', panelClassName].filter(Boolean).join(' ')}
          initial={animate ? { opacity: 0, y: 20 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="miao-auth-heading">
            <h2>{title}</h2>
            <span className="miao-auth-subtitle">{subtitle}</span>
          </div>

          <div className="miao-auth-form">{children}</div>
        </motion.div>
      </section>
    </main>
  );
};

export default AuthShell;
