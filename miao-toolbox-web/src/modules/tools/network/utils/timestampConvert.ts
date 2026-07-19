/**
 * Unix 时间戳工具（参考站长工具能力扩展）
 * - 秒 / 毫秒显式单位
 * - 时间戳 ↔ 日期字符串
 * - 年月日时分秒组件组装
 */

export type TimestampUnit = 's' | 'ms';

export interface TimestampParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface TimestampFormats {
  unixSeconds: number;
  unixMillis: number;
  /** 2024-07-18 16:00:00 */
  beijing: string;
  utc: string;
  iso: string;
  isoLocalOffset: string;
  rfc2822: string;
  /** 相对现在的描述 */
  relative: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 固定时区偏移格式化（不依赖浏览器本地时区） */
export function formatInOffset(date: Date, offsetHours: number): string {
  const shifted = new Date(date.getTime() + offsetHours * 3_600_000);
  const y = shifted.getUTCFullYear();
  const m = pad(shifted.getUTCMonth() + 1);
  const d = pad(shifted.getUTCDate());
  const hh = pad(shifted.getUTCHours());
  const mm = pad(shifted.getUTCMinutes());
  const ss = pad(shifted.getUTCSeconds());
  const sign = offsetHours >= 0 ? '+' : '-';
  return `${y}-${m}-${d} ${hh}:${mm}:${ss} UTC${sign}${Math.abs(offsetHours)}`;
}

export function formatUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
  );
}

export function relativeToNow(date: Date, now = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hour = Math.round(min / 60);
  const day = Math.round(hour / 24);
  const suffix = diffMs >= 0 ? '后' : '前';
  if (sec < 60) return `${sec} 秒${suffix}`;
  if (min < 60) return `${min} 分钟${suffix}`;
  if (hour < 48) return `${hour} 小时${suffix}`;
  if (day < 365) return `${day} 天${suffix}`;
  return `${Math.round(day / 365)} 年${suffix}`;
}

export function buildFormats(date: Date, now = new Date()): TimestampFormats {
  const ms = date.getTime();
  return {
    unixSeconds: Math.floor(ms / 1000),
    unixMillis: ms,
    beijing: formatInOffset(date, 8).replace(' UTC+8', ''),
    utc: formatUtc(date).replace(' UTC', ''),
    iso: date.toISOString(),
    isoLocalOffset: formatIsoWithOffset(date, 8),
    rfc2822: date.toUTCString(),
    relative: relativeToNow(date, now),
  };
}

function formatIsoWithOffset(date: Date, offsetHours: number): string {
  const shifted = new Date(date.getTime() + offsetHours * 3_600_000);
  const y = shifted.getUTCFullYear();
  const m = pad(shifted.getUTCMonth() + 1);
  const d = pad(shifted.getUTCDate());
  const hh = pad(shifted.getUTCHours());
  const mm = pad(shifted.getUTCMinutes());
  const ss = pad(shifted.getUTCSeconds());
  const sign = offsetHours >= 0 ? '+' : '-';
  const oh = pad(Math.abs(offsetHours));
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${sign}${oh}:00`;
}

/** 时间戳数字 → Date（显式单位） */
export function timestampToDate(value: string | number, unit: TimestampUnit): Date {
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) throw new Error('请输入有效的数字时间戳');
  const ms = unit === 's' ? n * 1000 : n;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) throw new Error('时间戳超出有效范围');
  return date;
}

/**
 * 解析日期字符串为 Date
 * 支持：2024-07-18 16:00:00 / 2024/07/18 16:00:00 / ISO
 * 无时区信息时按「北京时间 UTC+8」解释（贴近站长工具国内习惯）
 */
export function parseDateString(input: string, assumeOffsetHours = 8): Date {
  const raw = input.trim();
  if (!raw) throw new Error('请输入日期时间');

  // 纯数字交给调用方用 unit
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error('纯数字请使用「时间戳 → 日期」区域');
  }

  // 已有时区 / ISO
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw) || raw.includes('T')) {
    const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
    if (!Number.isNaN(d.getTime())) return d;
  }

  // yyyy-MM-dd[ HH:mm[:ss]] 或 yyyy/MM/dd
  const m = raw.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (m) {
    const parts: TimestampParts = {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4] ?? 0),
      minute: Number(m[5] ?? 0),
      second: Number(m[6] ?? 0),
    };
    return partsToDate(parts, assumeOffsetHours);
  }

  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) throw new Error('无法解析该日期时间');
  return fallback;
}

/** 组件时间 → Date（按指定时区偏移解释） */
export function partsToDate(parts: TimestampParts, offsetHours = 8): Date {
  const { year, month, day, hour, minute, second } = parts;
  if (month < 1 || month > 12) throw new Error('月份须在 1–12');
  if (day < 1 || day > 31) throw new Error('日期无效');
  // 将该「墙上时钟」视为 offset 时区，转 UTC ms
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const ms = asUtc - offsetHours * 3_600_000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) throw new Error('日期超出有效范围');
  return date;
}

export function dateToParts(date: Date, offsetHours = 8): TimestampParts {
  const shifted = new Date(date.getTime() + offsetHours * 3_600_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

export function formatsToRows(f: TimestampFormats): { label: string; value: string }[] {
  return [
    { label: 'Unix 秒', value: String(f.unixSeconds) },
    { label: 'Unix 毫秒', value: String(f.unixMillis) },
    { label: '北京时间', value: `${f.beijing} (UTC+8)` },
    { label: 'UTC', value: f.utc },
    { label: 'ISO 8601', value: f.iso },
    { label: 'ISO (UTC+8)', value: f.isoLocalOffset },
    { label: 'RFC 2822', value: f.rfc2822 },
    { label: '相对现在', value: f.relative },
  ];
}

export function formatsToText(f: TimestampFormats): string {
  return formatsToRows(f)
    .map((r) => `${r.label}: ${r.value}`)
    .join('\n');
}

/** 兼容旧 API */
export interface TimestampResult {
  input: string;
  utc?: string;
  local?: string;
  utc8?: string;
  unixSeconds?: number;
  unixMillis?: number;
  error?: string;
  customOffsetHours?: number;
  custom?: string;
}

export function convertTimestamp(input: string, offsetHours = 8): TimestampResult {
  const raw = input.trim();
  if (!raw) return { input: raw, error: '请输入 Unix 时间戳或日期时间' };
  try {
    let date: Date;
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      const n = Number(raw);
      date = timestampToDate(n, Math.abs(n) < 1e12 ? 's' : 'ms');
    } else {
      date = parseDateString(raw, offsetHours);
    }
    const f = buildFormats(date);
    return {
      input: raw,
      unixSeconds: f.unixSeconds,
      unixMillis: f.unixMillis,
      utc: f.utc + ' UTC',
      utc8: f.beijing + ' UTC+8',
      local: date.toString(),
      customOffsetHours: offsetHours,
      custom: formatInOffset(date, offsetHours),
    };
  } catch (e) {
    return { input: raw, error: e instanceof Error ? e.message : '转换失败' };
  }
}

export function formatTimestampText(r: TimestampResult): string {
  if (r.error) return r.error;
  return [
    `Unix 秒:   ${r.unixSeconds}`,
    `Unix 毫秒: ${r.unixMillis}`,
    `UTC:       ${r.utc}`,
    `UTC+8:     ${r.utc8}`,
    r.customOffsetHours !== 8 && r.custom
      ? `UTC${r.customOffsetHours! >= 0 ? '+' : ''}${r.customOffsetHours}: ${r.custom}`
      : null,
    `本地:      ${r.local}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** 各语言获取当前时间戳示例（展示用） */
export const LANG_SNIPPETS: { lang: string; code: string }[] = [
  { lang: 'JavaScript', code: 'Math.floor(Date.now() / 1000)  // 秒\nDate.now()                   // 毫秒' },
  { lang: 'Python', code: 'import time\nint(time.time())       # 秒\nint(time.time()*1000)  # 毫秒' },
  { lang: 'Java', code: 'System.currentTimeMillis() / 1000  // 秒\nSystem.currentTimeMillis()         // 毫秒' },
  { lang: 'Go', code: 'time.Now().Unix()      // 秒\ntime.Now().UnixMilli() // 毫秒' },
  { lang: 'PHP', code: 'time();                    // 秒\nround(microtime(true)*1000) // 毫秒' },
  { lang: 'MySQL', code: 'SELECT UNIX_TIMESTAMP(NOW());' },
  { lang: 'Linux', code: 'date +%s' },
];
