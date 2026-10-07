/**
 * 指标计算纯函数单测
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSpeed,
  calculateAccuracy,
  calculateValidKeystrokeRate,
  computeMetrics,
  formatTime,
  formatPercent,
  type KeystrokeRecord,
} from './metrics';

const NOW = 1000000; // 固定时间戳便于测试

/**
 * 构造击键记录。
 *
 * 第 3 项为「本次按键折算的完成量」（按码长均摊后的值）：
 * 省略 = 答错，不计入速度。
 */
function makeKeystrokes(records: [number, boolean, number?][]): KeystrokeRecord[] {
  return records.map(([ts, correct, typedChars]) => ({
    timestamp: ts,
    correct,
    typedChars,
  }));
}

describe('calculateSpeed', () => {
  it('空列表返回 0', () => {
    expect(calculateSpeed([], NOW)).toBe(0);
  });

  it('最近 10 秒内完成的字数计入速度', () => {
    // 5 秒内完成 20 个字 → 20 / 5 * 60 = 240 字/分
    const keystrokes = makeKeystrokes([
      [NOW - 5000, true, 1], [NOW - 4800, true, 1], [NOW - 4600, true, 1], [NOW - 4400, true, 1],
      [NOW - 4200, true, 1], [NOW - 4000, true, 1], [NOW - 3800, true, 1], [NOW - 3600, true, 1],
      [NOW - 3400, true, 1], [NOW - 3200, true, 1], [NOW - 3000, true, 1], [NOW - 2800, true, 1],
      [NOW - 2600, true, 1], [NOW - 2400, true, 1], [NOW - 2200, true, 1], [NOW - 2000, true, 1],
      [NOW - 1800, true, 1], [NOW - 1600, true, 1], [NOW - 1400, true, 1], [NOW - 1200, true, 1],
    ]);
    expect(calculateSpeed(keystrokes, NOW)).toBe(240);
  });

  it('10 秒之前完成的字不计入', () => {
    const keystrokes = makeKeystrokes([
      [NOW - 15000, true, 1], // 超出窗口
      [NOW - 5000, true, 1],  // 窗口内
    ]);
    // 窗口内只有 1 字，观测 5 秒 → 12 字/分
    expect(calculateSpeed(keystrokes, NOW)).toBe(12);
  });

  it('错误击键不计入速度', () => {
    const keystrokes = makeKeystrokes([
      [NOW - 1000, false],
      [NOW - 800, false],
    ]);
    const speed = calculateSpeed(keystrokes, NOW);
    expect(speed).toBe(0);
  });

  it('观测时长基于「窗口内最早击键」而非首次击键（回归）', () => {
    // 首次击键在 60 秒前（远早于窗口），窗口内仅最近 5 秒有击键
    const keystrokes = makeKeystrokes([
      [NOW - 60000, true, 1], // 窗口外，不应影响观测时长
      [NOW - 5000, true, 1],
      [NOW - 4000, true, 1],
      [NOW - 3000, true, 1],
      [NOW - 2000, true, 1],
      [NOW - 1000, true, 1],
    ]);

    // 窗口内 5 个字 / 观测 5 秒 → 60 字/分
    expect(calculateSpeed(keystrokes, NOW)).toBe(60);
  });

  it('观测时长上限为滑动窗口大小（10 秒）', () => {
    // 10 秒窗口内均匀分布 20 个字 → 20/10*60 = 120
    const records: [number, boolean, number?][] = [];
    for (let i = 0; i < 20; i++) {
      records.push([NOW - 10000 + i * 500, true, 1]);
    }
    expect(calculateSpeed(makeKeystrokes(records), NOW)).toBe(120);
  });

  it('四码字按「字」计，不按击键数计（回归）', () => {
    /*
     * 核心回归点：一个四码字要敲 4 键，合计只算 1 个字。
     * 旧实现数「正确击键」，会把速度显示成实际的 4 倍
     * （实际 15 字/分 被显示成 60）。
     */
    const keystrokes = makeKeystrokes([
      [NOW - 1000, true, 0.25], // 四码字：每键 1/4 字
      [NOW - 800, true, 0.25],
      [NOW - 600, true, 0.25],
      [NOW - 400, true, 0.25],
    ]);

    // 合计 1 字 / 观测 1 秒 = 60；若按击键数算会得到 240
    expect(calculateSpeed(keystrokes, NOW)).toBe(60);
  });

  it('四字词组按词组长度计（码长 4 → 每键 1 字）', () => {
    const keystrokes = makeKeystrokes([
      [NOW - 4000, true, 1],
      [NOW - 3000, true, 1],
      [NOW - 2000, true, 1],
      [NOW - 1000, true, 1],
    ]);

    // 4 字 / 观测 4 秒 = 60
    expect(calculateSpeed(keystrokes, NOW)).toBe(60);
  });

  it('答错的击键（typedChars 为 undefined）不计入', () => {
    const keystrokes = makeKeystrokes([
      [NOW - 1000, true, 1],
      [NOW - 900, false],
      [NOW - 800, false],
    ]);

    // 只有第 1 键产出 1 字 / 观测 1 秒 = 60
    expect(calculateSpeed(keystrokes, NOW)).toBe(60);
  });

  it('键位 / 字根类题按「题」折算（码长 1 → 每键 1 题）', () => {
    // 5 秒内 5 键 → 5 题 / 5 秒 * 60 = 60 题/分（不是 0）
    const records: [number, boolean, number?][] = [];
    for (let i = 0; i < 5; i++) {
      records.push([NOW - 5000 + i * 1000, true, 1]);
    }

    expect(calculateSpeed(makeKeystrokes(records), NOW)).toBe(60);
  });

  it('文章模式全程都有速度（不均摊就会是 0）（回归）', () => {
    /*
     * 文章整篇是一道大题（码长上千）。若只在「完成那一刻」计入，
     * 整个练习过程的速度都会是 0，最后一键又突然冲高到几百字/分。
     * 按码长均摊后每一键都有产出。
     */
    const CHARS_PER_KEY = 0.5; // 500 字 ÷ 1000 键
    const keystrokes = makeKeystrokes([
      [NOW - 3000, true, CHARS_PER_KEY],
      [NOW - 2000, true, CHARS_PER_KEY],
      [NOW - 1000, true, CHARS_PER_KEY],
    ]);

    // 1.5 字 / 观测 3 秒 = 30
    expect(calculateSpeed(keystrokes, NOW)).toBe(30);
  });

  it('now 为 0（会话未开始）时返回 0（回归）', () => {
    const keystrokes = makeKeystrokes([[NOW - 1000, true]]);
    expect(calculateSpeed(keystrokes, 0)).toBe(0);
    expect(calculateSpeed(keystrokes, NaN)).toBe(0);
  });
});

describe('calculateAccuracy', () => {
  it('零击键返回 0', () => {
    expect(calculateAccuracy(0, 0)).toBe(0);
  });

  it('全对返回 1', () => {
    expect(calculateAccuracy(100, 0)).toBe(1);
  });

  it('90% 正确率', () => {
    expect(calculateAccuracy(100, 10)).toBe(0.9);
  });

  it('全错返回 0', () => {
    expect(calculateAccuracy(100, 100)).toBe(0);
  });

  it('负数容错（errors > total 不应出现，但不应崩溃）', () => {
    expect(calculateAccuracy(10, 15)).toBe(-0.5);
  });
});

describe('calculateValidKeystrokeRate', () => {
  it('与准确率相同', () => {
    expect(calculateValidKeystrokeRate(100, 10)).toBe(calculateAccuracy(100, 10));
  });

  it('零击键返回 0', () => {
    expect(calculateValidKeystrokeRate(0, 0)).toBe(0);
  });
});

describe('computeMetrics', () => {
  it('正确计算完整快照', () => {
    const startTime = NOW - 60000; // 1 分钟前
    const keystrokes = makeKeystrokes([
      [NOW - 50000, true],
      [NOW - 40000, true],
      [NOW - 30000, false],
      [NOW - 20000, true],
      [NOW - 10000, true],
    ]);

    const snapshot = computeMetrics(keystrokes, startTime, NOW, 3, 5);

    expect(snapshot.totalKeystrokes).toBe(5);
    expect(snapshot.errorKeystrokes).toBe(1);
    expect(snapshot.accuracy).toBe(0.8);
    expect(snapshot.elapsedSec).toBe(60);
    expect(snapshot.combo).toBe(3);
    expect(snapshot.maxCombo).toBe(5);
    expect(snapshot.validKeystrokeRate).toBe(0.8);
    expect(snapshot.speedPerMinute).toBeGreaterThanOrEqual(0);
  });

  it('空击键列表不崩溃', () => {
    const snapshot = computeMetrics([], NOW, NOW, 0, 0);
    expect(snapshot.totalKeystrokes).toBe(0);
    expect(snapshot.accuracy).toBe(0);
    expect(snapshot.speedPerMinute).toBe(0);
  });

  it('startTime=0（会话未开始）时 elapsedSec 为 0（回归）', () => {
    // 旧实现会算出 (Date.now() - 0)/1000 ≈ 20 亿秒，UI 显示「29826159:36」
    const snapshot = computeMetrics([], 0, NOW, 0, 0);
    expect(snapshot.elapsedSec).toBe(0);
  });

  it('startTime 正常时按差值计算', () => {
    const snapshot = computeMetrics([], NOW - 30000, NOW, 0, 0);
    expect(snapshot.elapsedSec).toBe(30);
  });
});

describe('formatTime', () => {
  it('0 秒 → 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('59 秒 → 0:59', () => {
    expect(formatTime(59)).toBe('0:59');
  });

  it('60 秒 → 1:00', () => {
    expect(formatTime(60)).toBe('1:00');
  });

  it('125 秒 → 2:05', () => {
    expect(formatTime(125)).toBe('2:05');
  });

  it('3600 秒 → 60:00', () => {
    expect(formatTime(3600)).toBe('60:00');
  });
});

describe('formatPercent', () => {
  it('0 → 0.0%', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('1 → 100.0%', () => {
    expect(formatPercent(1)).toBe('100.0%');
  });

  it('0.85 → 85.0%', () => {
    expect(formatPercent(0.85)).toBe('85.0%');
  });

  it('0.333 → 33.3%', () => {
    expect(formatPercent(0.333)).toBe('33.3%');
  });
});
