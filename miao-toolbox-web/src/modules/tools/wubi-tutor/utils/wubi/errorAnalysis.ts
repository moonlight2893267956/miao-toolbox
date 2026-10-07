/**
 * 错误分析纯函数（Story 4.2）
 *
 * 职责：
 * - 键位错误计数（热力图数据源）
 * - 易混字根对生成（期望键 → 实际键，按次数排序取 Top N）
 * - 错字清单聚合（本次 + 近 N 天，去重排序）
 *
 * 全部为纯函数，不读全局状态、不触碰 DOM。
 */

import { getKeyMeta, type WubiKey } from '../../data/radicals';
import type { KeyError, SessionResult } from './session';
import type { ReviewItem } from './storage';

// ─── 类型定义 ────────────────────────────────────────────

/** 热力等级 0（无错误）~ 4（最高） */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface ConfusionPair {
  /** 期望按下的键 */
  expectedKey: string;
  /** 实际按下的键 */
  actualKey: string;
  /** 期望键的键名字（如 g → 王） */
  expectedGlyph: string;
  /** 实际键的键名字（如 f → 土） */
  actualGlyph: string;
  /** 出现次数 */
  count: number;
}

export interface WrongCharEntry {
  char: string;
  /** 本次练习是否出错 */
  inCurrent: boolean;
  /** 近期（近 N 天）出错次数 */
  recentCount: number;
}

export interface ErrorSummary {
  /** 按实际按键聚合的错误次数（热力图用） */
  byActualKey: Record<string, number>;
  /** 按期望按键聚合的错误次数 */
  byExpectedKey: Record<string, number>;
  /** 易混字根对（次数降序，已截断） */
  confusionPairs: ConfusionPair[];
  /** 错字清单（本次优先，其次近期频次） */
  wrongChars: WrongCharEntry[];
  /** 本次错误击键总数 */
  totalErrors: number;
}

// ─── 键位计数 ────────────────────────────────────────────

/**
 * 回顾窗口的默认天数（**唯一真相**）。
 *
 * 界面文案与内部统计都必须从这里取值：曾经「近 7 天」这句话被写死在
 * 组件里 9 处，而窗口是个参数 —— 窗口一改，9 处文案会集体说谎。
 */
export const DEFAULT_RECENT_DAYS = 7;

/** 窗口的界面说法（「近 7 天」） */
export function recentWindowLabel(days: number = DEFAULT_RECENT_DAYS): string {
  return `近 ${days} 天`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 按「实际按下的键」聚合错误次数。
 * 热力图直接消费该结果。
 */
export function countByActualKey(keyErrors: KeyError[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of keyErrors) {
    if (!e.actual) continue;
    result[e.actual] = (result[e.actual] ?? 0) + 1;
  }
  return result;
}

/** 按「期望按下的键」聚合错误次数 */
export function countByExpectedKey(keyErrors: KeyError[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of keyErrors) {
    if (!e.expected) continue;
    result[e.expected] = (result[e.expected] ?? 0) + 1;
  }
  return result;
}

/**
 * 把错误次数映射为热力等级 0~4。
 *
 * 以单次会话内的最大错误次数为基准分档：
 * - count = 0 → 0
 * - 其余按 count / max 均匀分为 1~4 档
 */
export function computeHeatLevel(count: number, maxCount: number): HeatLevel {
  if (count <= 0 || maxCount <= 0) return 0;

  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/**
 * 键位错误次数表 → 热力等级表。
 * 直接从 `byActualKey` 派生，供 ErrorAnalysis 复用已聚合的结果。
 */
export function buildHeatmapFromCounts(counts: Record<string, number>): Record<string, HeatLevel> {
  const max = Math.max(0, ...Object.values(counts));

  const levels: Record<string, HeatLevel> = {};
  for (const [key, count] of Object.entries(counts)) {
    levels[key] = computeHeatLevel(count, max);
  }
  return levels;
}

/** 键位错误次数 → 热力等级表（VirtualKeyboard heatmap 模式消费） */
export function buildHeatmap(keyErrors: KeyError[]): Record<string, HeatLevel> {
  return buildHeatmapFromCounts(countByActualKey(keyErrors));
}

// ─── 易混字根对 ──────────────────────────────────────────

/** 取键位对应的键名字（无 meta 时回退为大写字母） */
function glyphOf(key: string): string {
  const meta = getKeyMeta(key as WubiKey);
  return meta?.keyNameChar ?? key.toUpperCase();
}

/**
 * 生成易混字根对，按出现次数降序。
 *
 * 只统计「期望键 ≠ 实际键」的记录；
 * 同一个 (期望, 实际) 组合合并计数。
 *
 * @param keyErrors 错误配对记录
 * @param limit 返回的 Top N（默认 5）
 */
export function buildConfusionPairs(keyErrors: KeyError[], limit = 5): ConfusionPair[] {
  const counter = new Map<string, ConfusionPair>();

  for (const e of keyErrors) {
    if (!e.expected || !e.actual) continue;
    if (e.expected === e.actual) continue;

    const pairKey = `${e.expected}>${e.actual}`;
    const existing = counter.get(pairKey);
    if (existing) {
      existing.count += 1;
    } else {
      counter.set(pairKey, {
        expectedKey: e.expected,
        actualKey: e.actual,
        expectedGlyph: glyphOf(e.expected),
        actualGlyph: glyphOf(e.actual),
        count: 1,
      });
    }
  }

  return Array.from(counter.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      // 次数相同按组合稳定排序，保证渲染顺序可预期
      return `${a.expectedKey}${a.actualKey}`.localeCompare(`${b.expectedKey}${b.actualKey}`);
    })
    .slice(0, Math.max(0, limit));
}

// ─── 错字清单 ────────────────────────────────────────────

/**
 * 聚合错字清单：本次错字 + 近 N 天的历史错字，去重后排序。
 *
 * 排序规则：
 * 1. 本次出错的字优先
 * 2. 其余按近期出错次数降序
 * 3. 仍相同按字符升序（保证稳定）
 *
 * @param currentWrongChars 本次会话的错字
 * @param recentItems 复习队列条目（含 lastSeen / wrongCount）
 * @param now 当前时间戳（注入以便测试）
 * @param days 近期窗口天数（默认 7）
 */
export function mergeWrongChars(
  currentWrongChars: string[],
  recentItems: ReviewItem[],
  now: number,
  days = 7,
): WrongCharEntry[] {
  const windowStart = now - days * DAY_MS;
  const map = new Map<string, WrongCharEntry>();

  // 先放本次错字（优先级最高）
  for (const char of currentWrongChars) {
    if (!char) continue;
    const existing = map.get(char);
    if (existing) {
      existing.inCurrent = true;
    } else {
      map.set(char, { char, inCurrent: true, recentCount: 0 });
    }
  }

  // 再合并近期错字
  for (const item of recentItems) {
    if (!item.char) continue;
    if (item.lastSeen < windowStart) continue;

    const existing = map.get(item.char);
    if (existing) {
      existing.recentCount = item.wrongCount;
    } else {
      map.set(item.char, {
        char: item.char,
        inCurrent: false,
        recentCount: item.wrongCount,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.inCurrent !== b.inCurrent) return a.inCurrent ? -1 : 1;
    if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount;
    return a.char.localeCompare(b.char);
  });
}

// ─── 汇总 ────────────────────────────────────────────────

export interface AnalyzeOptions {
  /** 易混字根对返回条数（默认 5） */
  pairLimit?: number;
  /** 近期窗口天数（默认 7） */
  recentDays?: number;
  /** 当前时间戳（默认 Date.now()） */
  now?: number;
}

/**
 * 一次性生成错误分析全量结果。
 */
export function analyzeErrors(
  result: Pick<SessionResult, 'wrongChars' | 'keyErrors'> | null,
  recentItems: ReviewItem[] = [],
  options: AnalyzeOptions = {},
): ErrorSummary {
  const { pairLimit = 5, recentDays = DEFAULT_RECENT_DAYS, now = Date.now() } = options;

  const keyErrors = result?.keyErrors ?? [];
  const currentWrongChars = result?.wrongChars ?? [];

  return {
    byActualKey: countByActualKey(keyErrors),
    byExpectedKey: countByExpectedKey(keyErrors),
    confusionPairs: buildConfusionPairs(keyErrors, pairLimit),
    wrongChars: mergeWrongChars(currentWrongChars, recentItems, now, recentDays),
    totalErrors: keyErrors.length,
  };
}
