/**
 * 成就上下文构建（Story 4.4）
 *
 * 把散落在三个存储分区（stats / progress / review）的原始数据
 * 聚合成成就判定所需的单一上下文对象。
 *
 * 单独成模块的原因：这段派生逻辑（通关数、跨模式最优速度/连击）
 * 容易出错且值得单测，但又不该混进 React Hook。
 */

import { computeStreak, computeTotals, todayKey } from './statsAggregation';
import type { AchievementContext } from './achievements';
import type { ProgressData, DailyStat, ReviewItem } from './storage';
import type { ModeRecords, ModeRecord } from './sessionStats';

// ─── 派生辅助 ────────────────────────────────────────────

/** 已通关关卡数（1 关 = 1 个键位认知） */
export function countPassedLessons(progress: ProgressData): number {
  const lessons = progress.course?.lessons;
  if (!lessons) return 0;
  return Object.values(lessons).filter((r) => r?.passed === true).length;
}

/**
 * 跨模式取历史最佳速度（字/分钟）。
 *
 * 优先用 modeRecords（逐次会话的真实速度），
 * 因为它比「单日平均速度」更贴近「我最快能打多快」。
 */
export function bestSpeedAcrossModes(records: ModeRecords): number {
  return Object.values(records).reduce(
    (best, rec) => Math.max(best, rec?.best?.speedPerMinute ?? 0),
    0,
  );
}

/** 跨模式取历史最大连击 */
export function bestComboAcrossModes(records: ModeRecords): number {
  return Object.values(records).reduce(
    (best, rec) => Math.max(best, rec?.best?.maxCombo ?? 0),
    0,
  );
}

/** 跨模式取历史最佳单次准确率（0~1） */
export function bestAccuracyAcrossModes(records: ModeRecords): number {
  return Object.values(records).reduce(
    (best, rec) => Math.max(best, rec?.best?.accuracy ?? 0),
    0,
  );
}

/** 待复习条目数 */
export function countReviewItems(review: ReviewItem[]): number {
  return review.filter((r) => r && r.char).length;
}

// ─── 主函数 ──────────────────────────────────────────────

export interface BuildContextInput {
  stats: DailyStat[];
  progress: ProgressData;
  review: ReviewItem[];
  /** 今天（注入以便测试） */
  today?: string;
}

/**
 * 构建成就判定上下文。
 *
 * 速度/准确率/连击三项取「modeRecords 最优」与「单日最优」中的较大者：
 * 前者记录单次会话峰值，后者覆盖早期没有 modeRecords 的历史数据。
 */
export function buildAchievementContext(input: BuildContextInput): AchievementContext {
  const { stats, progress, review } = input;
  const today = input.today ?? todayKey();

  const totals = computeTotals(stats);
  const records: ModeRecords = progress?.modeRecords ?? {};

  return {
    totals,
    streak: computeStreak(stats, today),
    reviewTotal: countReviewItems(review),
    passedLessons: countPassedLessons(progress),
    bestSpeed: Math.max(totals.bestDaySpeed, bestSpeedAcrossModes(records)),
    bestAccuracy: Math.max(totals.bestDayAccuracy, bestAccuracyAcrossModes(records)),
    maxCombo: bestComboAcrossModes(records),
  };
}

/** 从 modeRecords 取指定模式的记录（首页/成绩页展示用） */
export function getModeRecordSafe(records: ModeRecords, modeKey: string): ModeRecord | undefined {
  return records?.[modeKey];
}
