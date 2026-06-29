import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import useReducedMotion from '../../hooks/useReducedMotion';

interface LoginErrorOverlayProps {
  /** 错误提示文字，默认 "授权失败，正在返回登录页..." */
  message?: string;
  /** 返回路径，默认 /login */
  fallbackPath?: string;
  /** 显示时长(ms)，默认 1500 */
  delay?: number;
  /** 关闭回调 */
  onComplete?: () => void;
}

/**
 * 登录失败覆盖层。展示红色叉号图标 + 错误描述文字，
 * 随后自动跳转到登录页面。
 */
const LoginErrorOverlay: React.FC<LoginErrorOverlayProps> = ({
  message: errorMessage = '授权失败，正在返回登录页...',
  fallbackPath = '/login',
  delay = 1500,
  onComplete,
}) => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const dur = reduceMotion ? 0 : 0.5;
  const actualDelay = reduceMotion ? 300 : delay;

  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
      navigate(fallbackPath, { replace: true });
    }, actualDelay);
    return () => clearTimeout(timer);
  }, [navigate, fallbackPath, actualDelay, onComplete]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--miao-bg)',
    }}>
      <motion.div
        key="error"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: dur }}
        style={{ textAlign: 'center' }}
      >
        <div style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#ff4d4f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <p style={{ color: 'var(--miao-text-primary)', fontFamily: 'var(--miao-font-body)' }}>
          {errorMessage}
        </p>
      </motion.div>
    </div>
  );
};

export default LoginErrorOverlay;
