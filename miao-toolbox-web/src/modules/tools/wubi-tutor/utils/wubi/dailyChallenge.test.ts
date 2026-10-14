import { describe, it, expect } from 'vitest';
import {
  dailySeed,
  normalizeCompletedDates,
  isDailyCompleted,
  challengeStreak,
  recentDays,
} from './dailyChallenge';

describe('dailySeed', () => {
  it('同一天永远得到同一个种子（跨设备/刷新题组一致的前提）', () => {
    expect(dailySeed('2026-10-09')).toBe(dailySeed('2026-10-09'));
  });

  it('不同日期得到不同种子', () => {
    const seeds = new Set([
      dailySeed('2026-10-09'),
      dailySeed('2026-10-10'),
      dailySeed('2026-10-11'),
      dailySeed('2027-10-09'),
    ]);

    expect(seeds.size).toBe(4);
  });

  it('结果是 32 位无符号整数（题源会把种子做位运算）', () => {
    const seed = dailySeed('2026-10-09');

    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });

  it('相邻日期的种子差异很大（避免只改一位日期就抽到相近题序）', () => {
    const a = dailySeed('2026-10-09');
    const b = dailySeed('2026-10-10');

    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });
});

describe('normalizeCompletedDates', () => {
  it('去重并升序排序', () => {
    expect(normalizeCompletedDates(['2026-10-09', '2026-10-07', '2026-10-09']))
      .toEqual(['2026-10-07', '2026-10-09']);
  });

  it('过滤掉非法日期（本地存档可能被手改或来自旧版本）', () => {
    expect(normalizeCompletedDates(['2026-10-09', '', '2026/10/09', 'not-a-date', '2026-13-99']))
      .toEqual(['2026-10-09']);
  });
});

describe('isDailyCompleted', () => {
  it('命中即为已完成', () => {
    expect(isDailyCompleted(['2026-10-09'], '2026-10-09')).toBe(true);
    expect(isDailyCompleted(['2026-10-08'], '2026-10-09')).toBe(false);
    expect(isDailyCompleted([], '2026-10-09')).toBe(false);
  });
});

describe('challengeStreak', () => {
  it('没有任何记录时为 0', () => {
    expect(challengeStreak([], '2026-10-09')).toBe(0);
  });

  it('今天已完成：从今天往前数', () => {
    const dates = ['2026-10-09', '2026-10-08', '2026-10-07'];

    expect(challengeStreak(dates, '2026-10-09')).toBe(3);
  });

  it('今天还没打但昨天打了：连续天数不归零（否则零点会先掉一天再补回来）', () => {
    const dates = ['2026-10-08', '2026-10-07'];

    expect(challengeStreak(dates, '2026-10-09')).toBe(2);
  });

  it('断签只算最近那一段连续天数', () => {
    const dates = ['2026-10-09', '2026-10-08', '2026-10-05', '2026-10-04'];

    expect(challengeStreak(dates, '2026-10-09')).toBe(2);
  });

  it('跨月连续正确（2026-02 只有 28 天）', () => {
    const dates = ['2026-03-02', '2026-03-01', '2026-02-28', '2026-02-27'];

    expect(challengeStreak(dates, '2026-03-02')).toBe(4);
  });

  it('只打了今天、前一天没打 → 1', () => {
    expect(challengeStreak(['2026-10-09'], '2026-10-09')).toBe(1);
  });

  it('重复日期不会把连续天数算多', () => {
    const dates = ['2026-10-09', '2026-10-09', '2026-10-08'];

    expect(challengeStreak(dates, '2026-10-09')).toBe(2);
  });
});

describe('recentDays', () => {
  it('返回含今天的最近 n 天，升序排列', () => {
    expect(recentDays(3, '2026-10-09')).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
  });

  it('n=7 时长度为 7 且最后一个是今天', () => {
    const days = recentDays(7, '2026-10-09');

    expect(days).toHaveLength(7);
    expect(days[days.length - 1]).toBe('2026-10-09');
  });
});
