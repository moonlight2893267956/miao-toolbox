// Cron 编辑器 — 本地历史记录持久化（FR-18 / Story 2.3）
// localStorage 持久化，最多 50 条，按时间倒序，相同表达式+方言去重（挪到最前）。
// 为避免在测试 / SSR 等非浏览器环境直接触碰 localStorage，storage 以参数注入，
// 未注入时回退到默认 storage（浏览器环境为 window.localStorage，否则为 undefined）。
import type { CronDialect } from '../types';

/** 单条历史记录 */
export interface CronHistoryItem {
  /** 唯一 id（用于删除定位） */
  id: string;
  /** 表达式原文（已 trim） */
  expression: string;
  /** 所属方言，点击回填时需同步 */
  dialect: CronDialect;
  /** 写入时间戳（epoch ms），用于倒序与展示 */
  ts: number;
}

/** 历史记录上限（FR-18） */
export const HISTORY_MAX = 50;

const STORAGE_KEY = 'miao.cron.history.v1';

/** 取默认 storage；非浏览器环境返回 undefined（调用方静默 no-op） */
function defaultStorage(): Storage | undefined {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // 访问 localStorage 可能抛异常（隐私模式 / 禁用）
  }
  return undefined;
}

/** 生成唯一 id（优先 crypto.randomUUID，回退到随机数） */
function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 读取历史记录（解析失败或损坏时返回空数组） */
export function loadHistory(storage?: Storage): CronHistoryItem[] {
  const s = storage ?? defaultStorage();
  if (!s) return [];
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidItem).slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

/** 持久化整个列表 */
export function saveHistory(items: CronHistoryItem[], storage?: Storage): void {
  const s = storage ?? defaultStorage();
  if (!s) return;
  try {
    const safe = items.slice(0, HISTORY_MAX);
    s.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // 写入失败（配额 / 禁用）静默忽略
  }
}

/**
 * 新增一条历史记录：去重（相同 expression + dialect 视为同一条，移到最前并更新 ts），
 * 截断到 HISTORY_MAX，并持久化。返回最新列表。
 */
export function addHistoryItem(
  expression: string,
  dialect: CronDialect,
  storage?: Storage,
): CronHistoryItem[] {
  const trimmed = expression.trim();
  if (!trimmed) return loadHistory(storage);

  const items = loadHistory(storage).filter(
    (it) => !(it.expression === trimmed && it.dialect === dialect),
  );
  const next: CronHistoryItem = {
    id: genId(),
    expression: trimmed,
    dialect,
    ts: Date.now(),
  };
  const result = [next, ...items].slice(0, HISTORY_MAX);
  saveHistory(result, storage);
  return result;
}

/** 删除单条记录，返回最新列表 */
export function removeHistoryItem(id: string, storage?: Storage): CronHistoryItem[] {
  const result = loadHistory(storage).filter((it) => it.id !== id);
  saveHistory(result, storage);
  return result;
}

/** 清空全部历史，返回空列表 */
export function clearHistory(storage?: Storage): CronHistoryItem[] {
  const s = storage ?? defaultStorage();
  if (s) {
    try {
      s.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return [];
}

/** 校验单条结构是否合法（用于过滤损坏数据） */
function isValidItem(v: unknown): v is CronHistoryItem {
  if (!v || typeof v !== 'object') return false;
  const it = v as Record<string, unknown>;
  return (
    typeof it.id === 'string' &&
    typeof it.expression === 'string' &&
    (it.dialect === 'linux5' || it.dialect === 'spring6') &&
    typeof it.ts === 'number'
  );
}
