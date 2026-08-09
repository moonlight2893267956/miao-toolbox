import React from 'react';
import { motion } from 'framer-motion';
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
  variant?: 'default' | 'geo';
}

const AuthShell: React.FC<AuthShellProps> = ({
  title,
  subtitle,
  children,
  brandTitle = 'AI 工具集成门户',
  brandDescription = '翻译、文生图、文生语音等能力一站可达',
  panelClassName,
  variant = 'default',
}) => {
  const reducedMotion = useReducedMotion();
  const animate = !reducedMotion;
  const isGeo = variant === 'geo';

  return (
    <main className={`miao-auth-page${isGeo ? ' miao-auth-page--geo' : ''}`}>
      {isGeo && (
        <>
          {/* ── 对角线分割背景 ── */}
          <div className="miao-auth-diagonal" aria-hidden="true" />

          {/* ── 光线扫描效果 ── */}
          <div className="miao-auth-light-sweep" aria-hidden="true">
            <div className="miao-auth-sweep-h" style={{ top: '25%' }} />
            <div className="miao-auth-sweep-h" style={{ top: '60%', animationDelay: '4s' }} />
            <div className="miao-auth-sweep-h" style={{ top: '85%', animationDelay: '6s' }} />
            <div className="miao-auth-sweep-v" style={{ left: '20%', animationDelay: '2s' }} />
            <div className="miao-auth-sweep-v" style={{ left: '70%', animationDelay: '7s' }} />
            <div className="miao-auth-sweep-diag" style={{ top: '30%', animationDelay: '1s' }} />
            <div className="miao-auth-sweep-diag" style={{ top: '70%', animationDelay: '6s' }} />
          </div>

          {/* ── 几何装饰 ── */}
          <div className="miao-auth-geo miao-auth-geo-ring" aria-hidden="true">
            <div className="miao-auth-geo-ring-dot" style={{ top: 0, left: '50%', transform: 'translate(-50%, -50%)' }} />
            <div className="miao-auth-geo-ring-dot" style={{ bottom: 0, left: '50%', transform: 'translate(-50%, 50%)', animationDelay: '1.5s' }} />
            <div className="miao-auth-geo-ring-dot" style={{ top: '50%', right: 0, transform: 'translate(50%, -50%)', animationDelay: '0.75s' }} />
            <div className="miao-auth-geo-ring-dot" style={{ top: '50%', left: 0, transform: 'translate(-50%, -50%)', animationDelay: '2.25s' }} />
          </div>
          <div className="miao-auth-geo miao-auth-geo-ring-sm" aria-hidden="true" />
          <div className="miao-auth-geo miao-auth-geo-rect" aria-hidden="true" />
          <div className="miao-auth-geo miao-auth-geo-tri" aria-hidden="true" />
          <div className="miao-auth-geo miao-auth-geo-cross" aria-hidden="true" />
          <div className="miao-auth-geo miao-auth-geo-arc" aria-hidden="true" />
          <div className="miao-auth-geo miao-auth-geo-dots" aria-hidden="true">
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>

          {/* ── 左下品牌 ── */}
          <motion.div
            className="miao-auth-brand-geo"
            initial={animate ? { opacity: 0, y: 16 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            aria-hidden="true"
          >
            <div className="miao-auth-brand-meta">Constructivism · 2026</div>
            <div className="miao-auth-brand-logo-row">
              <div className="miao-auth-brand-logo-mark">
                <img src="/brand-logo-gold.svg" alt="" />
              </div>
              <span className="miao-auth-brand-logo-text">阿渺工具箱</span>
            </div>
            <div className="miao-auth-brand-desc">{brandDescription}</div>
          </motion.div>

          {/* ── 右上坐标 ── */}
          <div className="miao-auth-coord" aria-hidden="true">
            48.8566° N<br />2.3522° E<span className="miao-auth-blink">_</span>
          </div>
        </>
      )}

      {/* ── 原始品牌区（非 geo 模式显示） ── */}
      {!isGeo && (
        <div className="miao-auth-brand">
          <div className="miao-auth-hero-bg" />
          <div className="miao-auth-brand-content">
            <div className="miao-auth-logo-row">
              <img src="/brand-logo.svg" alt="阿渺工具箱" className="miao-auth-logo" />
              <h1 className="miao-auth-brand-title">{brandTitle}</h1>
            </div>
            <p className="miao-auth-brand-desc">{brandDescription}</p>
          </div>
        </div>
      )}

      {/* ── 登录面板 ── */}
      <section className="miao-auth-panel-wrap">
        <motion.div
          className={['miao-auth-panel', panelClassName].filter(Boolean).join(' ')}
          initial={animate ? { opacity: 0, y: 20, scale: 0.98 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
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
