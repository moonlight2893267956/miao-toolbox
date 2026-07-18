import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import AIPanel from './AIPanel';

/**
 * AI 助手右侧抽屉。
 *
 * 通过 Portal 渲染到 document.body，以绕过 AppLayout 中 framer-motion 的
 * transform/overflow:hidden —— 否则 position:fixed 会被裁剪、抽屉无法正确贴边。
 *
 * 支持：遮罩点击关闭、Esc 关闭、进出场过渡动画。
 */
interface AIDrawerProps {
  open: boolean;
  onClose: () => void;
}

const AIDrawer: React.FC<AIDrawerProps> = ({ open, onClose }) => {
  // 控制过渡动画：open 控制 is-open 类，unmount 延迟到关闭动画结束后执行
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className={`ce-ai-backdrop ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`ce-ai-drawer ${open ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="AI Cron 助手"
      >
        <AIPanel onClose={onClose} />
      </aside>
    </>,
    document.body,
  );
};

export default AIDrawer;
