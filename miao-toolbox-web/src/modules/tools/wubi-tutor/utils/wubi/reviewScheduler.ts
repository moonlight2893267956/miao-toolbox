/**
 * 间隔重复调度器（纯函数）
 *
 * 分级间隔：10min → 1d → 3d → 7d → 15d → 30d
 * 连续答对升一级，答错回到第 1 级（10min）。
 *
 * 全部函数接受注入的 `now`，便于单测到期时间计算。
 */

import type { ReviewItem } from './storage';

// ─── 常量 ────────────────────────────────────────────────

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 各级间隔（下标即 level，0 = 第 1 级） */
export const REVIEW_INTERVALS_MS: number[] = [
  10 * MINUTE, // 第 1 级：10 分钟
  1 * DAY,     // 第 2 级：1 天
  3 * DAY,     // 第 3 级：3 天
  7 * DAY,     // 第 4 级：7 天
  15 * DAY,    // 第 5 级：15 天
  30 * DAY,    // 第 6 级：30 天
];

/** 最高级下标 */
export const MAX_REVIEW_LEVEL = REVIEW_INTERVALS_MS.length - 1;

/** 队列上限（与 Story 3.1 一致） */
export const REVIEW_QUEUE_MAX = 500;

// ─── 间隔与到期 ──────────────────────────────────────────

/** 取某级的间隔毫秒数（越界则钳制到合法区间） */
export function getIntervalMs(level: number): number {
  const clamped = Math.max(0, Math.min(MAX_REVIEW_LEVEL, Math.floor(level)));
  return REVIEW_INTERVALS_MS[clamped];
}

/** 按级别计算到期时间戳 */
export function computeDueAt(level: number, now: number): number {
  return now + getIntervalMs(level);
}

// ─── 条目构造与调度 ──────────────────────────────────────

/**
 * 新建错题条目（首次出错 / 手动加入）。
 * 初始为第 1 级（10 分钟后到期）。
 */
export function createReviewItem(
  char: string,
  now: number,
  source: ReviewItem['source'] = 'auto',
): ReviewItem {
  return {
    char,
    wrongCount: 0,
    lastSeen: now,
    nextReview: computeDueAt(0, now),
    source,
    level: 0,
  };
}

/**
 * 根据一次作答结果推进调度。
 *
 * - 答对：升一级（封顶最高级）
 * - 答错：回到第 1 级，并累加错误次数
 *
 * @param item 原条目
 * @param correct 本次是否答对
 * @param now 当前时间
 * @returns 新条目（不修改原对象）
 */
export function scheduleNext(item: ReviewItem, correct: boolean, now: number): ReviewItem {
  const currentLevel = typeof item.level === 'number' ? item.level : 0;

  const nextLevel = correct
    ? Math.min(MAX_REVIEW_LEVEL, currentLevel + 1)
    : 0;

  return {
    ...item,
    level: nextLevel,
    lastSeen: now,
    wrongCount: correct ? item.wrongCount : item.wrongCount + 1,
    nextReview: computeDueAt(nextLevel, now),
  };
}

/** 是否已到期（需要复习） */
export function isDue(item: ReviewItem, now: number): boolean {
  return item.nextReview <= now;
}

/** 条目是否已完全掌握（已达最高级） */
export function isMastered(item: ReviewItem): boolean {
  return (item.level ?? 0) >= MAX_REVIEW_LEVEL;
}

// ─── 队列操作 ────────────────────────────────────────────

/**
 * 取出到期条目，按「到期时间升序 + 错误次数降序」排序。
 */
export function getDueItems(items: ReviewItem[], now: number): ReviewItem[] {
  return items
    .filter((it) => isDue(it, now))
    .sort(compareReviewPriority);
}

/**
 * 复习优先级比较：
 * 1. 到期越早越靠前
 * 2. 到期相同时错误次数越多越靠前
 */
export function compareReviewPriority(a: ReviewItem, b: ReviewItem): number {
  if (a.nextReview !== b.nextReview) return a.nextReview - b.nextReview;
  return b.wrongCount - a.wrongCount;
}

/**
 * 队列裁剪：超出上限时按优先级保留前 N 条。
 */
export function trimQueue(items: ReviewItem[], max: number = REVIEW_QUEUE_MAX): ReviewItem[] {
  if (items.length <= max) return [...items];
  return [...items].sort(compareReviewPriority).slice(0, max);
}

/**
 * 合并/更新条目（按字去重，幂等）。
 *
 * - 已存在：更新调度状态，保留首次记录
 * - 不存在：新增
 */
export function upsertItem(items: ReviewItem[], item: ReviewItem): ReviewItem[] {
  const index = items.findIndex((it) => it.char === item.char);
  if (index < 0) {
    return trimQueue([...items, item]);
  }

  const next = [...items];
  next[index] = {
    ...item,
    // 保留更早的首次错误时间不需要，这里保留累计错误次数
    wrongCount: Math.max(next[index].wrongCount, item.wrongCount),
  };
  return next;
}

/** 从队列中移除某个字（已掌握） */
export function removeItem(items: ReviewItem[], char: string): ReviewItem[] {
  return items.filter((it) => it.char !== char);
}

/** 移除所有已掌握的条目 */
export function removeMastered(items: ReviewItem[]): ReviewItem[] {
  return items.filter((it) => !isMastered(it));
}

// ─── 统计 ────────────────────────────────────────────────

export interface ReviewStats {
  /** 队列总数 */
  total: number;
  /** 今日待复习数 */
  due: number;
  /** 已掌握数（达最高级） */
  mastered: number;
}

/** 汇总队列统计 */
export function summarize(items: ReviewItem[], now: number): ReviewStats {
  let due = 0;
  let mastered = 0;

  for (const it of items) {
    if (isDue(it, now)) due++;
    if (isMastered(it)) mastered++;
  }

  return { total: items.length, due, mastered };
}

/** 把调度结果写回队列（幂等：同一个字只保留一条） */
export function applyAnswer(
  items: ReviewItem[],
  char: string,
  correct: boolean,
  now: number,
): ReviewItem[] {
  const index = items.findIndex((it) => it.char === char);
  if (index < 0) {
    // 不在队列中且答对：无需入队
    if (correct) return items;
    return upsertItem(items, createReviewItem(char, now));
  }

  const next = [...items];
  next[index] = scheduleNext(next[index], correct, now);
  return next;
}

export interface ReviewAnswer {
  char: string;
  correct: boolean;
}

/**
 * 批量回写一轮作答结果。
 *
 * 必须用本函数而不是循环调用 applyAnswer：
 * 调用方（Hook）里的 items 是渲染期的闭包快照，逐条调用时每次
 * 都基于同一份旧数组计算，后一次会覆盖前一次，最终只有最后一个字生效。
 */
export function applyAnswers(
  items: ReviewItem[],
  answers: ReviewAnswer[],
  now: number,
): ReviewItem[] {
  return answers.reduce(
    (acc, a) => applyAnswer(acc, a.char, a.correct, now),
    items,
  );
}

/** 从会话结果推导逐字作答对错 */
export function buildAnswersFromResult(
  attemptedChars: string[],
  wrongChars: string[],
): ReviewAnswer[] {
  const wrongSet = new Set(wrongChars);
  return attemptedChars.map((char) => ({ char, correct: !wrongSet.has(char) }));
}
