import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form, Input, message } from 'antd';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  RedoOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { AnimatePresence, motion } from 'framer-motion';
import AuthShell from './AuthShell';
import { authService } from '../../services/authService';
import useReducedMotion from '../../hooks/useReducedMotion';

const STEP_COUNT = 3;

const easeOut = [0.25, 0.1, 0.25, 1];

interface StepMeta {
  id: number;
  label: string;
  caption: string;
}

const STEPS: StepMeta[] = [
  { id: 1, label: '邮箱', caption: '输入账号邮箱' },
  { id: 2, label: '验证', caption: '填写验证码' },
  { id: 3, label: '重置', caption: '设置新密码' },
];

function calculateStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(4, Math.floor(score));
}

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();

  const [step, setStep] = useState<number>(1);
  const [email, setEmail] = useState<string>('');
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    document.body.classList.add('miao-page-reset-password');
    return () => {
      document.body.classList.remove('miao-page-reset-password');
    };
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const strength = useMemo(() => calculateStrength(newPassword), [newPassword]);
  const strengthLabels = ['太短', '偏弱', '一般', '安全', '极强'];
  const strengthColors = ['#7a7782', '#ef4444', '#f59e0b', '#34d399', '#34d399'];

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSendCode = async () => {
    if (!isValidEmail(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authService.sendEmailCode({ email, purpose: 'RESET_PASSWORD' });
      setCountdown(60);
      setStep(2);
      message.success('验证码已发送');
      setTimeout(() => codeRefs.current[0]?.focus(), 120);
    } catch (err: any) {
      setError(err?.response?.data?.message || '发送失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    await handleSendCode();
  };

  const verifyAndProceed = async (overrideCode?: string[]) => {
    const fullCode = (overrideCode ?? code).join('');
    if (fullCode.length !== 6) {
      setError('请输入 6 位验证码');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      setStep(3);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (newPassword.length < 8) {
      setError('密码至少需要 8 位');
      return;
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword)) {
      setError('密码需同时包含字母和数字');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authService.resetPassword(email, code.join(''), newPassword);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || '重置失败，请检查验证码或稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (idx: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    setError(null);
    if (digit && idx < 5) {
      codeRefs.current[idx + 1]?.focus();
    }
    if (next.every((c) => c) && next.join('').length === 6) {
      setTimeout(() => verifyAndProceed(next), 180);
    }
  };

  const handleCodeKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) {
      codeRefs.current[idx - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = pasted.split('').concat(new Array(6 - pasted.length).fill(''));
    setCode(next);
    setError(null);
    const focusIdx = Math.min(pasted.length, 5);
    setTimeout(() => codeRefs.current[focusIdx]?.focus(), 60);
    if (pasted.length === 6) {
      setTimeout(() => verifyAndProceed(next), 180);
    }
  };

  const panelVariants = {
    enter: (direction: number) => ({
      opacity: 0,
      x: direction > 0 ? 24 : -24,
    }),
    center: { opacity: 1, x: 0 },
    exit: (direction: number) => ({
      opacity: 0,
      x: direction > 0 ? -24 : 24,
    }),
  };

  const renderStepper = () => (
    <div className="miao-reset-steps" aria-label="重置进度">
      {STEPS.map((s, idx) => {
        const isDone = step > s.id || (step === STEP_COUNT && !success && s.id === STEP_COUNT);
        const isActive = step === s.id && !success;
        const isLast = idx === STEPS.length - 1;
        return (
          <div
            key={s.id}
            className={[
              'miao-reset-step',
              isDone ? 'is-done' : '',
              isActive ? 'is-active' : '',
            ].join(' ')}
            style={{ '--progress': isDone ? '100%' : '0%' } as React.CSSProperties}
          >
            <div className="miao-reset-step-node">
              {isDone && step > s.id ? <CheckOutlined /> : <span className="miao-reset-step-num">{s.id}</span>}
            </div>
            <div className="miao-reset-step-meta">
              <span className="miao-reset-step-label">{s.label}</span>
              <span className="miao-reset-step-hint">{s.caption}</span>
            </div>
            {!isLast && <div className="miao-reset-step-progress" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );

  const renderStep1 = () => (
    <motion.div
      key="step1"
      className="miao-reset-step-body"
      custom={1}
      variants={panelVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3, ease: easeOut }}
    >
      <Form layout="vertical" className="miao-reset-form">
        <Form.Item label="注册邮箱" validateStatus={error && !isValidEmail(email) ? 'error' : ''}>
          <Input
            size="large"
            placeholder="请输入你的邮箱地址"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            onPressEnter={handleSendCode}
            disabled={loading}
            autoFocus
          />
        </Form.Item>

        {error && <div className="miao-reset-error">{error}</div>}

        <Button
          type="primary"
          size="large"
          block
          onClick={handleSendCode}
          loading={loading}
          disabled={!isValidEmail(email)}
          icon={!loading && <RightOutlined />}
        >
          发送验证码
        </Button>
      </Form>
    </motion.div>
  );

  const renderStep2 = () => (
    <motion.div
      key="step2"
      className="miao-reset-step-body"
      custom={1}
      variants={panelVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3, ease: easeOut }}
    >
      <div className="miao-reset-code-header">
        <p className="miao-reset-code-hint">
          验证码已发送至 <strong>{email}</strong>
        </p>
        <button
          type="button"
          className="miao-reset-resend"
          onClick={handleResend}
          disabled={countdown > 0 || loading}
        >
          <RedoOutlined />
          {countdown > 0 ? `${countdown}s 后重发` : '重新发送'}
        </button>
      </div>

      <div className="miao-code-cells" onPaste={handleCodePaste}>
        {code.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => {
              codeRefs.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={loading}
            className={['miao-code-cell', digit ? 'is-filled' : ''].join(' ')}
            onChange={(e) => handleCodeChange(idx, e.target.value)}
            onKeyDown={(e) => handleCodeKeyDown(idx, e)}
            onFocus={(e) => e.target.select()}
          />
        ))}
      </div>

      {error && <div className="miao-reset-error">{error}</div>}

      <Button
        type="primary"
        size="large"
        block
        loading={loading}
        onClick={() => void verifyAndProceed()}
        disabled={code.join('').length !== 6}
      >
        验证并继续
      </Button>
    </motion.div>
  );

  const renderStep3 = () => (
    <motion.div
      key="step3"
      className="miao-reset-step-body"
      custom={1}
      variants={panelVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3, ease: easeOut }}
    >
      <Form layout="vertical" className="miao-reset-form">
        <Form.Item label="新密码">
          <Input.Password
            size="large"
            placeholder="至少 8 位，包含字母和数字"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setError(null);
            }}
            visibilityToggle={{
              visible: showPassword,
              onVisibleChange: setShowPassword,
            }}
            iconRender={(visible) => (visible ? <EyeInvisibleOutlined /> : <EyeOutlined />)}
            disabled={loading}
            autoFocus
          />
          {newPassword && (
            <div className="miao-reset-strength">
              <div className="miao-reset-strength-bars">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="miao-reset-strength-bar"
                    style={{
                      background: i < strength ? strengthColors[strength] : undefined,
                    }}
                  />
                ))}
              </div>
              <span
                className="miao-reset-strength-label"
                style={{ color: strengthColors[strength] }}
              >
                {strengthLabels[strength]}
              </span>
            </div>
          )}
        </Form.Item>

        <Form.Item label="确认新密码">
          <Input.Password
            size="large"
            placeholder="再输入一次以确认"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError(null);
            }}
            visibilityToggle={{
              visible: showConfirm,
              onVisibleChange: setShowConfirm,
            }}
            iconRender={(visible) => (visible ? <EyeInvisibleOutlined /> : <EyeOutlined />)}
            disabled={loading}
            onPressEnter={handleReset}
          />
        </Form.Item>

        {error && <div className="miao-reset-error">{error}</div>}

        <Button
          type="primary"
          size="large"
          block
          loading={loading}
          onClick={handleReset}
          disabled={!newPassword || !confirmPassword}
        >
          重置密码
        </Button>
      </Form>
    </motion.div>
  );

  const renderSuccess = () => (
    <motion.div
      key="success"
      className="miao-reset-success"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.4, ease: easeOut }}
    >
      <div className="miao-reset-success-orb">
        <SafetyCertificateOutlined style={{ fontSize: 36 }} />
      </div>
      <h3 className="miao-reset-success-title">密码已重置</h3>
      <p className="miao-reset-success-text">请使用新密码重新登录</p>
      <Button
        type="primary"
        size="large"
        block
        className="miao-reset-success-btn"
        onClick={() => navigate('/login')}
      >
        前往登录
      </Button>
    </motion.div>
  );

  return (
    <AuthShell
      title={success ? '' : '重置密码'}
      subtitle={success ? '' : '通过邮箱验证码安全地重置你的密码'}
      panelClassName="miao-password-panel"
      variant="geo"
    >
      <div className="miao-reset-wizard">
        {!success && renderStepper()}

        <div className="miao-reset-stage">
          <AnimatePresence mode="wait" initial={false} custom={1}>
            {success
              ? renderSuccess()
              : step === 1
                ? renderStep1()
                : step === 2
                  ? renderStep2()
                  : renderStep3()}
          </AnimatePresence>
        </div>

        {!success && (
          <div className="miao-reset-back">
            <button type="button" onClick={() => navigate('/login')}>
              <ArrowLeftOutlined />
              返回登录
            </button>
          </div>
        )}
      </div>
    </AuthShell>
  );
};

export default ResetPasswordPage;
