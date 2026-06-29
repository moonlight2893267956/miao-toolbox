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

  const brandAnim = reducedMotion
    ? {}
    : { initial: { opacity: 0, x: -24 }, animate: { opacity: 1, x: 0 } };

  const panelAnim = reducedMotion
    ? {}
    : { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 } };

  const dur = reducedMotion ? 0 : 0.45;
  const ease: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

  return (
    <main className="miao-auth-page">
      <motion.section
        className="miao-auth-brand"
        aria-hidden="true"
        {...brandAnim}
        transition={{ duration: dur, ease }}
      >
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
      </motion.section>

      <motion.section
        className="miao-auth-panel-wrap"
        {...panelAnim}
        transition={{ duration: dur, ease, delay: reducedMotion ? 0 : 0.08 }}
      >
        <div className={['miao-auth-panel', panelClassName].filter(Boolean).join(' ')}>
          <div className="miao-auth-heading">
            <h2>{title}</h2>
            <span className="miao-auth-subtitle ant-typography ant-typography-secondary">
              {subtitle}
            </span>
          </div>
          {children}
        </div>
      </motion.section>
    </main>
  );
};

export default AuthShell;
