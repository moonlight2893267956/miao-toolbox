/**
 * 会话成绩对比纯函数（Story 4.2）
 *
 * 职责：
 * - 把 SessionResult 归一为可持久化的 SessionSummary
 * - 与「上一次同类练习」做差值对比
 * - 判定是否刷新个人最佳
 * - 合并写入各模式的成绩记录
 *
 * 全部为纯函数，`now` 由调用方注入以便单测。
 */

import type { SessionResult } from './session';

// ─── 模式键约定 ──────────────────────────────────────────

/**
 * 非模式选择页发起的练习所用的固定 key。
 *
 * 集中定义避免各处硬编码字符串导致「同类练习对比」失效
 * （拼错一个字母就会变成两个互不相干的记录）。
 */
export const PRACTICE_MODE_KEYS = {
  review: 'review',
  article: 'article',
  customArticle: 'custom-article',
} as const;

/** 关卡练习的 mode key：按「关卡.环节」分别记录，才能做同类对比 */
export function lessonModeKey(lessonId: string, stageKind: string): string {
  return `lesson:${lessonId}:${stageKind}`;
}

/** 关卡练习的 mode key 前缀（用于「今日是否练过任意关卡」判定） */
export const LESSON_MODE_PREFIX = 'lesson:';

// ─── 类型定义 ────────────────────────────────────────────

/** 一次练习的成绩摘要（可持久化，字段均为原始值） */
export interface SessionSummary {
  totalQuestions: number;
  correctQuestions: number;
  /** 正确完成的汉字数（键位 / 字根类练习为 0） */
  correctChars: number;
  totalKeystrokes: number;
  errorKeystrokes: number;
  accuracy: number;
  speedPerMinute: number;
  validKeystrokeRate: number;
  maxCombo: number;
  durationSec: number;
  /** 记录时间戳 */
  at: number;
}

/** 单个练习模式的历史记录 */
export interface ModeRecord {
  /** 最近一次成绩 */
  last: SessionSummary;
  /** 历史最佳成绩 */
  best: SessionSummary;
  /** 累计练习次数 */
  sessions: number;
}

/** 各模式成绩记录（key = PracticeKind） */
export type ModeRecords = Record<string, ModeRecord>;

export interface ModeComparison {
  /** 是否为该模式的首次练习（无对比基准） */
  isFirst: boolean;
  /** 速度差值（本次 − 上次，字/分钟）；无基准为 null */
  speedDelta: number | null;
  /** 准确率差值（本次 − 上次）；无基准为 null */
  accuracyDelta: number | null;
  /** 有效击键率差值；无基准为 null */
  validRateDelta: number | null;
  /** 击键数差值（本次 − 上次）；无基准为 null */
  keystrokesDelta: number | null;
  /** 刷新个人最佳（首次练习时全部为 false，避免无意义的「最佳」提示） */
  personalBest: {
    speed: boolean;
    accuracy: boolean;
    validRate: boolean;
    maxCombo: boolean;
  };
}

// ─── 归一 ────────────────────────────────────────────────

/** SessionResult → 可持久化的成绩摘要 */
export function toSummary(result: SessionResult, now: number): SessionSummary {
  return {
    totalQuestions: result.totalQuestions,
    correctQuestions: result.correctQuestions,
    correctChars: result.correctChars,
    totalKeystrokes: result.totalKeystrokes,
    errorKeystrokes: result.errorKeystrokes,
    accuracy: result.accuracy,
    speedPerMinute: result.speedPerMinute,
    validKeystrokeRate: result.validKeystrokeRate,
    maxCombo: result.maxCombo,
    durationSec: result.durationSec,
    at: now,
  };
}

// ─── 对比 ────────────────────────────────────────────────

/**
 * 与上一次同类练习对比。
 *
 * @param current 本次成绩摘要
 * @param prev 该模式的历史记录（undefined = 首次练习）
 */
export function compareWithLast(
  current: SessionSummary,
  prev: ModeRecord | undefined,
): ModeComparison {
  if (!prev) {
    return {
      isFirst: true,
      speedDelta: null,
      accuracyDelta: null,
      validRateDelta: null,
      keystrokesDelta: null,
      personalBest: { speed: false, accuracy: false, validRate: false, maxCombo: false },
    };
  }

  return {
    isFirst: false,
    speedDelta: current.speedPerMinute - prev.last.speedPerMinute,
    accuracyDelta: current.accuracy - prev.last.accuracy,
    validRateDelta: current.validKeystrokeRate - prev.last.validKeystrokeRate,
    keystrokesDelta: current.totalKeystrokes - prev.last.totalKeystrokes,
    personalBest: {
      speed: current.speedPerMinute > prev.best.speedPerMinute,
      accuracy: current.accuracy > prev.best.accuracy,
      validRate: current.validKeystrokeRate > prev.best.validKeystrokeRate,
      maxCombo: current.maxCombo > prev.best.maxCombo,
    },
  };
}

/** 是否刷新了任意一项个人最佳 */
export function hasAnyPersonalBest(pb: ModeComparison['personalBest']): boolean {
  return pb.speed || pb.accuracy || pb.validRate || pb.maxCombo;
}

// ─── 写入 ────────────────────────────────────────────────

/**
 * 把本次成绩合并进各模式记录（返回新对象）。
 *
 * 约定：`last` 恒为本次成绩，`best` 逐项取历史最大值。
 */
export function recordModeResult(
  records: ModeRecords,
  modeKey: string,
  current: SessionSummary,
): ModeRecords {
  const prev = records[modeKey];

  const best: SessionSummary = prev
    ? {
        ...current,
        // 取各项更优者；`at` 表示「最佳成绩达成时间」
        speedPerMinute: Math.max(prev.best.speedPerMinute, current.speedPerMinute),
        accuracy: Math.max(prev.best.accuracy, current.accuracy),
        validKeystrokeRate: Math.max(prev.best.validKeystrokeRate, current.validKeystrokeRate),
        maxCombo: Math.max(prev.best.maxCombo, current.maxCombo),
        totalQuestions: Math.max(prev.best.totalQuestions, current.totalQuestions),
        correctQuestions: Math.max(prev.best.correctQuestions, current.correctQuestions),
        at: current.speedPerMinute > prev.best.speedPerMinute ? current.at : prev.best.at,
      }
    : current;

  return {
    ...records,
    [modeKey]: {
      last: current,
      best,
      sessions: (prev?.sessions ?? 0) + 1,
    },
  };
}

// ─── 展示辅助 ────────────────────────────────────────────

/**
 * 格式化差值（带正负号）。
 *
 * @param delta 差值
 * @param digits 小数位（准确率类传 1；速度类传 1；整数类传 0）
 * @param suffix 单位后缀（如 ' 字/分'）
 */
export function formatDelta(delta: number | null, digits = 0, suffix = ''): string {
  if (delta === null) return '—';
  const rounded = Number(delta.toFixed(digits));
  // 避免出现 "-0"
  if (rounded === 0) return `0${suffix}`;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}${suffix}`;
}

/** 差值的趋势方向 */
export function deltaTrend(delta: number | null, epsilon = 1e-9): 'up' | 'down' | 'flat' | 'none' {
  if (delta === null) return 'none';
  if (Math.abs(delta) <= epsilon) return 'flat';
  return delta > 0 ? 'up' : 'down';
}
