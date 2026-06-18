import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { message, Spin } from 'antd';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import useReducedMotion from '../../hooks/useReducedMotion';

const OAuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const processedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // 防止 React StrictMode 双重执行
    if (processedRef.current) return;
    processedRef.current = true;
    // 检查是否是 OAuth 授权失败（error 参数或缺少 token）
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    // 处理 OAuth 错误回调
    const errorParam = params.get('error');
    if (errorParam) {
      message.error('授权失败，请重试');
      navigate('/login', { replace: true });
      return;
    }

    const token = params.get('token');
    const signingKey = params.get('signingKey');
    const username = params.get('username');
    const role = params.get('role');
    const userIdStr = params.get('userId');
    const mustChangePassword = params.get('mustChangePassword') === 'true';

    if (token && signingKey && username && role && userIdStr) {
      const userId = parseInt(userIdStr, 10);
      if (isNaN(userId)) {
        message.error('登录信息解析失败，请重试');
        navigate('/login', { replace: true });
        return;
      }

      login(token, signingKey, {
        id: userId,
        username: decodeURIComponent(username),
        role,
      }, mustChangePassword);

      // 清除 fragment，防止刷新后重复解析
      window.history.replaceState(null, '', window.location.pathname);

      if (mustChangePassword) {
        message.warning('首次登录请修改密码');
        navigate('/change-password', { replace: true });
      } else {
        // 检查是否是从设置页发起的绑定操作（通过 sessionStorage 标记）
        const isBindMode = sessionStorage.getItem('oauth_bind_mode') === 'true';
        sessionStorage.removeItem('oauth_bind_mode');
        message.success(isBindMode ? '账号绑定成功' : `欢迎回来，${decodeURIComponent(username)}`);
        navigate(isBindMode ? '/settings' : '/tools', { replace: true });
      }
    } else {
      message.error('授权失败，请重试');
      navigate('/login', { replace: true });
    }
  }, [navigate, login]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <Spin size="large" />
      <p>正在处理登录...</p>
    </motion.div>
  );
};

export default OAuthCallback;
