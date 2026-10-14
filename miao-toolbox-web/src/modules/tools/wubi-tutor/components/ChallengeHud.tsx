/**
 * 挑战进行中的常驻 HUD。
 *
 * 只读展示，**不抢键盘焦点**、不遮挡题目与虚拟键盘：
 * 挑战的核心动作仍然是打字，HUD 是仪表盘而不是操作台。
 *
 * 三条信息各用一种「形状 + 数字」冗余表达（不只靠颜色）：
 *   倒计时 = 环形进度 + 剩余秒数
 *   生命   = 圆点数量 + 数字
 *   得分   = 大字 + 连击
 * 这是为了让色觉障碍用户与「一闪而过没看清颜色」的场景都能读到状态。
 */

import React from 'react';
import { CHALLENGE_CONFIGS, type ChallengeMode } from '../utils/wubi/challenge';
import { remainingSeconds, type ChallengeRuntime } from '../utils/wubi/challengeState';
import type { SessionState } from '../utils/wubi/session';

interface ChallengeHudProps {
  mode: ChallengeMode;
  runtime: ChallengeRuntime;
  session: SessionState;
  /** 当前得分（由调用方按模式口径算好，HUD 不重复实现计分规则） */
  score: number;
}

/** 剩余 ≤ 该秒数时进入警示态 */
const DANGER_SECONDS = 10;

const ChallengeHud: React.FC<ChallengeHudProps> = ({ mode, runtime, session, score }) => {
  const config = CHALLENGE_CONFIGS[mode];
  const remaining = remainingSeconds(runtime, config);

  const danger = (remaining !== null && remaining <= DANGER_SECONDS)
    || (runtime.lives !== null && runtime.lives <= 1);

  // 环形进度：满圆 = 剩余时间比例
  const ratio = remaining !== null && config.timeLimitSec
    ? Math.max(0, Math.min(1, remaining / config.timeLimitSec))
    : 1;
  const RING_R = 16;
  const RING_C = 2 * Math.PI * RING_R;

  return (
    <div className={`wt-hud${danger ? ' wt-hud--danger' : ''}`} role="status" aria-live="polite">
      {remaining !== null && (
        <div className="wt-hud__timer" title="剩余时间">
          <svg className="wt-hud__ring" viewBox="0 0 40 40" aria-hidden="true">
            <circle className="wt-hud__ring-track" cx="20" cy="20" r={RING_R} />
            <circle
              className="wt-hud__ring-fill"
              cx="20"
              cy="20"
              r={RING_R}
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - ratio)}
            />
          </svg>
          <span className="wt-hud__timer-value">{Math.ceil(remaining)}</span>
          <span className="wt-hud__timer-unit">s</span>
        </div>
      )}

      {runtime.lives !== null && (
        <div className="wt-hud__lives" title="剩余生命">
          <span className="wt-hud__lives-label">生命</span>
          <span className="wt-hud__lives-dots" aria-hidden="true">
            {Array.from({ length: config.lives ?? 0 }).map((_, i) => (
              <span
                key={i}
                className={`wt-hud__life${i < (runtime.lives ?? 0) ? '' : ' wt-hud__life--lost'}`}
              />
            ))}
          </span>
          <span className="wt-hud__lives-value">{runtime.lives}</span>
        </div>
      )}

      <div className="wt-hud__score">
        <span className="wt-hud__score-label">{mode === 'sprint' ? '字数' : '正确'}</span>
        <span className="wt-hud__score-value">{score}</span>
      </div>

      <div className="wt-hud__combo">
        <span className="wt-hud__combo-label">连击</span>
        <span className={`wt-hud__combo-value${session.combo >= 5 ? ' wt-hud__combo-value--hot' : ''}`}>
          {session.combo}
        </span>
        <span className="wt-hud__combo-best">最高 {session.maxCombo}</span>
      </div>

      <div className="wt-hud__progress">
        <span className="wt-hud__progress-label">进度</span>
        <span className="wt-hud__progress-value">
          {session.completedCount}
          {config.questionCount ? ` / ${config.questionCount}` : ''}
        </span>
      </div>
    </div>
  );
};

export default ChallengeHud;
