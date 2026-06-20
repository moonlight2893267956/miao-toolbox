import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import useReducedMotion from '../../hooks/useReducedMotion';

type Phase = 'processing' | 'success' | 'error';

const OAuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const processedRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('processing');
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    const errorParam = params.get('error');
    if (errorParam) {
      message.error('授权失败，请重试');
      setPhase('error');
      setTimeout(() => navigate('/login', { replace: true }), reduceMotion ? 300 : 1500);
      return;
    }

    const token = params.get('token');
    const signingKey = params.get('signingKey');
    const usernameParam = params.get('username');
    const role = params.get('role');
    const userIdStr = params.get('userId');
    const mustChangePassword = params.get('mustChangePassword') === 'true';

    if (token && signingKey && usernameParam && role && userIdStr) {
      const userId = parseInt(userIdStr, 10);
      if (isNaN(userId)) {
        message.error('登录信息解析失败，请重试');
        setPhase('error');
        setTimeout(() => navigate('/login', { replace: true }), reduceMotion ? 300 : 1500);
        return;
      }

      const decodedUsername = decodeURIComponent(usernameParam);
      login(token, signingKey, {
        id: userId,
        username: decodedUsername,
        role,
      }, mustChangePassword);

      window.history.replaceState(null, '', window.location.pathname);

      if (mustChangePassword) {
        message.warning('首次登录请修改密码');
        navigate('/change-password', { replace: true });
        return;
      }

      const isBindMode = sessionStorage.getItem('oauth_bind_mode') === 'true';
      sessionStorage.removeItem('oauth_bind_mode');

      if (isBindMode) {
        message.success('账号绑定成功');
        navigate('/settings', { replace: true });
        return;
      }

      setUsername(decodedUsername);
      message.success(`欢迎回来，${decodedUsername}`);
      setPhase('success');

      const delay = reduceMotion ? 300 : 1800;
      setTimeout(() => navigate('/tools', { replace: true }), delay);
    } else {
      message.error('授权失败，请重试');
      setPhase('error');
      setTimeout(() => navigate('/login', { replace: true }), reduceMotion ? 300 : 1500);
    }
  }, [navigate, login, reduceMotion]);

  const dur = reduceMotion ? 0 : 0.5;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--miao-bg)',
    }}>
      <AnimatePresence mode="wait">
        {phase === 'processing' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: dur * 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ textAlign: 'center' }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              style={{
                width: 40,
                height: 40,
                border: '3px solid var(--miao-border)',
                borderTopColor: 'var(--miao-accent)',
                borderRadius: '50%',
                margin: '0 auto 16px',
              }}
            />
            <p style={{ color: 'var(--miao-text-secondary)', fontFamily: 'var(--miao-font-body)' }}>
              正在处理登录...
            </p>
          </motion.div>
        )}

        {phase === 'success' && (
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
              欢迎回来
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
              {username}，正在进入工具箱...
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
        )}

        {phase === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur * 0.5 }}
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
              授权失败，正在返回登录页...
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OAuthCallback;
