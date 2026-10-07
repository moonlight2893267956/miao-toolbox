import { describe, it, expect } from 'vitest';
import {
  buildAchievementContext,
  countPassedLessons,
  countReviewItems,
  bestSpeedAcrossModes,
  bestComboAcrossModes,
  bestAccuracyAcrossModes,
} from './achievementContext';
import { INITIAL_COURSE_PROGRESS } from './course';
import { normalizeProgress, type DailyStat, type ProgressData, type ReviewItem } from './storage';
import type { ModeRecords } from './sessionStats';

const TODAY = '2026-09-16';

function makeProgress(overrides: Partial<ProgressData> = {}): ProgressData {
  return {
    ...normalizeProgress(null),
    ...overrides,
  };
}

function makeStat(date: string, overrides: Partial<DailyStat> = {}): DailyStat {
  return {
    date,
    totalKeystrokes: 100,
    errorKeystrokes: 10,
    correctChars: 20,
    sessionsCompleted: 1,
    practiceTimeSec: 60,
    ...overrides,
  };
}

function makeReview(char: string): ReviewItem {
  return { char, wrongCount: 1, lastSeen: 0, nextReview: 0, source: 'auto' };
}

function makeRecords(entries: Record<string, { speed: number; combo: number; accuracy: number }>): ModeRecords {
  const base = {
    totalQuestions: 20, correctQuestions: 18, correctChars: 18,
    totalKeystrokes: 80, errorKeystrokes: 6,
    validKeystrokeRate: 0.9, durationSec: 30, at: 0,
  };
  return Object.fromEntries(
    Object.entries(entries).map(([key, v]) => [
      key,
      {
        last: { ...base, speedPerMinute: v.speed, maxCombo: v.combo, accuracy: v.accuracy },
        best: { ...base, speedPerMinute: v.speed, maxCombo: v.combo, accuracy: v.accuracy },
        sessions: 1,
      },
    ]),
  );
}

// ─── 派生辅助 ────────────────────────────────────────────

describe('countPassedLessons', () => {
  it('空进度返回 0', () => {
    expect(countPassedLessons(makeProgress())).toBe(0);
  });

  it('只统计 passed=true 的关卡', () => {
    const progress = makeProgress({
      course: {
        freeMode: false,
        lessons: {
          a: { lessonId: 'a', passed: true, bestAccuracy: 1, bestCharCount: 20, bestSpeed: 30, attempts: 1, updatedAt: 0 },
          b: { lessonId: 'b', passed: false, bestAccuracy: 0.5, bestCharCount: 5, bestSpeed: 10, attempts: 2, updatedAt: 0 },
          c: { lessonId: 'c', passed: true, bestAccuracy: 1, bestCharCount: 30, bestSpeed: 40, attempts: 1, updatedAt: 0 },
        },
      },
    });

    expect(countPassedLessons(progress)).toBe(2);
  });

  it('course 缺字段时不抛错（旧数据兜底）', () => {
    const broken = { ...makeProgress(), course: undefined } as unknown as ProgressData;
    expect(countPassedLessons(broken)).toBe(0);
  });
});

describe('countReviewItems', () => {
  it('统计有效条目', () => {
    expect(countReviewItems([makeReview('啊'), makeReview('的')])).toBe(2);
  });

  it('过滤缺少 char 的脏数据', () => {
    const broken = [{ char: '' }, { char: '啊' }] as ReviewItem[];
    expect(countReviewItems(broken)).toBe(1);
  });

  it('空数组返回 0', () => {
    expect(countReviewItems([])).toBe(0);
  });
});

describe('跨模式最优取值', () => {
  it('bestSpeedAcrossModes 取最大速度', () => {
    const records = makeRecords({ a: { speed: 30, combo: 10, accuracy: 0.8 }, b: { speed: 75, combo: 20, accuracy: 0.9 } });
    expect(bestSpeedAcrossModes(records)).toBe(75);
  });

  it('bestComboAcrossModes 取最大连击', () => {
    const records = makeRecords({ a: { speed: 30, combo: 10, accuracy: 0.8 }, b: { speed: 75, combo: 130, accuracy: 0.9 } });
    expect(bestComboAcrossModes(records)).toBe(130);
  });

  it('bestAccuracyAcrossModes 取最高准确率', () => {
    const records = makeRecords({ a: { speed: 30, combo: 10, accuracy: 0.8 }, b: { speed: 75, combo: 20, accuracy: 0.995 } });
    expect(bestAccuracyAcrossModes(records)).toBeCloseTo(0.995, 6);
  });

  it('空记录返回 0', () => {
    expect(bestSpeedAcrossModes({})).toBe(0);
    expect(bestComboAcrossModes({})).toBe(0);
    expect(bestAccuracyAcrossModes({})).toBe(0);
  });

  it('忽略结构不完整的记录', () => {
    const broken = { x: undefined as never };
    expect(bestSpeedAcrossModes(broken)).toBe(0);
  });
});

// ─── 主函数 ──────────────────────────────────────────────

describe('buildAchievementContext', () => {
  it('空数据返回全零上下文', () => {
    const ctx = buildAchievementContext({
      stats: [],
      progress: makeProgress(),
      review: [],
      today: TODAY,
    });

    expect(ctx.totals.totalChars).toBe(0);
    expect(ctx.streak.current).toBe(0);
    expect(ctx.reviewTotal).toBe(0);
    expect(ctx.passedLessons).toBe(0);
    expect(ctx.bestSpeed).toBe(0);
    expect(ctx.maxCombo).toBe(0);
  });

  it('聚合三个分区的数据', () => {
    const ctx = buildAchievementContext({
      stats: [makeStat(TODAY, { correctChars: 50 }), makeStat('2026-09-15', { correctChars: 30 })],
      progress: makeProgress({
        course: {
          freeMode: false,
          lessons: {
            a: { lessonId: 'a', passed: true, bestAccuracy: 1, bestCharCount: 20, bestSpeed: 30, attempts: 1, updatedAt: 0 },
          },
        },
        modeRecords: makeRecords({ 'char-code': { speed: 88, combo: 45, accuracy: 0.97 } }),
      }),
      review: [makeReview('啊')],
      today: TODAY,
    });

    expect(ctx.totals.totalChars).toBe(80);
    expect(ctx.streak.current).toBe(2);
    expect(ctx.passedLessons).toBe(1);
    expect(ctx.reviewTotal).toBe(1);
    expect(ctx.maxCombo).toBe(45);
  });

  it('速度取「模式最优」与「单日最优」的较大者', () => {
    // 单日 60 字/分（40 字 / 40 秒 = 60），模式最优 88 → 取 88
    const ctx = buildAchievementContext({
      stats: [makeStat(TODAY, { correctChars: 40, practiceTimeSec: 40, totalKeystrokes: 100 })],
      progress: makeProgress({ modeRecords: makeRecords({ a: { speed: 88, combo: 0, accuracy: 0.9 } }) }),
      review: [],
      today: TODAY,
    });

    expect(ctx.bestSpeed).toBe(88);
  });

  it('模式数据缺失时回退到单日最优', () => {
    // 40 字 / 40 秒 = 60 字/分
    const ctx = buildAchievementContext({
      stats: [makeStat(TODAY, { correctChars: 40, practiceTimeSec: 40, totalKeystrokes: 100 })],
      progress: makeProgress(),
      review: [],
      today: TODAY,
    });

    expect(ctx.bestSpeed).toBe(60);
  });

  it('未传 today 时回落到系统当天（不抛错）', () => {
    expect(() => buildAchievementContext({
      stats: [],
      progress: makeProgress(),
      review: [],
    })).not.toThrow();
  });

  it('progress 为默认初始课程进度时不抛错', () => {
    const progress = makeProgress({ course: INITIAL_COURSE_PROGRESS });
    expect(() => buildAchievementContext({ stats: [], progress, review: [], today: TODAY })).not.toThrow();
  });
});
