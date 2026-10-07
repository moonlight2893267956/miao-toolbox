/**
 * 学习数据聚合 Hook（Story 4.4）
 *
 * 把 stats / progress / review 三个存储分区读出来聚合成
 * 成绩页需要的快照，并提供：
 * - `getSeries` 趋势序列（按需计算，切换 14/30 天时不会重复读存储）
 * - `checkAndUnlock` 会话结束后判定并落盘新成就
 *
 * 注意：所有读取都走 storage 同步 API，不使用 state 快照，
 * 否则刚写入的日统计会因 React 批处理读不到。
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWubiStorage } from './useWubiStorage';
import {
  buildTrendSeries,
  computeTotals,
  todayKey,
  type TrendMetric,
  type TrendPoint,
  type Totals,
  type StreakInfo,
} from './statsAggregation';
import {
  evaluateAchievements,
  getNextMilestones,
  groupUnlocked,
  ACHIEVEMENTS,
  TOTAL_ACHIEVEMENTS,
  type AchievementContext,
  type AchievementGroup,
  type MilestoneHint,
} from './achievements';
import { buildAchievementContext } from './achievementContext';
import type { DailyStat } from './storage';
import type { ModeRecords } from './sessionStats';

// ─── 类型 ────────────────────────────────────────────────

export interface WubiStatsSnapshot {
  totals: Totals;
  streak: StreakInfo;
  context: AchievementContext;
  /** 已解锁成就 id（按声明顺序） */
  unlocked: string[];
  /** 按分组归集的已解锁成就 */
  grouped: Record<AchievementGroup, string[]>;
  /** 最接近达成的未解锁成就 */
  milestones: MilestoneHint[];
  /** 已解锁数 / 总数 */
  unlockedCount: number;
  totalAchievements: number;
  /** 已完成关卡数（1 关 = 1 键） */
  passedLessons: number;
  /** 待复习条目数 */
  reviewTotal: number;
  /** 是否有任何练习数据 */
  hasData: boolean;
  /** 今天是否已练习 */
  activeToday: boolean;
  /** 今日累计练习时长（秒） */
  todayPracticeSec: number;
  /** 各练习模式成绩记录（今日计划判定用） */
  modeRecords: ModeRecords;
}

// ─── 快照构建 ────────────────────────────────────────────

function buildSnapshot(
  stats: DailyStat[],
  ctx: AchievementContext,
  unlocked: string[],
  modeRecords: ModeRecords,
): WubiStatsSnapshot {
  const today = todayKey();
  const todayStat = stats.find((s) => s.date === today);

  return {
    totals: ctx.totals,
    streak: ctx.streak,
    context: ctx,
    unlocked,
    grouped: groupUnlocked(unlocked),
    milestones: getNextMilestones(ctx, unlocked),
    unlockedCount: unlocked.length,
    totalAchievements: TOTAL_ACHIEVEMENTS,
    passedLessons: ctx.passedLessons,
    reviewTotal: ctx.reviewTotal,
    hasData: ctx.totals.totalSessions > 0 || ctx.totals.totalKeystrokes > 0,
    activeToday: ctx.streak.activeToday,
    todayPracticeSec: todayStat?.practiceTimeSec ?? 0,
    modeRecords,
  };
}

// ─── Hook ────────────────────────────────────────────────

export function useWubiStats() {
  const {
    loadStats, loadProgress, loadReview, unlockAchievements,
  } = useWubiStorage();

  /** 原始日统计缓存（趋势序列按需计算，避免每次切视图都读存储） */
  const statsRef = useRef<DailyStat[]>([]);

  const [snapshot, setSnapshot] = useState<WubiStatsSnapshot>(() => {
    const stats = loadStats();
    statsRef.current = stats;
    const progress = loadProgress();
    const review = loadReview();
    const ctx = buildAchievementContext({ stats, progress, review });
    return buildSnapshot(stats, ctx, progress.achievements ?? [], progress.modeRecords ?? {});
  });

  const refresh = useCallback(() => {
    const stats = loadStats();
    statsRef.current = stats;
    const progress = loadProgress();
    const review = loadReview();
    const ctx = buildAchievementContext({ stats, progress, review });
    const records = progress.modeRecords ?? {};

    setSnapshot(prev => {
      // 存储中的成就可能被其他入口（如导入）更新，以存储为准
      const unlockedList = progress.achievements ?? [];
      const unlocked = unlockedList.length >= prev.unlocked.length ? unlockedList : prev.unlocked;
      return buildSnapshot(stats, ctx, unlocked, records);
    });
  }, [loadStats, loadProgress, loadReview]);

  /**
   * 会话结束后判定新成就并落盘。
   *
   * 必须直接读存储而非 state：`recordSession` 刚刚写入的日统计
   * 还没反映到 React 状态里。
   *
   * @returns 本次新解锁的成就 id（已按展示优先级截断）
   */
  const checkAndUnlock = useCallback((): string[] => {
    const stats = loadStats();
    statsRef.current = stats;
    const progress = loadProgress();
    const review = loadReview();

    const ctx = buildAchievementContext({ stats, progress, review });
    const records = progress.modeRecords ?? {};
    const newly = evaluateAchievements(ctx, progress.achievements ?? []);

    if (newly.length > 0) {
      const merged = unlockAchievements(newly);
      setSnapshot(buildSnapshot(
        stats, ctx,
        merged.length > 0 ? merged : progress.achievements ?? [],
        records,
      ));
    } else {
      setSnapshot(buildSnapshot(stats, ctx, progress.achievements ?? [], records));
    }

    return newly;
  }, [loadStats, loadProgress, loadReview, unlockAchievements]);

  /** 趋势序列（按需计算） */
  const getSeries = useCallback((days: number, metric: TrendMetric): TrendPoint[] => {
    return buildTrendSeries(statsRef.current, days, metric, todayKey());
  }, []);

  /** 近期累计（14 / 30 天区间汇总，用于趋势卡片副标题） */
  const getRangeTotals = useCallback((days: number): Totals => {
    const series = buildTrendSeries(statsRef.current, days, 'time', todayKey());
    const inRange = new Set(series.map(p => p.date));
    // 复用 computeTotals，避免此处出现第二套累加逻辑
    return computeTotals(statsRef.current.filter(s => inRange.has(s.date)));
  }, []);

  // 挂载时刷新一次，避免其他 Tab 写入后本 Tab 数据陈旧
  useEffect(() => {
    refresh();
  }, [refresh]);

  /*
   * 不对外暴露 `stats` 本身。
   * 它存在 ref 里，变异不会触发重渲染 —— 外部拿去用会读到
   * 「上次 render 时」的旧数组。需要派生数据请用 getSeries / getRangeTotals。
   */
  return {
    snapshot,
    achievements: ACHIEVEMENTS,
    refresh,
    getSeries,
    getRangeTotals,
    checkAndUnlock,
  };
}
