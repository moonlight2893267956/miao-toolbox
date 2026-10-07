import { describe, it, expect } from 'vitest';
import {
  toDateKey,
  todayKey,
  isSameDayTimestamp,
  addDays,
  diffDays,
  dailySpeed,
  dailyAccuracy,
  metricValue,
  buildTrendSeries,
  seriesMax,
  seriesAverage,
  computeStreak,
  computeTotals,
  formatDuration,
  formatCompact,
  formatShortDate,
} from './statsAggregation';
import type { DailyStat } from './storage';

const TODAY = '2026-09-16';

/** 由日期键构造「本地正午」时间戳：任何时区下都稳定落在该本地日 */
function localNoon(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
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

// ─── 日期工具 ────────────────────────────────────────────

describe('日期工具', () => {
  it('toDateKey 输出 YYYY-MM-DD（补零）', () => {
    expect(toDateKey(new Date(2026, 8, 6, 12, 34, 56))).toBe('2026-09-06');
  });

  /*
   * 时区回归：曾用 toISOString() 取 UTC 日期，导致 UTC+8 用户在
   * 本地 00:00~07:59 练习被记入前一天（今日用时为空 / Streak 少一天）。
   */
  it('toDateKey 使用本地时区，凌晨仍属当天', () => {
    expect(toDateKey(new Date(2026, 8, 16, 0, 30, 0))).toBe('2026-09-16');
    expect(toDateKey(new Date(2026, 8, 16, 23, 30, 0))).toBe('2026-09-16');
  });

  it('todayKey 与本地日期一致（凌晨不偏移）', () => {
    expect(todayKey(new Date(2026, 8, 16, 1, 15, 0).getTime())).toBe('2026-09-16');
  });

  it('isSameDayTimestamp 凌晨时间戳归入当天', () => {
    expect(isSameDayTimestamp(localNoon(TODAY), TODAY)).toBe(true);
    expect(isSameDayTimestamp(new Date(2026, 8, 16, 0, 30, 0).getTime(), TODAY)).toBe(true);
    expect(isSameDayTimestamp(new Date(2026, 8, 15, 23, 30, 0).getTime(), TODAY)).toBe(false);
  });

  it('isSameDayTimestamp 对非法时间戳返回 false', () => {
    expect(isSameDayTimestamp(0, TODAY)).toBe(false);
    expect(isSameDayTimestamp(Number.NaN, TODAY)).toBe(false);
  });


  it('addDays 正向跨月', () => {
    expect(addDays('2026-09-28', 5)).toBe('2026-10-03');
  });

  it('addDays 负向跨月', () => {
    expect(addDays('2026-10-03', -5)).toBe('2026-09-28');
  });

  it('addDays 跨年', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('diffDays 计算间隔', () => {
    expect(diffDays('2026-09-16', '2026-09-10')).toBe(6);
    expect(diffDays('2026-09-10', '2026-09-16')).toBe(-6);
    expect(diffDays('2026-09-16', '2026-09-16')).toBe(0);
  });

  it('diffDays 跨月正确', () => {
    expect(diffDays('2026-10-03', '2026-09-28')).toBe(5);
  });
});

// ─── 单日指标 ────────────────────────────────────────────

describe('dailySpeed', () => {
  it('按 正确字数 / 时长 折算每分钟', () => {
    // 60 字 / 60 秒 → 60 字/分
    expect(dailySpeed(makeStat(TODAY, { correctChars: 60, practiceTimeSec: 60 }))).toBe(60);
  });

  it('时长为 0 返回 0（不产生 Infinity）', () => {
    expect(dailySpeed(makeStat(TODAY, { practiceTimeSec: 0 }))).toBe(0);
  });
});

describe('dailyAccuracy', () => {
  it('计算准确率', () => {
    expect(dailyAccuracy(makeStat(TODAY, { totalKeystrokes: 100, errorKeystrokes: 25 }))).toBe(0.75);
  });

  it('无击键返回 0', () => {
    expect(dailyAccuracy(makeStat(TODAY, { totalKeystrokes: 0 }))).toBe(0);
  });
});

describe('metricValue', () => {
  it('time 返回整数秒', () => {
    expect(metricValue(makeStat(TODAY, { practiceTimeSec: 90.6 }), 'time')).toBe(91);
  });

  it('speed 保留一位小数', () => {
    expect(metricValue(makeStat(TODAY, { correctChars: 37, practiceTimeSec: 60 }), 'speed')).toBe(37);
  });

  it('accuracy 转百分比并保留一位小数', () => {
    expect(metricValue(makeStat(TODAY, { totalKeystrokes: 80, errorKeystrokes: 5 }), 'accuracy')).toBe(93.8);
  });
});

// ─── 趋势序列 ────────────────────────────────────────────

describe('buildTrendSeries', () => {
  it('长度等于 days', () => {
    const series = buildTrendSeries([], 14, 'time', TODAY);
    expect(series).toHaveLength(14);
  });

  it('缺日补零且标记 hasData=false', () => {
    const series = buildTrendSeries([makeStat(TODAY)], 3, 'time', TODAY);

    expect(series.map((p) => p.date)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);
    expect(series.map((p) => p.hasData)).toEqual([false, false, true]);
    expect(series.map((p) => p.value)).toEqual([0, 0, 60]);
  });

  it('乱序输入也能正确对齐', () => {
    const stats = [
      makeStat('2026-09-14', { practiceTimeSec: 10 }),
      makeStat('2026-09-16', { practiceTimeSec: 30 }),
      makeStat('2026-09-15', { practiceTimeSec: 20 }),
    ];
    const series = buildTrendSeries(stats, 3, 'time', TODAY);

    expect(series.map((p) => p.value)).toEqual([10, 20, 30]);
  });

  it('窗口外的数据被排除', () => {
    const stats = [makeStat('2026-09-01', { practiceTimeSec: 999 }), makeStat(TODAY)];
    const series = buildTrendSeries(stats, 3, 'time', TODAY);

    expect(series.every((p) => p.value <= 60)).toBe(true);
  });

  it('speed 指标生效', () => {
    const stats = [makeStat(TODAY, { correctChars: 120, practiceTimeSec: 60 })];
    const series = buildTrendSeries(stats, 1, 'speed', TODAY);

    expect(series[0].value).toBe(120);
  });

  it('days <= 0 返回空数组', () => {
    expect(buildTrendSeries([], 0, 'time', TODAY)).toEqual([]);
  });

  it('忽略缺少 date 的脏数据', () => {
    const stats = [{ date: '', totalKeystrokes: 1 } as DailyStat, makeStat(TODAY)];
    const series = buildTrendSeries(stats, 1, 'time', TODAY);

    expect(series).toHaveLength(1);
    expect(series[0].hasData).toBe(true);
  });
});

describe('seriesMax / seriesAverage', () => {
  it('seriesMax 取最大值', () => {
    const series = buildTrendSeries(
      [makeStat('2026-09-14', { practiceTimeSec: 10 }), makeStat(TODAY, { practiceTimeSec: 50 })],
      3, 'time', TODAY,
    );
    expect(seriesMax(series)).toBe(50);
  });

  it('seriesMax 全零返回 0', () => {
    expect(seriesMax(buildTrendSeries([], 3, 'time', TODAY))).toBe(0);
  });

  it('seriesAverage 只统计有数据的天', () => {
    const series = buildTrendSeries(
      [makeStat('2026-09-14', { practiceTimeSec: 10 }), makeStat(TODAY, { practiceTimeSec: 30 })],
      10, 'time', TODAY,
    );
    // 有数据的只有 2 天 → (10 + 30) / 2 = 20，而非 /10
    expect(seriesAverage(series)).toBe(20);
  });

  it('seriesAverage 无数据返回 0', () => {
    expect(seriesAverage(buildTrendSeries([], 5, 'time', TODAY))).toBe(0);
  });
});

// ─── Streak ──────────────────────────────────────────────

describe('computeStreak', () => {
  it('空数据返回全 0', () => {
    expect(computeStreak([], TODAY)).toEqual({ current: 0, longest: 0, activeToday: false });
  });

  it('今天已练：连续 3 天', () => {
    const stats = [makeStat('2026-09-14'), makeStat('2026-09-15'), makeStat(TODAY)];
    const s = computeStreak(stats, TODAY);

    expect(s.current).toBe(3);
    expect(s.activeToday).toBe(true);
  });

  it('今天未练但从昨天连续：不清零', () => {
    const stats = [makeStat('2026-09-13'), makeStat('2026-09-14'), makeStat('2026-09-15')];
    const s = computeStreak(stats, TODAY);

    expect(s.current).toBe(3);
    expect(s.activeToday).toBe(false);
  });

  it('中断后只计最近一段', () => {
    const stats = [
      makeStat('2026-09-10'),
      makeStat('2026-09-11'),
      // 9-12 中断
      makeStat('2026-09-14'),
      makeStat('2026-09-15'),
      makeStat(TODAY),
    ];
    const s = computeStreak(stats, TODAY);

    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
  });

  it('longest 记录历史最长段', () => {
    const stats = [
      makeStat('2026-09-01'), makeStat('2026-09-02'),
      makeStat('2026-09-03'), makeStat('2026-09-04'), makeStat('2026-09-05'),
      // 中断
      makeStat('2026-09-15'), makeStat(TODAY),
    ];
    const s = computeStreak(stats, TODAY);

    expect(s.current).toBe(2);
    expect(s.longest).toBe(5);
  });

  it('只有击键没有会话也算练习日', () => {
    const stats = [makeStat('2026-09-15', { sessionsCompleted: 0, totalKeystrokes: 5 }), makeStat(TODAY, { sessionsCompleted: 0, totalKeystrokes: 5 })];
    expect(computeStreak(stats, TODAY).current).toBe(2);
  });

  it('完全无活动的记录不计入', () => {
    const stats = [makeStat(TODAY, { sessionsCompleted: 0, totalKeystrokes: 0 })];
    expect(computeStreak(stats, TODAY).current).toBe(0);
  });

  it('隔了两天以上则 current 为 0', () => {
    const stats = [makeStat('2026-09-10')];
    expect(computeStreak(stats, TODAY).current).toBe(0);
  });
});

// ─── 累计 ────────────────────────────────────────────────

describe('computeTotals', () => {
  it('累加各项数值', () => {
    const stats = [
      makeStat('2026-09-15', { correctChars: 30, totalKeystrokes: 40, errorKeystrokes: 4, practiceTimeSec: 30 }),
      makeStat(TODAY, { correctChars: 50, totalKeystrokes: 60, errorKeystrokes: 6, practiceTimeSec: 90 }),
    ];
    const totals = computeTotals(stats);

    expect(totals.totalChars).toBe(80);
    expect(totals.totalKeystrokes).toBe(100);
    expect(totals.totalErrorKeystrokes).toBe(10);
    expect(totals.totalTimeSec).toBe(120);
    expect(totals.totalSessions).toBe(2);
    expect(totals.practiceDays).toBe(2);
  });

  it('空数组返回全 0', () => {
    const totals = computeTotals([]);
    expect(totals.totalChars).toBe(0);
    expect(totals.practiceDays).toBe(0);
    expect(totals.bestDaySpeed).toBe(0);
    expect(totals.bestDayAccuracy).toBe(0);
  });

  it('bestDayAccuracy 忽略击键过少的天（防刷分）', () => {
    const stats = [
      // 3 次击键 100% 正确 → 应被忽略
      makeStat(TODAY, { totalKeystrokes: 3, errorKeystrokes: 0 }),
    ];
    expect(computeTotals(stats).bestDayAccuracy).toBe(0);
  });

  it('bestDaySpeed 取单日最优', () => {
    const stats = [
      makeStat('2026-09-15', { correctChars: 30, practiceTimeSec: 60, totalKeystrokes: 40 }),
      makeStat(TODAY, { correctChars: 90, practiceTimeSec: 60, totalKeystrokes: 100 }),
    ];
    expect(computeTotals(stats).bestDaySpeed).toBe(90);
  });

  it('practiceDays 只计有活动的天', () => {
    const stats = [
      makeStat(TODAY, { sessionsCompleted: 0, totalKeystrokes: 0 }),
      makeStat('2026-09-15'),
    ];
    expect(computeTotals(stats).practiceDays).toBe(1);
  });
});

// ─── 展示辅助 ────────────────────────────────────────────

describe('formatDuration', () => {
  it('小于 1 分钟显示秒', () => {
    expect(formatDuration(45)).toBe('45 秒');
  });

  it('小于 1 小时显示分', () => {
    expect(formatDuration(600)).toBe('10 分');
  });

  it('超过 1 小时显示时分', () => {
    expect(formatDuration(3900)).toBe('1 小时 5 分');
  });

  it('整小时不显示 0 分', () => {
    expect(formatDuration(7200)).toBe('2 小时');
  });

  it('负数归零', () => {
    expect(formatDuration(-10)).toBe('0 秒');
  });
});

describe('formatCompact', () => {
  it('小于 1000 原样', () => {
    expect(formatCompact(999)).toBe('999');
  });

  it('千位保留一位小数', () => {
    expect(formatCompact(1234)).toBe('1.2k');
  });

  it('万位取整', () => {
    expect(formatCompact(12345)).toBe('12k');
  });
});

describe('formatShortDate', () => {
  it('输出 M/D 且去掉前导零', () => {
    expect(formatShortDate('2026-09-06')).toBe('9/6');
  });
});
