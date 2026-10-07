/**
 * 日统计聚合纯函数（Story 4.4）
 *
 * 职责：
 * - 趋势序列构建（缺日补零，保证横轴连续）
 * - 三种趋势视图（练习时长 / 平均速度 / 平均准确率）
 * - 坚持指标（连续练习天数、累计天数、累计字数）
 * - 累计总量（供成就判定复用）
 *
 * 日期一律使用**本地时区**的 `YYYY-MM-DD`（见 `toDateKey`），
 * 且全模块只有这一处实现 —— 混用 UTC / 本地时区会让「今日」「连续天数」
 * 在跨日边界（尤其 UTC+8 的凌晨）整体错位。
 */

import type { DailyStat } from './storage';
import type { KeyError } from './session';

// ─── 类型定义 ────────────────────────────────────────────

/** 趋势视图类型 */
export type TrendMetric = 'time' | 'speed' | 'accuracy';

export interface TrendPoint {
  /** YYYY-MM-DD */
  date: string;
  /** 该日的指标值（缺失日为 0） */
  value: number;
  /** 该日是否真的有练习记录 */
  hasData: boolean;
}

export interface StreakInfo {
  /** 当前连续练习天数 */
  current: number;
  /** 历史最长连续天数 */
  longest: number;
  /** 今天是否已练习 */
  activeToday: boolean;
}

export interface Totals {
  /** 累计练习天数（有记录的天数） */
  practiceDays: number;
  /** 累计正确字数 */
  totalChars: number;
  /** 累计击键数 */
  totalKeystrokes: number;
  /** 累计错误击键数 */
  totalErrorKeystrokes: number;
  /** 累计练习时长（秒） */
  totalTimeSec: number;
  /** 累计完成的会话数 */
  totalSessions: number;
  /** 历史最佳单日速度（字/分钟） */
  bestDaySpeed: number;
  /** 历史最佳单日准确率（0~1，仅统计有击键的天） */
  bestDayAccuracy: number;
}

// ─── 日期工具 ────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Date → **本地时区** `YYYY-MM-DD`。
 *
 * !! 不要改成 `toISOString().split('T')[0]` !!
 * 那是 UTC 日期，对 UTC+8 用户来说本地 00:00~07:59 会被记成「昨天」，
 * 直接导致「今日用时」为空、今日计划任务不勾选、Streak 少算一天。
 */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 今天的日期键（本地时区） */
export function todayKey(now: number = Date.now()): string {
  return toDateKey(new Date(now));
}

/**
 * 日期键 + n 天。
 *
 * !! 解析与格式化必须同为本地时区 !!
 * 曾写成「按 UTC 解析 + 按本地格式化」，在 UTC-7 这类负偏移时区
 * 会整体偏移一天（`addDays('2026-09-28', 5)` 得到 10-02 而非 10-03）。
 *
 * 用 `setDate` 做日历运算而不是 `+ n * 86400000`，
 * 这样跨夏令时切换日也不会偏移。
 */
export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const base = new Date(y, m - 1, d, 0, 0, 0, 0);
  base.setDate(base.getDate() + n);
  return toDateKey(base);
}

/**
 * 两个日期键相差的天数（a - b）。
 *
 * 两个操作数都按 UTC 零点解析，得到的是精确的整天差
 * （不受夏令时导致的 23/25 小时天影响），因此这里保持 UTC 解析。
 */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / DAY_MS);
}

/** 时间戳是否落在指定日期（与 toDateKey 同基准，本地时区） */
export function isSameDayTimestamp(ts: number, dateKey: string): boolean {
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return toDateKey(new Date(ts)) === dateKey;
}

// ─── 单日指标 ────────────────────────────────────────────

/** 单日速度（字/分钟） */
export function dailySpeed(stat: DailyStat): number {
  if (stat.practiceTimeSec <= 0) return 0;
  return (stat.correctChars / stat.practiceTimeSec) * 60;
}

/** 单日准确率（0~1） */
export function dailyAccuracy(stat: DailyStat): number {
  if (stat.totalKeystrokes <= 0) return 0;
  return (stat.totalKeystrokes - stat.errorKeystrokes) / stat.totalKeystrokes;
}

/** 按指标类型取单日值 */
export function metricValue(stat: DailyStat, metric: TrendMetric): number {
  switch (metric) {
    case 'time':
      return Math.round(stat.practiceTimeSec);
    case 'speed':
      return Math.round(dailySpeed(stat) * 10) / 10;
    case 'accuracy':
      return Math.round(dailyAccuracy(stat) * 1000) / 10;
    default:
      return 0;
  }
}

/** 指标单位 */
export const METRIC_UNIT: Record<TrendMetric, string> = {
  time: '秒',
  speed: '字/分',
  accuracy: '%',
};

/** 指标中文标签 */
export const METRIC_LABEL: Record<TrendMetric, string> = {
  time: '练习时长',
  speed: '平均速度',
  accuracy: '平均准确率',
};

// ─── 趋势序列 ────────────────────────────────────────────

/**
 * 构建趋势序列（**缺日补零**）。
 *
 * 返回长度为 days 的连续序列，最后一项为 endDate。
 * 无记录的日子 value = 0、hasData = false —— 图表需要连续横轴，
 * 直接画原始数据会把间隔数天误连成直线。
 *
 * @param stats 日统计（可乱序）
 * @param days 天数（14 或 30）
 * @param metric 指标
 * @param endDate 结束日期键（默认今天）
 */
export function buildTrendSeries(
  stats: DailyStat[],
  days: number,
  metric: TrendMetric,
  endDate: string = todayKey(),
): TrendPoint[] {
  if (days <= 0) return [];

  const byDate = new Map<string, DailyStat>();
  for (const s of stats) {
    if (s?.date) byDate.set(s.date, s);
  }

  const series: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const stat = byDate.get(date);
    series.push({
      date,
      value: stat ? metricValue(stat, metric) : 0,
      hasData: stat != null,
    });
  }

  return series;
}

/** 序列中的最大值（用于纵轴缩放；全 0 时返回 0） */
export function seriesMax(series: TrendPoint[]): number {
  return series.reduce((max, p) => (p.value > max ? p.value : max), 0);
}

/** 序列平均值（仅统计有数据的天，避免缺日拉低均值） */
export function seriesAverage(series: TrendPoint[]): number {
  const active = series.filter((p) => p.hasData);
  if (active.length === 0) return 0;
  return active.reduce((sum, p) => sum + p.value, 0) / active.length;
}

// ─── 坚持指标 ────────────────────────────────────────────

/**
 * 计算连续练习天数。
 *
 * 语义：从今天（或昨天，若今天尚未练习）往前数连续有练习记录的天数。
 * 「今天还没练」不应立刻把 Streak 清零 —— 否则用户早上打开页面会看到 0，
 * 产生错误的负反馈。
 */
export function computeStreak(stats: DailyStat[], today: string = todayKey()): StreakInfo {
  const activeDates = new Set(
    stats.filter((s) => s.sessionsCompleted > 0 || s.totalKeystrokes > 0).map((s) => s.date),
  );

  if (activeDates.size === 0) {
    return { current: 0, longest: 0, activeToday: false };
  }

  const activeToday = activeDates.has(today);

  // 当前 Streak：从今天起（若今天无记录则从昨天起）向前连续计数
  let cursor = activeToday ? today : addDays(today, -1);
  let current = 0;
  while (activeDates.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  // 历史最长：按日期升序扫描
  const sorted = Array.from(activeDates).sort();
  let longest = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || diffDays(sorted[i], sorted[i - 1]) === 1) {
      run++;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  return { current, longest, activeToday };
}

// ─── 累计总量 ────────────────────────────────────────────

/** 汇总累计指标 */
export function computeTotals(stats: DailyStat[]): Totals {
  let totalChars = 0;
  let totalKeystrokes = 0;
  let totalErrorKeystrokes = 0;
  let totalTimeSec = 0;
  let totalSessions = 0;
  let bestDaySpeed = 0;
  let bestDayAccuracy = 0;
  let practiceDays = 0;

  for (const s of stats) {
    if (!s?.date) continue;

    const hasActivity = s.sessionsCompleted > 0 || s.totalKeystrokes > 0;
    if (hasActivity) practiceDays++;

    totalChars += s.correctChars;
    totalKeystrokes += s.totalKeystrokes;
    totalErrorKeystrokes += s.errorKeystrokes;
    totalTimeSec += s.practiceTimeSec;
    totalSessions += s.sessionsCompleted;

    // 单日最佳仅统计「真的练了」且数据量足够的天，避免 1 次击键刷出 100% 准确率
    if (s.totalKeystrokes >= 20) {
      const speed = dailySpeed(s);
      const acc = dailyAccuracy(s);
      if (speed > bestDaySpeed) bestDaySpeed = speed;
      if (acc > bestDayAccuracy) bestDayAccuracy = acc;
    }
  }

  return {
    practiceDays,
    totalChars,
    totalKeystrokes,
    totalErrorKeystrokes,
    totalTimeSec,
    totalSessions,
    bestDaySpeed: Math.round(bestDaySpeed * 10) / 10,
    bestDayAccuracy,
  };
}

// ─── 展示辅助 ────────────────────────────────────────────

/** 秒 → 「N 小时 M 分」/「M 分」/「N 秒」 */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  if (sec < 60) return `${sec} 秒`;

  const minutes = Math.floor(sec / 60);
  if (minutes < 60) return `${minutes} 分`;

  const hours = Math.floor(minutes / 60);
  const restMin = minutes % 60;
  return restMin > 0 ? `${hours} 小时 ${restMin} 分` : `${hours} 小时`;
}

/** 大数字缩写：1234 → 1.2k */
export function formatCompact(value: number): string {
  if (value < 1000) return String(value);
  if (value < 10000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value / 1000)}k`;
}

/** 日期键 → 「M/D」 */
/**
 * 汇总最近 `days` 天的按键配对（含今天）。
 *
 * 用 `addDays(todayKey(), -(days - 1))` 算下界，而不是手写 24h 毫秒运算 ——
 * 后者在夏令时切换的那天会偏一天，而日期键本来就是「天」的语义。
 */
export function collectKeyErrors(
  stats: DailyStat[],
  days: number,
  today: string = todayKey(),
): KeyError[] {
  if (days <= 0) return [];
  const from = addDays(today, -(days - 1));
  return stats
    .filter((s) => s.date >= from && s.date <= today)
    .flatMap((s) => s.keyErrors ?? []);
}

export function formatShortDate(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${Number(m)}/${Number(d)}`;
}
