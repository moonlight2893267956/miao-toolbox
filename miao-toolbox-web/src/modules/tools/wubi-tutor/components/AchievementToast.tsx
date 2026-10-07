/**
 * 成就 Toast（Story 4.4）
 *
 * 关键约束：**不打断正在进行的练习**
 * - 固定右下角浮层，`pointer-events: none`（容器），不抢焦点、不遮按键
 * - 自动消失，无「确定」按钮
 * - 不阻塞输入：用户正在打字时弹层不覆盖键盘区域
 */

import React, { useEffect } from 'react';
import { ACHIEVEMENTS, type AchievementDef } from '../utils/wubi/achievements';

/** 自动消失时长（ms） */
const AUTO_DISMISS_MS = 4200;

interface ToastItemProps {
  def: AchievementDef;
  onExpire: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ def, onExpire }) => {
  useEffect(() => {
    const timer = setTimeout(() => onExpire(def.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [def.id, onExpire]);

  return (
    <div className="wt-ach-toast" role="status" aria-live="polite">
      <span className="wt-ach-toast__badge">{def.badge}</span>
      <div className="wt-ach-toast__body">
        <span className="wt-ach-toast__label">成就解锁</span>
        <span className="wt-ach-toast__title">{def.title}</span>
        <span className="wt-ach-toast__desc">{def.desc}</span>
      </div>
    </div>
  );
};

interface AchievementToastProps {
  /** 本次新解锁的成就 id */
  ids: string[];
  onDismiss: (id: string) => void;
}

const AchievementToast: React.FC<AchievementToastProps> = ({ ids, onDismiss }) => {
  if (ids.length === 0) return null;

  const defs = ids
    .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
    .filter((d): d is AchievementDef => d != null);

  if (defs.length === 0) return null;

  return (
    <div className="wt-ach-toasts">
      {defs.map((def) => (
        <ToastItem key={def.id} def={def} onExpire={onDismiss} />
      ))}
    </div>
  );
};

export default AchievementToast;
