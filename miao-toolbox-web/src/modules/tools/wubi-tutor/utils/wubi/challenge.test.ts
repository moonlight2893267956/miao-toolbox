import { describe, it, expect } from 'vitest';
import {
  CHALLENGE_CONFIGS,
  CHALLENGE_ORDER,
  DAILY_QUESTION_COUNT,
  SPRINT_SECONDS,
  SURVIVAL_LIVES,
  computeChallengeScore,
  isBetterChallengeResult,
  toChallengeResult,
  toSubmitPayload,
  challengeProgressLabel,
  type ChallengeMode,
  type ChallengeStats,
} from './challenge';

/** 造一份统计量（默认 40 字 / 12 题 / 90% / 60s / 连击 20） */
function stats(overrides: Partial<ChallengeStats> = {}): ChallengeStats {
  return {
    correctChars: 40,
    correctQuestions: 12,
    totalQuestions: 14,
    accuracy: 0.9,
    durationSec: 60,
    maxCombo: 20,
    ...overrides,
  };
}

describe('挑战规则常量', () => {
  it('三种模式的时长 / 命数 / 题量与设计一致', () => {
    expect(CHALLENGE_CONFIGS.sprint.timeLimitSec).toBe(SPRINT_SECONDS);
    expect(CHALLENGE_CONFIGS.sprint.lives).toBeNull();
    expect(CHALLENGE_CONFIGS.survival.lives).toBe(SURVIVAL_LIVES);
    expect(CHALLENGE_CONFIGS.survival.timeLimitSec).toBeNull();
    expect(CHALLENGE_CONFIGS.daily.questionCount).toBe(DAILY_QUESTION_COUNT);
    expect(CHALLENGE_CONFIGS.daily.timeLimitSec).toBeNull();
  });

  it('模式顺序与后端「我的挑战」返回顺序一致', () => {
    expect(CHALLENGE_ORDER).toEqual(['sprint', 'survival', 'daily']);
    expect(CHALLENGE_CONFIGS.sprint.mode).toBe('sprint');
  });
});

describe('computeChallengeScore', () => {
  it('限时冲刺按「正确字数」计分', () => {
    expect(computeChallengeScore('sprint', stats({ correctChars: 55, correctQuestions: 9 }))).toBe(55);
  });

  it('生存与每日挑战按「正确题数」计分', () => {
    expect(computeChallengeScore('survival', stats({ correctChars: 55, correctQuestions: 9 }))).toBe(9);
    expect(computeChallengeScore('daily', stats({ correctChars: 55, correctQuestions: 9 }))).toBe(9);
  });

  it('负数被夹到 0，小数向下取整（榜单不允许出现负分或小数分）', () => {
    expect(computeChallengeScore('sprint', stats({ correctChars: -3 }))).toBe(0);
    expect(computeChallengeScore('survival', stats({ correctQuestions: 7.9 }))).toBe(7);
  });

  it('未答对任何题的边界：0 分而不是异常', () => {
    expect(computeChallengeScore('daily', stats({ correctChars: 0, correctQuestions: 0 }))).toBe(0);
  });
});

describe('toChallengeResult', () => {
  it('分数由口径函数算出，不接受调用方手工传入', () => {
    const result = toChallengeResult('sprint' as ChallengeMode, stats({ correctChars: 72 }), '2026-10-09');

    expect(result.mode).toBe('sprint');
    expect(result.score).toBe(72);
    expect(result.statDate).toBe('2026-10-09');
    expect(result.accuracy).toBeCloseTo(0.9);
  });
});

describe('isBetterChallengeResult', () => {
  const base = { score: 100, accuracy: 0.95, durationSec: 60 };

  it('分数高者更优', () => {
    expect(isBetterChallengeResult({ ...base, score: 120 }, base)).toBe(true);
    expect(isBetterChallengeResult({ ...base, score: 90 }, base)).toBe(false);
  });

  it('同分比准确率', () => {
    expect(isBetterChallengeResult({ ...base, accuracy: 0.99 }, base)).toBe(true);
    expect(isBetterChallengeResult({ ...base, accuracy: 0.9 }, base)).toBe(false);
  });

  it('同分同准确率比用时（更短者更优）', () => {
    expect(isBetterChallengeResult({ ...base, durationSec: 45 }, base)).toBe(true);
    expect(isBetterChallengeResult({ ...base, durationSec: 80 }, base)).toBe(false);
  });

  it('完全相同不算「更优」（避免反复提示刷新纪录）', () => {
    expect(isBetterChallengeResult(base, { ...base })).toBe(false);
  });
});

describe('toSubmitPayload', () => {
  it('准确率转成整数百分数，其余字段原样上报', () => {
    const result = toChallengeResult('survival', stats({
      correctQuestions: 11,
      accuracy: 0.876,
      durationSec: 95.4,
      maxCombo: 7,
    }), '2026-10-09');

    expect(toSubmitPayload(result)).toEqual({
      mode: 'survival',
      score: 11,
      correctChars: 40,
      accuracyPercent: 88,
      durationSec: 95,
      maxCombo: 7,
      statDate: '2026-10-09',
    });
  });
});

describe('challengeProgressLabel', () => {
  it('冲刺显示剩余秒数（向上取整，不显示 0.4s 这种噪声）', () => {
    expect(challengeProgressLabel('sprint', { remainingSec: 12.4, lives: null, answered: 3 }))
      .toBe('剩余 13s');
  });

  it('冲刺剩余为负时显示 0 而不是负数', () => {
    expect(challengeProgressLabel('sprint', { remainingSec: -1, lives: null, answered: 3 }))
      .toBe('剩余 0s');
  });

  it('生存显示剩余命数', () => {
    expect(challengeProgressLabel('survival', { remainingSec: null, lives: 2, answered: 5 }))
      .toBe('生命 2');
  });

  it('每日显示题进度（满分来自配置）', () => {
    expect(challengeProgressLabel('daily', { remainingSec: null, lives: null, answered: 4 }))
      .toBe(`4 / ${DAILY_QUESTION_COUNT}`);
  });
});
