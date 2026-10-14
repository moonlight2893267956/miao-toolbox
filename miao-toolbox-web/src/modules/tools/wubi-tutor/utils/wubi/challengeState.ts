/**
 * 挑战运行时状态（纯函数）。
 *
 * 只承载**会话状态机没有**的那部分：剩余生命、已用时、以及「该结束了」的判定。
 * 题数 / 准确率 / 连击一律以 `SessionState` 为准，绝不在这里再存一份 ——
 * 两处计数必然漂移，而结算面板同时读两者。
 *
 * 三个终止条件：
 *   time    到点（限时冲刺）
 *   lives   命尽（生存挑战）
 *   cleared 题量打满（每日挑战）
 */

import type { ChallengeConfig } from './challenge';

export type ChallengeOverReason = 'time' | 'lives' | 'cleared';

export interface ChallengeRuntime {
  /** 剩余生命；非生存模式为 null */
  lives: number | null;
  /** 已用时（秒） */
  elapsedSec: number;
  /** 是否已结束 */
  over: boolean;
  /** 结束原因；未结束时为 null */
  overReason: ChallengeOverReason | null;
}

export function createChallengeRuntime(config: ChallengeConfig): ChallengeRuntime {
  return {
    lives: config.lives,
    elapsedSec: 0,
    over: false,
    overReason: null,
  };
}

/**
 * 推进用时，并在到达时长上限时结束。
 *
 * 已结束的运行时**原样返回**：计时器每 200ms 都会调一次，
 * 若允许重复结束，每 tick 都会产生一次「结束」事件 → 重复结算、重复上报。
 */
export function tickChallenge(
  runtime: ChallengeRuntime,
  config: ChallengeConfig,
  elapsedSec: number,
): ChallengeRuntime {
  if (runtime.over) return runtime;

  const next: ChallengeRuntime = { ...runtime, elapsedSec: Math.max(0, elapsedSec) };

  if (config.timeLimitSec !== null && next.elapsedSec >= config.timeLimitSec) {
    return { ...next, over: true, overReason: 'time' };
  }
  return next;
}

/**
 * 答错扣一条命；归零即结束。非生存模式（lives 为 null）无副作用。
 *
 * 不需要 config：「扣一条命、零则结束」这条规则与模式无关 ——
 * 传入 config 只会让人以为不同模式扣命数可能不同。
 */
export function loseLife(runtime: ChallengeRuntime): ChallengeRuntime {
  if (runtime.over || runtime.lives === null) return runtime;

  const lives = Math.max(0, runtime.lives - 1);
  if (lives <= 0) {
    return { ...runtime, lives: 0, over: true, overReason: 'lives' };
  }
  return { ...runtime, lives };
}

/** 题量打满（每日挑战）。其它模式题量无限，不会走到这里。 */
export function markCleared(runtime: ChallengeRuntime): ChallengeRuntime {
  if (runtime.over) return runtime;
  return { ...runtime, over: true, overReason: 'cleared' };
}

/** 剩余秒数；不限时模式返回 null（界面据此不渲染倒计时） */
export function remainingSeconds(
  runtime: ChallengeRuntime,
  config: ChallengeConfig,
): number | null {
  if (config.timeLimitSec === null) return null;
  return Math.max(0, config.timeLimitSec - runtime.elapsedSec);
}

/** 结束原因对应的中文说明（结算面板用） */
export const OVER_REASON_LABELS: Record<ChallengeOverReason, string> = {
  time: '时间到',
  lives: '生命耗尽',
  cleared: '题目全部完成',
};
