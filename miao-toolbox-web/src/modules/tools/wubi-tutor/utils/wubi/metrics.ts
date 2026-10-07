/**
 * 实时指标计算纯函数
 *
 * 高频调用（每次按键后更新），必须为纯函数 + O(1) 或 O(n) 小常数。
 * 不做持久化，不读全局状态。
 */

// ─── 类型定义 ────────────────────────────────────────────

export interface KeystrokeRecord {
  /** 时间戳 (ms) */
  timestamp: number;
  /** 是否正确 */
  correct: boolean;
  /**
   * 本次按键折算的**完成量**，答错的键为 `undefined`。
   *
   * 口径：单字 / 简码 / 词组 / 文章折算成**字**，键位 / 字根类折算成**题**，
   * 均为「本题总量 ÷ 本题码长」——即按码长均摊到每一键。
   *
   * 为什么均摊而不是「完成那一刻才计」：
   * 文章模式整篇是一道大题，若只在完成时计入，整个练习过程的速度
   * 都会显示 0，最后一键又突然冲高（200 字 / 1 秒）。
   * 均摊后滑窗速度平滑且实时，且一个完整题目各键之和恰为本题总量。
   */
  typedChars?: number;
}

export interface MetricsSnapshot {
  /** 已用时（秒） */
  elapsedSec: number;
  /** 当前速度（字/分钟，最近 10 秒滑动窗口） */
  speedPerMinute: number;
  /** 当前准确率（0~1） */
  accuracy: number;
  /** 总击键数 */
  totalKeystrokes: number;
  /** 错误击键数 */
  errorKeystrokes: number;
  /** 连击正确数 */
  combo: number;
  /** 最大连击 */
  maxCombo: number;
  /** 有效击键率（正确击键 / 总击键） */
  validKeystrokeRate: number;
}

// ─── 纯函数 ──────────────────────────────────────────────

/** 滑动窗口大小（秒） */
const SPEED_WINDOW_SEC = 10;

/**
 * 计算滑动窗口速度（字/分钟）。
 *
 * 取最近 SPEED_WINDOW_SEC 秒内的正确击键数，
 * 推算每分钟的字符数。
 *
 * @param keystrokes 击键记录列表
 * @param now 当前时间戳
 * @returns 字/分钟
 */
export function calculateSpeed(keystrokes: KeystrokeRecord[], now: number): number {
  if (keystrokes.length === 0) return 0;
  if (!Number.isFinite(now) || now <= 0) return 0;

  const windowStart = now - SPEED_WINDOW_SEC * 1000;
  let produced = 0;
  let earliestInWindow = Number.POSITIVE_INFINITY;

  // 单次反向遍历：击键按时间递增，越出窗口即可提前退出
  for (let i = keystrokes.length - 1; i >= 0; i--) {
    const k = keystrokes[i];
    if (k.timestamp < windowStart) break;
    if (k.typedChars !== undefined) produced += k.typedChars;
    earliestInWindow = k.timestamp;
  }

  /*
   * 口径是「字/分钟」，所以必须数**产出的字数**，不能数正确击键数：
   * 一个四码字要敲 4 键，按击键算会把速度放大约 4 倍
   * （实际 15 字/分 被显示成 60）。
   *
   * 键位 / 字根类练习的 typedChars 按「题」折算（每键 1/码长），
   * 因此这里无需特判，读出来就是「题/分钟」。
   */
  if (produced === 0) return 0;

  // 观测时长取窗口内最早的击键到当前，最多 10 秒、至少 1 秒（避免开局虚高）
  const observedSec = Math.min(
    SPEED_WINDOW_SEC,
    Math.max(1, (now - earliestInWindow) / 1000),
  );

  return Math.round((produced / observedSec) * 60);
}

/**
 * 计算准确率。
 *
 * @param total 总击键数
 * @param errors 错误击键数
 * @returns 0~1
 */
export function calculateAccuracy(total: number, errors: number): number {
  if (total <= 0) return 0;
  return (total - errors) / total;
}

/**
 * 计算有效击键率。
 *
 * 与准确率相同，但语义上表示「有效输入占比」。
 */
export function calculateValidKeystrokeRate(total: number, errors: number): number {
  return calculateAccuracy(total, errors);
}

/**
 * 从击键记录列表计算完整指标快照。
 *
 * @param keystrokes 击键记录
 * @param startTime 会话开始时间
 * @param now 当前时间
 * @param combo 当前连击
 * @param maxCombo 最大连击
 * @returns 指标快照
 */
export function computeMetrics(
  keystrokes: KeystrokeRecord[],
  startTime: number,
  now: number,
  combo: number,
  maxCombo: number,
): MetricsSnapshot {
  const totalKeystrokes = keystrokes.length;
  const errorKeystrokes = keystrokes.filter((k) => !k.correct).length;
  /*
   * startTime 为 0 表示会话尚未开始。
   * 此时若无条件计算 `now - startTime`，会得到「Unix 纪元至今」的巨大值（约 20 亿秒）。
   */
  const elapsedSec = startTime > 0 ? Math.max(0, (now - startTime) / 1000) : 0;

  return {
    elapsedSec,
    speedPerMinute: calculateSpeed(keystrokes, now),
    accuracy: calculateAccuracy(totalKeystrokes, errorKeystrokes),
    totalKeystrokes,
    errorKeystrokes,
    combo,
    maxCombo,
    validKeystrokeRate: calculateValidKeystrokeRate(totalKeystrokes, errorKeystrokes),
  };
}

/**
 * 格式化时间（秒 → M:SS）。
 */
export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * 格式化百分比（0~1 → "85.0%"）。
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
