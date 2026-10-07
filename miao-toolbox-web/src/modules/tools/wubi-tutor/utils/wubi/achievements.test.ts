import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENTS,
  TOTAL_ACHIEVEMENTS,
  GROUP_LABELS,
  getEligibleAchievements,
  evaluateAchievements,
  mergeUnlocked,
  getAchievementProgress,
  getNextMilestones,
  groupUnlocked,
  type AchievementContext,
  type AchievementGroup,
} from './achievements';
import type { Totals, StreakInfo } from './statsAggregation';

function makeTotals(overrides: Partial<Totals> = {}): Totals {
  return {
    practiceDays: 0,
    totalChars: 0,
    totalKeystrokes: 0,
    totalErrorKeystrokes: 0,
    totalTimeSec: 0,
    totalSessions: 0,
    bestDaySpeed: 0,
    bestDayAccuracy: 0,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    totals: makeTotals(),
    streak: { current: 0, longest: 0, activeToday: false } as StreakInfo,
    reviewTotal: 0,
    passedLessons: 0,
    bestSpeed: 0,
    bestAccuracy: 0,
    maxCombo: 0,
    ...overrides,
  };
}

// ─── 清单完整性 ──────────────────────────────────────────

describe('ACHIEVEMENTS 清单', () => {
  it('至少 10 项（Story 4.4 要求）', () => {
    expect(TOTAL_ACHIEVEMENTS).toBeGreaterThanOrEqual(10);
  });

  it('id 唯一', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每项都有非空标题、描述与徽标', () => {
    for (const def of ACHIEVEMENTS) {
      expect(def.title.length).toBeGreaterThan(0);
      expect(def.desc.length).toBeGreaterThan(0);
      expect(def.badge.length).toBeGreaterThan(0);
      expect(def.target).toBeGreaterThan(0);
    }
  });

  it('group 均为已定义分组', () => {
    const groups = new Set(Object.keys(GROUP_LABELS));
    for (const def of ACHIEVEMENTS) {
      expect(groups.has(def.group)).toBe(true);
    }
  });

  it('measure 对空上下文不抛错', () => {
    const ctx = makeCtx();
    for (const def of ACHIEVEMENTS) {
      expect(() => def.measure(ctx)).not.toThrow();
    }
  });
});

// ─── 达标判定边界 ────────────────────────────────────────

describe('getEligibleAchievements', () => {
  it('空上下文不应解锁任何成就（含 review-clear 防白拿）', () => {
    expect(getEligibleAchievements(makeCtx())).toEqual([]);
  });

  it('字数阈值：9 不达标 / 10 达标', () => {
    expect(getEligibleAchievements(makeCtx({ totals: makeTotals({ totalChars: 9 }) })))
      .not.toContain('chars-10');
    expect(getEligibleAchievements(makeCtx({ totals: makeTotals({ totalChars: 10 }) })))
      .toContain('chars-10');
  });

  it('速度阈值：59.9 不达标 / 60 达标', () => {
    expect(getEligibleAchievements(makeCtx({ bestSpeed: 59.9 }))).not.toContain('speed-60');
    expect(getEligibleAchievements(makeCtx({ bestSpeed: 60 }))).toContain('speed-60');
  });

  it('准确率 0.99 → 99% 达标', () => {
    expect(getEligibleAchievements(makeCtx({ bestAccuracy: 0.99 }))).toContain('accuracy-99');
  });

  it('准确率 0.985 四舍五入到 98.5 不达标', () => {
    expect(getEligibleAchievements(makeCtx({ bestAccuracy: 0.985 }))).not.toContain('accuracy-99');
  });

  it('Streak 用 longest 判定（断掉后仍保留）', () => {
    const ctx = makeCtx({ streak: { current: 1, longest: 7, activeToday: true } });
    expect(getEligibleAchievements(ctx)).toContain('streak-7');
  });

  it('首区通关：4 不达标 / 5 达标', () => {
    expect(getEligibleAchievements(makeCtx({ passedLessons: 4 }))).not.toContain('first-zone');
    expect(getEligibleAchievements(makeCtx({ passedLessons: 5 }))).toContain('first-zone');
  });

  it('全键盘认知需要 25 关', () => {
    expect(getEligibleAchievements(makeCtx({ passedLessons: 25 }))).toContain('keys-all');
  });

  it('review-clear 需要同时满足 100 字与空错题本', () => {
    const notEnoughChars = makeCtx({ totals: makeTotals({ totalChars: 99 }), reviewTotal: 0 });
    const hasReview = makeCtx({ totals: makeTotals({ totalChars: 500 }), reviewTotal: 3 });
    const ok = makeCtx({ totals: makeTotals({ totalChars: 500 }), reviewTotal: 0 });

    expect(getEligibleAchievements(notEnoughChars)).not.toContain('review-clear');
    expect(getEligibleAchievements(hasReview)).not.toContain('review-clear');
    expect(getEligibleAchievements(ok)).toContain('review-clear');
  });

  it('累计时长 10 小时阈值', () => {
    expect(getEligibleAchievements(makeCtx({ totals: makeTotals({ totalTimeSec: 35999 }) })))
      .not.toContain('time-10h');
    expect(getEligibleAchievements(makeCtx({ totals: makeTotals({ totalTimeSec: 36000 }) })))
      .toContain('time-10h');
  });
});

// ─── 新解锁判定 ──────────────────────────────────────────

describe('evaluateAchievements', () => {
  it('已解锁的不再重复返回', () => {
    const ctx = makeCtx({ totals: makeTotals({ totalChars: 100 }) });
    const newly = evaluateAchievements(ctx, ['chars-10', 'chars-100']);

    expect(newly).not.toContain('chars-10');
    expect(newly).not.toContain('chars-100');
  });

  it('返回的是「本次新解锁」子集', () => {
    const ctx = makeCtx({ totals: makeTotals({ totalChars: 100 }) });
    const newly = evaluateAchievements(ctx, ['chars-10']);

    expect(newly).toContain('chars-100');
    expect(newly).not.toContain('chars-10');
  });

  it('超量时按分组权重截断到 limit', () => {
    const ctx = makeCtx({
      totals: makeTotals({ totalChars: 10000, totalSessions: 50, totalTimeSec: 40000 }),
      streak: { current: 30, longest: 30, activeToday: true },
      passedLessons: 25,
      bestSpeed: 100,
      bestAccuracy: 1,
      maxCombo: 200,
      reviewTotal: 0,
    });

    const newly = evaluateAchievements(ctx, [], 2);
    expect(newly).toHaveLength(2);
    // coverage 权重最高，应优先出现
    expect(newly).toContain('first-zone');
  });

  it('全部达标且全部已解锁时返回空', () => {
    const ctx = makeCtx({
      totals: makeTotals({ totalChars: 99999, totalSessions: 999, totalTimeSec: 999999 }),
      streak: { current: 99, longest: 99, activeToday: true },
      passedLessons: 25,
      bestSpeed: 999,
      bestAccuracy: 1,
      maxCombo: 999,
      reviewTotal: 0,
    });

    expect(evaluateAchievements(ctx, ACHIEVEMENTS.map((a) => a.id))).toEqual([]);
  });

  it('limit 为 0 时返回空', () => {
    const ctx = makeCtx({ totals: makeTotals({ totalChars: 10000 }) });
    expect(evaluateAchievements(ctx, [], 0)).toEqual([]);
  });
});

// ─── 合并 ────────────────────────────────────────────────

describe('mergeUnlocked', () => {
  it('去重合并', () => {
    expect(mergeUnlocked(['chars-10'], ['chars-10', 'chars-100']))
      .toEqual(['chars-10', 'chars-100']);
  });

  it('按声明顺序输出（保证成就墙排列稳定）', () => {
    const merged = mergeUnlocked([], ['chars-1000', 'chars-10', 'first-zone']);
    const order = ACHIEVEMENTS.map((a) => a.id).filter((id) => merged.includes(id));

    expect(merged).toEqual(order);
  });

  it('过滤掉未知 id', () => {
    expect(mergeUnlocked(['unknown-id'], ['chars-10'])).toEqual(['chars-10']);
  });

  it('空输入返回空数组', () => {
    expect(mergeUnlocked([], [])).toEqual([]);
  });
});

// ─── 进度 ────────────────────────────────────────────────

describe('getAchievementProgress', () => {
  const chars100 = ACHIEVEMENTS.find((a) => a.id === 'chars-100')!;

  it('按比例计算', () => {
    expect(getAchievementProgress(chars100, makeCtx({ totals: makeTotals({ totalChars: 50 }) })))
      .toBeCloseTo(0.5, 6);
  });

  it('超过目标钳制为 1', () => {
    expect(getAchievementProgress(chars100, makeCtx({ totals: makeTotals({ totalChars: 500 }) })))
      .toBe(1);
  });

  it('零进度', () => {
    expect(getAchievementProgress(chars100, makeCtx())).toBe(0);
  });
});

// ─── 里程碑 ──────────────────────────────────────────────

describe('getNextMilestones', () => {
  it('排除零进度项', () => {
    const hints = getNextMilestones(makeCtx(), []);
    expect(hints.every((h) => h.progress > 0)).toBe(true);
  });

  it('排除已达成项', () => {
    const ctx = makeCtx({ totals: makeTotals({ totalChars: 10 }) });
    const hints = getNextMilestones(ctx, []);
    expect(hints.map((h) => h.def.id)).not.toContain('chars-10');
  });

  it('排除已解锁项', () => {
    const ctx = makeCtx({ totals: makeTotals({ totalChars: 50 }) });
    const hints = getNextMilestones(ctx, ['chars-100']);
    expect(hints.map((h) => h.def.id)).not.toContain('chars-100');
  });

  it('按进度降序返回', () => {
    const ctx = makeCtx({ totals: makeTotals({ totalChars: 90 }) });
    const hints = getNextMilestones(ctx, [], 3);

    const progresses = hints.map((h) => h.progress);
    expect(progresses).toEqual([...progresses].sort((a, b) => b - a));
  });

  it('limit 生效', () => {
    const ctx = makeCtx({
      totals: makeTotals({ totalChars: 500, totalSessions: 10, totalTimeSec: 600 }),
    });
    expect(getNextMilestones(ctx, [], 2).length).toBeLessThanOrEqual(2);
  });

  it('携带 current / target 便于展示', () => {
    const ctx = makeCtx({ totals: makeTotals({ totalChars: 30 }) });
    const hint = getNextMilestones(ctx, []).find((h) => h.def.id === 'chars-100');

    expect(hint?.current).toBe(30);
    expect(hint?.target).toBe(100);
  });
});

// ─── 分组 ────────────────────────────────────────────────

describe('groupUnlocked', () => {
  it('按分组归集', () => {
    const grouped = groupUnlocked(['chars-10', 'speed-60', 'streak-3']);
    expect(grouped.volume).toEqual(['chars-10']);
    expect(grouped.speed).toEqual(['speed-60']);
    expect(grouped.streak).toEqual(['streak-3']);
  });

  it('所有分组键都存在（便于渲染）', () => {
    const grouped = groupUnlocked([]);
    const groups: AchievementGroup[] = ['volume', 'speed', 'accuracy', 'streak', 'coverage', 'review'];
    for (const g of groups) {
      expect(grouped[g]).toEqual([]);
    }
  });

  it('忽略未知 id', () => {
    expect(groupUnlocked(['nope']).volume).toEqual([]);
  });
});
