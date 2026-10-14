/**
 * 每日挑战：固定题组 + 连续打卡。
 *
 * ── 为什么用「日期派生种子」而不是存题库 ──
 *
 * 现有题源全部支持 `seed`（同种子 → 同题序），而这条性质已被中断恢复机制
 * 在生产中验证过。于是「每天的题」不需要任何存储：把 `YYYY-MM-DD` 哈希成种子即可。
 *
 * 好处是结构性的：
 *   - 换设备、清缓存、换浏览器，同一天拿到的都是同一套题；
 *   - 跨天自动刷新，无需任何定时任务；
 *   - 不需要为了「今天的题」维护一份服务端题库。
 */

import { addDays, toDateKey } from './statsAggregation';

/** `YYYY-MM-DD` 的**形状**（还要配合 isRealDateKey 判真伪） */
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 是否是真实存在的日期。
 *
 * 只测形状是不够的：`2026-13-99` 完全符合 `\d{4}-\d{2}-\d{2}`，
 * 但它一旦进入打卡日历，`addDays` 会把它归一化成一月后的另一天，
 * 于是「连续天数」会莫名其妙地串到相邻日期上。
 * 用「构造回去必须等于输入」来判定，是最省事且无歧义的写法。
 */
function isRealDateKey(dateKey: string): boolean {
  if (!DATE_KEY_RE.test(dateKey)) return false;
  const [year, month, day] = dateKey.split('-').map(Number);
  return toDateKey(new Date(year, month - 1, day)) === dateKey;
}

/**
 * 日期 → 32 位种子（FNV-1a）。
 *
 * 只用整数运算，不依赖 `Math.random` / 时区 / 语言环境，
 * 因此「同一天同一套题」在任意设备上都成立。
 */
export function dailySeed(dateKey: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 过滤非法日期并去重排序（本地存档可能被手改或来自旧版本） */
export function normalizeCompletedDates(dates: readonly string[]): string[] {
  return Array.from(new Set(dates.filter(isRealDateKey))).sort();
}

/** 指定日期是否已有正式成绩 */
export function isDailyCompleted(dates: readonly string[], dateKey: string): boolean {
  return dates.includes(dateKey);
}

/**
 * 连续打卡天数。
 *
 * 口径与「练习连续天数」(`computeStreak`) 对齐：
 * - 今天已完成 → 从今天往前数；
 * - 今天未完成 → 从昨天往前数（**今天还没打不算断签**，否则每天零点
 *   用户的打卡数都会先掉一天再补回来，看着像 bug）。
 */
export function challengeStreak(dates: readonly string[], today: string): number {
  const done = new Set(normalizeCompletedDates(dates));

  let cursor = done.has(today) ? today : addDays(today, -1);
  let streak = 0;

  // 上限只是防御损坏数据造成的死循环；十年足够覆盖任何真实使用
  while (done.has(cursor) && streak < 3650) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** 最近 n 天（含今天）的日期，升序 —— 打卡点阵用 */
export function recentDays(n: number, today: string): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    out.push(addDays(today, -i));
  }
  return out;
}
