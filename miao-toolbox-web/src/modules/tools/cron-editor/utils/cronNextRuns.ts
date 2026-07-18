// Cron 未来执行时间计算（Story 1.4 / FR-13 下 N 次 / FR-14 空结果）
// 算法：基于解析结果（fields）在目标时区按「月→日/星期→时→分→秒」逐级跳跃匹配。
// 纯函数，无 React 依赖。

import type { CronDialect, CronField } from '../types';
import { parseExpression } from './cronParser';

interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0-6（周日=0）
}

/** 取时区在给定 Date 的偏移（毫秒，正数表示时区在 UTC 东侧） */
function tzOffsetMs(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const hour = parts.hour === '24' ? 0 : parseInt(parts.hour, 10);
  const asUTC = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    hour,
    parseInt(parts.minute, 10),
    parseInt(parts.second, 10),
  );
  return asUTC - date.getTime();
}

/** 由「目标时区的墙上时间」构造对应的 Date（往返稳定） */
function fromWallTime(tz: string, y: number, m: number, d: number, h: number, mi: number, s: number): Date {
  const base = Date.UTC(y, m - 1, d, h, mi, s);
  const off1 = tzOffsetMs(tz, new Date(base));
  const refined = new Date(base - off1);
  const off2 = tzOffsetMs(tz, refined);
  return new Date(base - off2);
}

/** 取某 Date 在目标时区下的墙上时间字段 */
function getWallTime(date: Date, tz: string): WallTime {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const hour = parts.hour === '24' ? 0 : parseInt(parts.hour, 10);
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour,
    minute: parseInt(parts.minute, 10),
    second: parseInt(parts.second, 10),
    weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** 某月最后一个工作日（LW） */
function lastWeekdayOfMonth(year: number, month: number): number {
  const dim = daysInMonth(year, month);
  const w = getWallTime(fromWallTime('UTC', year, month, dim, 0, 0, 0), 'UTC').weekday;
  if (w === 0) return dim - 2; // 周日 → 周五
  if (w === 6) return dim - 1; // 周六 → 周五
  return dim;
}

/** 距离 n 号最近的工作日（W） */
function nearestWeekday(year: number, month: number, n: number): number {
  const dim = daysInMonth(year, month);
  const d = Math.min(Math.max(n, 1), dim);
  const w = getWallTime(fromWallTime('UTC', year, month, d, 0, 0, 0), 'UTC').weekday;
  if (w === 0) return Math.min(d + 1, dim);
  if (w === 6) return Math.max(d - 1, 1);
  return d;
}

/** 某月最后一个指定星期几的日期（5L） */
function lastOccurrenceOfDow(year: number, month: number, dow: number): number {
  const dim = daysInMonth(year, month);
  let last = -1;
  for (let d = 1; d <= dim; d++) {
    const w = getWallTime(fromWallTime('UTC', year, month, d, 0, 0, 0), 'UTC').weekday;
    if (w === dow) last = d;
  }
  return last;
}

function isWildcard(f: CronField | null): boolean {
  if (!f) return true;
  return f.special === '*' || f.special === '?';
}

/** 数值型字段（月/时/分/秒）匹配 */
function numericMatch(f: CronField | null, value: number): boolean {
  if (!f) return true;
  if (isWildcard(f)) return true;
  return f.values.includes(value);
}

/**
 * 找严格大于 value 的下一个合法值。values 已按升序排列（parsePart 内部 sort）。
 * @returns 下一个合法值；若无（value ≥ 最大合法值）则返回 null。
 */
function nextAllowedValue(
  f: CronField | null,
  value: number,
): number | null {
  if (!f) return null;
  for (const v of f.values) {
    if (v > value) return v;
  }
  return null;
}

/** 日字段匹配（含 L / LW / W 特殊字符） */
function domMatch(f: CronField | null, wt: WallTime): boolean {
  if (!f) return true;
  if (isWildcard(f)) return true;
  const { year, month, day } = wt;
  if (f.special === 'L') return day === daysInMonth(year, month);
  if (f.special === 'LW') return day === lastWeekdayOfMonth(year, month);
  if (f.special === 'W' && f.specialValue != null) return day === nearestWeekday(year, month, f.specialValue);
  return f.values.includes(day);
}

/** 星期字段匹配（含 # / L 特殊字符；0 与 7 等价） */
function dowMatch(f: CronField | null, wt: WallTime): boolean {
  if (!f) return true;
  if (isWildcard(f)) return true;
  const { year, month, day, weekday } = wt;
  if (f.special === '#' && f.specialValue != null && f.nth != null) {
    const occ = Math.ceil(day / 7);
    return weekday === f.specialValue && occ === f.nth;
  }
  if (f.special === 'L' && f.specialValue != null) {
    return weekday === f.specialValue && day === lastOccurrenceOfDow(year, month, f.specialValue);
  }
  return f.values.includes(weekday) || f.values.includes(weekday === 0 ? 7 : weekday);
}

/** 日约束：标准 Cron 中「日」与「星期」同时限定取并集（任一满足即触发） */
function dayMatches(domField: CronField | null, dowField: CronField | null, wt: WallTime): boolean {
  const domWild = isWildcard(domField);
  const dowWild = isWildcard(dowField);
  if (domWild && dowWild) return true;
  if (domWild) return dowMatch(dowField, wt);
  if (dowWild) return domMatch(domField, wt);
  return domMatch(domField, wt) || dowMatch(dowField, wt);
}

interface CompiledFields {
  second: CronField | null;
  minute: CronField | null;
  hour: CronField | null;
  day: CronField | null;
  month: CronField | null;
  weekday: CronField | null;
}

/** 5 位 Linux Cron 隐含 second=0；6 位 Spring 才有显式 second 字段 */
function compile(expression: string, dialect: CronDialect): CompiledFields | null {
  const parsed = parseExpression(expression, dialect);
  if (!parsed.ok) return null;
  const byType = (t: string) => parsed.expr.fields.find((f) => f.type === t) ?? null;
  // 5 位模式补一个隐含 second=0 字段（值集合 [0]），让 numericMatch 正常按"仅 0 秒"匹配
  const second: CronField | null =
    dialect === 'spring6' ? byType('second') : { type: 'second', raw: '0', values: [0] };
  return {
    second,
    minute: byType('minute'),
    hour: byType('hour'),
    day: byType('day'),
    month: byType('month'),
    weekday: byType('weekday'),
  };
}

/** 找到严格晚于 `from`、且不晚于 `limit` 的下一个匹配时间；无则 null */
function findNext(cf: CompiledFields, tz: string, from: Date, limit: Date): Date | null {
    let cur = new Date(from.getTime() + 1000); // 严格晚于 from
  let guard = 0;
  while (cur.getTime() <= limit.getTime()) {
    if (guard++ > 100000) return null;
    const wt = getWallTime(cur, tz);

    // 月（找下一合法月；否则跳到次年 1 月）
    if (!numericMatch(cf.month, wt.month)) {
      const nextM = nextAllowedValue(cf.month, wt.month);
      if (nextM != null) {
        cur = fromWallTime(tz, wt.year, nextM, 1, 0, 0, 0);
      } else {
        cur = fromWallTime(tz, wt.year + 1, 1, 1, 0, 0, 0);
      }
      continue;
    }
    // 日 / 星期（并集）
    if (!dayMatches(cf.day, cf.weekday, wt)) {
      const dim = daysInMonth(wt.year, wt.month);
      const nd = wt.day + 1;
      if (nd > dim) {
        let y = wt.year;
        let m = wt.month + 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
        cur = fromWallTime(tz, y, m, 1, 0, 0, 0);
      } else {
        cur = fromWallTime(tz, wt.year, wt.month, nd, 0, 0, 0);
      }
      continue;
    }
    // 时（找下一合法小时；否则跳到次日 0 时）
    if (!numericMatch(cf.hour, wt.hour)) {
      const nextH = nextAllowedValue(cf.hour, wt.hour);
      if (nextH != null) {
        cur = fromWallTime(tz, wt.year, wt.month, wt.day, nextH, 0, 0);
      } else {
        cur = fromWallTime(tz, wt.year, wt.month, wt.day + 1, 0, 0, 0);
      }
      continue;
    }
    // 分（找下一合法分钟；否则跳到下一小时 0 分）
    if (!numericMatch(cf.minute, wt.minute)) {
      const nextM = nextAllowedValue(cf.minute, wt.minute);
      if (nextM != null) {
        cur = fromWallTime(tz, wt.year, wt.month, wt.day, wt.hour, nextM, 0);
      } else {
        cur = fromWallTime(tz, wt.year, wt.month, wt.day, wt.hour + 1, 0, 0);
      }
      continue;
    }
    // 秒（5 位下 cf.second 是隐含的 [0]，6 位下是解析字段；始终参与匹配）
    if (!numericMatch(cf.second, wt.second)) {
      const nextS = nextAllowedValue(cf.second, wt.second);
      if (nextS != null) {
        cur = fromWallTime(tz, wt.year, wt.month, wt.day, wt.hour, wt.minute, nextS);
      } else {
        cur = fromWallTime(tz, wt.year, wt.month, wt.day, wt.hour, wt.minute + 1, 0);
      }
      continue;
    }
    return cur;
  }
  return null;
}

/**
 * 计算未来 N 次执行时间（默认 10），以目标时区解释。
 * @returns 执行时间数组（按时间升序）；若未来 1 年内无匹配则为空数组（FR-14）。
 */
export function nextRuns(
  expression: string,
  dialect: CronDialect,
  tz: string,
  count = 10,
  from: Date = new Date(),
): Date[] {
  const cf = compile(expression, dialect);
  if (!cf) return [];
  const limit = new Date(from.getTime() + 366 * 24 * 60 * 60 * 1000); // 未来 1 年窗口
  const out: Date[] = [];
  let cur = from;
  while (out.length < count) {
    const next = findNext(cf, tz, cur, limit);
    if (!next) break;
    out.push(next);
    cur = next;
  }
  return out;
}
