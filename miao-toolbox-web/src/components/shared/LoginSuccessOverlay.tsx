import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import useReducedMotion from '../../hooks/useReducedMotion';

interface LoginSuccessOverlayProps {
  username: string;
  /** 跳转路径，默认 /tools */
  redirectTo?: string;
  /** 显示时长(ms)，默认 1800 */
  delay?: number;
  /** 成功标语，默认 "欢迎回来" */
  title?: string;
  /** 进度条下方描述，默认 "正在进入工具箱..." */
  subtitle?: string;
  /** 关闭回调（通常用于父组件清理状态） */
  onComplete?: () => void;
}

/**
 * 登录成功动画覆盖层，同时支持密码登录和 OAuth 登录。
 * 展示绿色对勾动画 → "欢迎回来" 标题 → "{username}，正在进入工具箱..." 文字 → 底部渐变色进度条，
 * 随后自动跳转到指定页面。
 */
const LoginSuccessOverlay: React.FC<LoginSuccessOverlayProps> = ({
  username,
  redirectTo = '/tools',
  delay = 1800,
  title = '欢迎回来',
  subtitle = '正在进入工具箱...',
  onComplete,
}) => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const dur = reduceMotion ? 0 : 0.5;
  const actualDelay = reduceMotion ? 300 : delay;

  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
      navigate(redirectTo, { replace: true });
    }, actualDelay);
    return () => clearTimeout(timer);
  }, [navigate, redirectTo, actualDelay, onComplete]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--miao-bg)',
    }}>
      <motion.div
        key="success"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: dur, ease: [0.34, 1.56, 0.64, 1] }}
        style={{ textAlign: 'center' }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: dur * 0.6, ease: [0.34, 1.56, 0.64, 1], delay: 0.05 }}
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--miao-accent), var(--miao-teal))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 8px 32px rgba(199, 91, 57, 0.3)',
          }}
        >
          <motion.svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M5 13l4 4L19 7"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: dur * 0.5, delay: dur * 0.3, ease: 'easeOut' }}
            />
          </motion.svg>
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur * 0.4, delay: dur * 0.4 }}
          style={{
            fontFamily: 'var(--miao-font-display)',
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--miao-text-primary)',
            margin: 0,
          }}
        >
          {title}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: dur * 0.4, delay: dur * 0.6 }}
          style={{
            color: 'var(--miao-text-secondary)',
            fontFamily: 'var(--miao-font-body)',
            marginTop: 8,
          }}
        >
          {username}，{subtitle}
        </motion.p>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: reduceMotion ? 0.15 : 1.4, delay: dur * 0.5, ease: 'easeInOut' }}
          style={{
            height: 3,
            background: 'linear-gradient(90deg, var(--miao-accent), var(--miao-teal))',
            borderRadius: 2,
            margin: '20px auto 0',
            maxWidth: 160,
          }}
        />
      </motion.div>
    </div>
  );
};

export default LoginSuccessOverlay;
