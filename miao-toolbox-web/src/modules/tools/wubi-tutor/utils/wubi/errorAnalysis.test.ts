import { describe, it, expect } from 'vitest';
import {
  countByActualKey,
  countByExpectedKey,
  computeHeatLevel,
  buildHeatmap,
  buildConfusionPairs,
  mergeWrongChars,
  analyzeErrors,
  recentWindowLabel,
  DEFAULT_RECENT_DAYS,
} from './errorAnalysis';

describe('recentWindowLabel — 窗口文案随参数变化（回归：曾写死「近 7 天」）', () => {
  it('默认 7 天', () => {
    expect(recentWindowLabel()).toBe('近 7 天');
    expect(DEFAULT_RECENT_DAYS).toBe(7);
  });

  it('窗口变了，文案跟着变（这才是它存在的意义）', () => {
    expect(recentWindowLabel(14)).toBe('近 14 天');
    expect(recentWindowLabel(30)).toBe('近 30 天');
  });
});
import type { KeyError } from './session';
import type { ReviewItem } from './storage';

const NOW = new Date('2026-09-16T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

/** 构造一条错误配对 */
const err = (expected: string, actual: string): KeyError => ({ expected, actual });

/** 构造一条复习条目 */
const review = (char: string, wrongCount: number, lastSeen = NOW): ReviewItem => ({
  char,
  wrongCount,
  lastSeen,
  nextReview: lastSeen,
  source: 'auto',
});

// ─── 键位计数 ────────────────────────────────────────────

describe('countByActualKey', () => {
  it('按实际按键累计次数', () => {
    const counts = countByActualKey([err('g', 'f'), err('g', 'f'), err('h', 'j')]);
    expect(counts).toEqual({ f: 2, j: 1 });
  });

  it('空输入返回空对象', () => {
    expect(countByActualKey([])).toEqual({});
  });

  it('忽略缺少 actual 的脏数据', () => {
    const counts = countByActualKey([{ expected: 'g', actual: '' }]);
    expect(counts).toEqual({});
  });
});

describe('countByExpectedKey', () => {
  it('按期望按键累计次数', () => {
    const counts = countByExpectedKey([err('g', 'f'), err('g', 'h'), err('d', 's')]);
    expect(counts).toEqual({ g: 2, d: 1 });
  });
});

// ─── 热力等级 ────────────────────────────────────────────

describe('computeHeatLevel', () => {
  it('无错误为 0 级', () => {
    expect(computeHeatLevel(0, 10)).toBe(0);
  });

  it('最大值为基准分档', () => {
    // max = 8 → 档位边界 2 / 4 / 6
    expect(computeHeatLevel(1, 8)).toBe(1);
    expect(computeHeatLevel(2, 8)).toBe(1);
    expect(computeHeatLevel(3, 8)).toBe(2);
    expect(computeHeatLevel(4, 8)).toBe(2);
    expect(computeHeatLevel(5, 8)).toBe(3);
    expect(computeHeatLevel(6, 8)).toBe(3);
    expect(computeHeatLevel(7, 8)).toBe(4);
    expect(computeHeatLevel(8, 8)).toBe(4);
  });

  it('maxCount 为 0 时返回 0 级', () => {
    expect(computeHeatLevel(5, 0)).toBe(0);
  });

  it('负数或非法输入返回 0 级', () => {
    expect(computeHeatLevel(-1, 10)).toBe(0);
    expect(computeHeatLevel(3, -5)).toBe(0);
  });
});

describe('buildHeatmap', () => {
  it('生成键位 → 等级映射', () => {
    const heat = buildHeatmap([err('a', 's'), err('a', 's'), err('a', 's'), err('d', 'f')]);
    expect(heat.s).toBe(4); // max = 3，1/1 → 最高档
    expect(heat.f).toBe(2); // 1/3 ≈ 0.33 → 落在 (0.25, 0.5] 第二档
  });

  it('空输入返回空映射', () => {
    expect(buildHeatmap([])).toEqual({});
  });
});

// ─── 易混字根对 ──────────────────────────────────────────

describe('buildConfusionPairs', () => {
  it('生成期望/实际键名与次数', () => {
    const pairs = buildConfusionPairs([err('g', 'f'), err('g', 'f'), err('h', 'j')]);

    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({
      expectedKey: 'g',
      actualKey: 'f',
      expectedGlyph: '王',
      actualGlyph: '土',
      count: 2,
    });
    expect(pairs[1].count).toBe(1);
  });

  it('按次数降序排列', () => {
    const pairs = buildConfusionPairs([
      err('g', 'f'),
      err('h', 'j'), err('h', 'j'), err('h', 'j'),
      err('d', 's'), err('d', 's'),
    ]);

    expect(pairs.map((p) => p.count)).toEqual([3, 2, 1]);
  });

  it('忽略期望与实际相同的记录', () => {
    expect(buildConfusionPairs([err('g', 'g')])).toEqual([]);
  });

  it('limit 截断 Top N', () => {
    const pairs = buildConfusionPairs(
      [err('g', 'f'), err('h', 'j'), err('d', 's')],
      2,
    );
    expect(pairs).toHaveLength(2);
  });

  it('未知键回退为大写字母', () => {
    const pairs = buildConfusionPairs([err('zz', 'yy')]);
    expect(pairs[0].expectedGlyph).toBe('ZZ');
  });

  it('空输入返回空数组', () => {
    expect(buildConfusionPairs([])).toEqual([]);
  });
});

// ─── 错字清单 ────────────────────────────────────────────

describe('mergeWrongChars', () => {
  it('合并本次与近期错字并去重', () => {
    const entries = mergeWrongChars(
      ['好'],
      [review('好', 3), review('的', 2)],
      NOW,
    );

    const byChar = Object.fromEntries(entries.map((e) => [e.char, e]));
    expect(entries).toHaveLength(2);
    expect(byChar['好']).toEqual({ char: '好', inCurrent: true, recentCount: 3 });
    expect(byChar['的']).toEqual({ char: '的', inCurrent: false, recentCount: 2 });
  });

  it('本次错字优先排序', () => {
    const entries = mergeWrongChars(
      ['乙'],
      [review('甲', 99)],
      NOW,
    );

    expect(entries.map((e) => e.char)).toEqual(['乙', '甲']);
  });

  it('本次之后按近期次数降序', () => {
    const entries = mergeWrongChars(
      [],
      [review('甲', 1), review('乙', 9), review('丙', 5)],
      NOW,
    );

    expect(entries.map((e) => e.char)).toEqual(['乙', '丙', '甲']);
  });

  it('次数相同时按字符升序（稳定）', () => {
    const entries = mergeWrongChars([], [review('丙', 2), review('甲', 2)], NOW);
    expect(entries.map((e) => e.char)).toEqual(['丙', '甲'].sort((a, b) => a.localeCompare(b)));
  });

  it('过滤 7 天窗口外的条目', () => {
    const entries = mergeWrongChars(
      [],
      [review('旧', 5, NOW - 8 * DAY), review('新', 1, NOW - 6 * DAY)],
      NOW,
    );

    expect(entries.map((e) => e.char)).toEqual(['新']);
  });

  it('窗口边界（恰好 7 天前）保留', () => {
    const entries = mergeWrongChars([], [review('边', 1, NOW - 7 * DAY)], NOW);
    expect(entries).toHaveLength(1);
  });

  it('自定义窗口天数生效', () => {
    const entries = mergeWrongChars([], [review('三', 1, NOW - 2 * DAY)], NOW, 1);
    expect(entries).toEqual([]);
  });

  it('空输入返回空数组', () => {
    expect(mergeWrongChars([], [], NOW)).toEqual([]);
  });

  it('忽略空字符串', () => {
    expect(mergeWrongChars(['', '好'], [review('', 3)], NOW).map((e) => e.char)).toEqual(['好']);
  });
});

// ─── 汇总 ────────────────────────────────────────────────

describe('analyzeErrors', () => {
  it('result 为 null 时返回全空结构', () => {
    const summary = analyzeErrors(null, [], { now: NOW });

    expect(summary.totalErrors).toBe(0);
    expect(summary.confusionPairs).toEqual([]);
    expect(summary.wrongChars).toEqual([]);
    expect(summary.byActualKey).toEqual({});
  });

  it('一次性产出四类结果', () => {
    const summary = analyzeErrors(
      { wrongChars: ['好'], keyErrors: [err('g', 'f'), err('g', 'f')] },
      [review('的', 2)],
      { now: NOW },
    );

    expect(summary.totalErrors).toBe(2);
    expect(summary.byActualKey).toEqual({ f: 2 });
    expect(summary.byExpectedKey).toEqual({ g: 2 });
    expect(summary.confusionPairs[0].expectedGlyph).toBe('王');
    expect(summary.wrongChars.map((w) => w.char)).toEqual(['好', '的']);
  });

  it('pairLimit 选项生效', () => {
    const summary = analyzeErrors(
      { wrongChars: [], keyErrors: [err('g', 'f'), err('h', 'j')] },
      [],
      { now: NOW, pairLimit: 1 },
    );

    expect(summary.confusionPairs).toHaveLength(1);
  });
});
