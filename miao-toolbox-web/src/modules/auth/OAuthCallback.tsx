import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import useReducedMotion from '../../hooks/useReducedMotion';
import LoginSuccessOverlay from '../../components/shared/LoginSuccessOverlay';
import LoginErrorOverlay from '../../components/shared/LoginErrorOverlay';

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
      const reasonParam = params.get('reason');
      const reason = reasonParam ? decodeURIComponent(reasonParam) : '';
      const isBindMode = sessionStorage.getItem('oauth_bind_mode') === 'true';
      sessionStorage.removeItem('oauth_bind_mode');
      // 清除 hash，避免刷新时重复处理
      window.history.replaceState(null, '', window.location.pathname);

      if (isBindMode) {
        // 绑定失败：展示具体原因并跳回设置页，而非跳到登录页
        message.error(reason || '账号绑定失败，请重试');
        navigate('/settings', { replace: true });
        return;
      }

      message.error(reason || '授权失败，请重试');
      setPhase('error');
      return;
    }

    const token = params.get('token');
    const signingKey = params.get('signingKey');
    const usernameParam = params.get('username');
    const rolesParam = params.get('roles') || '';
    const userIdStr = params.get('userId');
    const mustChangePassword = params.get('mustChangePassword') === 'true';

    if (token && signingKey && usernameParam && rolesParam && userIdStr) {
      const userId = parseInt(userIdStr, 10);
      if (isNaN(userId)) {
        message.error('登录信息解析失败，请重试');
        setPhase('error');
        return;
      }

      const decodedUsername = decodeURIComponent(usernameParam);
      const roles = rolesParam.split(',').filter(Boolean).map(code => ({
        id: 0,
        code,
        name: code,
      }));
      login(token, signingKey, {
        id: userId,
        username: decodedUsername,
        roles,
      }, mustChangePassword);

      window.history.replaceState(null, '', window.location.pathname);

      if (mustChangePassword) {
        message.warning('首次登录，请设置密码');
        navigate('/welcome-setup', { replace: true });
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
      setPhase('success');
    } else {
      message.error('授权失败，请重试');
      setPhase('error');
    }
  }, [navigate, login, reduceMotion]);

  const dur = reduceMotion ? 0 : 0.5;

  // 错误阶段：使用 LoginErrorOverlay，不带自动跳转（因为组件自身会在延迟后导航）
  if (phase === 'error') {
    return (
      <LoginErrorOverlay
        fallbackPath="/login"
        delay={reduceMotion ? 300 : 1500}
      />
    );
  }

  // 成功阶段：使用 LoginSuccessOverlay（纯登录场景）
  if (phase === 'success') {
    return (
      <LoginSuccessOverlay
        username={username}
        redirectTo="/tools"
        delay={reduceMotion ? 300 : 1800}
      />
    );
  }

  // 处理中阶段：保留原有的加载动画
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--miao-bg)',
    }}>
      <AnimatePresence mode="wait">
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
      </AnimatePresence>
    </div>
  );
};

export default OAuthCallback;
