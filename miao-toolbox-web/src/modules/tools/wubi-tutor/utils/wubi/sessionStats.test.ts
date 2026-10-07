import { describe, it, expect } from 'vitest';
import {
  toSummary,
  compareWithLast,
  hasAnyPersonalBest,
  recordModeResult,
  formatDelta,
  deltaTrend,
  type ModeRecords,
  type ModeRecord,
} from './sessionStats';
import type { SessionResult } from './session';

const NOW = 1_700_000_000_000;

function makeResult(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    totalQuestions: 20,
    correctQuestions: 18,
    wrongQuestions: 2,
    correctChars: 18,
    totalKeystrokes: 80,
    errorKeystrokes: 6,
    wrongChars: ['好', '的'],
    attemptedChars: [],
    wrongKeys: ['f'],
    keyErrors: [],
    accuracy: 0.9,
    speedPerMinute: 40,
    maxCombo: 12,
    validKeystrokeRate: 0.925,
    durationSec: 30,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<ModeRecord> = {}): ModeRecord {
  const base = toSummary(makeResult(), NOW);
  return {
    last: base,
    best: base,
    sessions: 3,
    ...overrides,
  };
}

// ─── 归一 ────────────────────────────────────────────────

describe('toSummary', () => {
  it('复制全部指标并写入时间戳', () => {
    const summary = toSummary(makeResult(), NOW);

    expect(summary.accuracy).toBe(0.9);
    expect(summary.speedPerMinute).toBe(40);
    expect(summary.totalKeystrokes).toBe(80);
    expect(summary.at).toBe(NOW);
  });
});

// ─── 对比 ────────────────────────────────────────────────

describe('compareWithLast', () => {
  it('首次练习无对比基准', () => {
    const cmp = compareWithLast(toSummary(makeResult(), NOW), undefined);

    expect(cmp.isFirst).toBe(true);
    expect(cmp.speedDelta).toBeNull();
    expect(cmp.accuracyDelta).toBeNull();
    expect(cmp.personalBest).toEqual({
      speed: false, accuracy: false, validRate: false, maxCombo: false,
    });
  });

  it('计算速度与准确率差值', () => {
    const prev = makeRecord(); // speed 40, accuracy 0.9
    const current = toSummary(makeResult({ speedPerMinute: 55, accuracy: 0.95 }), NOW);

    const cmp = compareWithLast(current, prev);
    expect(cmp.isFirst).toBe(false);
    expect(cmp.speedDelta).toBe(15);
    expect(cmp.accuracyDelta).toBeCloseTo(0.05, 6);
  });

  it('成绩下滑时差值为负', () => {
    const prev = makeRecord();
    const current = toSummary(makeResult({ speedPerMinute: 30 }), NOW);

    expect(compareWithLast(current, prev).speedDelta).toBe(-10);
  });

  it('刷新个人最佳逐项判定', () => {
    const prev = makeRecord({ best: toSummary(makeResult({ speedPerMinute: 50, maxCombo: 30 }), NOW) });

    // 速度 55 > 50 ✓，连击 12 < 30 ✗
    const cmp = compareWithLast(toSummary(makeResult({ speedPerMinute: 55, maxCombo: 12 }), NOW), prev);

    expect(cmp.personalBest.speed).toBe(true);
    expect(cmp.personalBest.maxCombo).toBe(false);
  });

  it('与最佳持平不算刷新', () => {
    const prev = makeRecord();
    const cmp = compareWithLast(toSummary(makeResult(), NOW), prev); // 完全相同

    expect(hasAnyPersonalBest(cmp.personalBest)).toBe(false);
  });

  it('hasAnyPersonalBest 任一为真即真', () => {
    expect(hasAnyPersonalBest({ speed: false, accuracy: true, validRate: false, maxCombo: false })).toBe(true);
    expect(hasAnyPersonalBest({ speed: false, accuracy: false, validRate: false, maxCombo: false })).toBe(false);
  });
});

// ─── 写入 ────────────────────────────────────────────────

describe('recordModeResult', () => {
  it('首次写入建立记录', () => {
    const records = recordModeResult({}, 'char-code', toSummary(makeResult(), NOW));
    const rec = records['char-code'];

    expect(rec.sessions).toBe(1);
    expect(rec.last.speedPerMinute).toBe(40);
    expect(rec.best.speedPerMinute).toBe(40);
  });

  it('累加练习次数', () => {
    const first = recordModeResult({}, 'char-code', toSummary(makeResult(), NOW));
    const second = recordModeResult(first, 'char-code', toSummary(makeResult(), NOW + 1000));

    expect(second['char-code'].sessions).toBe(2);
  });

  it('last 恒为本次，best 取历史最优', () => {
    const first = recordModeResult({}, 'char-code', toSummary(makeResult({ speedPerMinute: 60 }), NOW));
    const second = recordModeResult(first, 'char-code', toSummary(makeResult({ speedPerMinute: 35 }), NOW + 1000));

    expect(second['char-code'].last.speedPerMinute).toBe(35);
    expect(second['char-code'].best.speedPerMinute).toBe(60);
  });

  it('不修改原对象（纯函数）', () => {
    const original: ModeRecords = {};
    recordModeResult(original, 'char-code', toSummary(makeResult(), NOW));
    expect(original).toEqual({});
  });

  it('不同模式互不影响', () => {
    const a = recordModeResult({}, 'char-code', toSummary(makeResult(), NOW));
    const b = recordModeResult(a, 'article', toSummary(makeResult({ speedPerMinute: 20 }), NOW));

    expect(Object.keys(b).sort()).toEqual(['article', 'char-code']);
    expect(b['char-code'].last.speedPerMinute).toBe(40);
  });
});

// ─── 展示辅助 ────────────────────────────────────────────

describe('formatDelta', () => {
  it('正数带 + 号', () => {
    expect(formatDelta(15, 0, ' 字/分')).toBe('+15 字/分');
  });

  it('负数保留 − 号', () => {
    expect(formatDelta(-8, 0)).toBe('-8');
  });

  it('零不显示符号', () => {
    expect(formatDelta(0, 0)).toBe('0');
  });

  it('极小的负数四舍五入后不显示 -0', () => {
    expect(formatDelta(-0.001, 0)).toBe('0');
  });

  it('null 返回占位符', () => {
    expect(formatDelta(null)).toBe('—');
  });

  it('按位数四舍五入', () => {
    expect(formatDelta(0.0512, 1)).toBe('+0.1');
  });
});

describe('deltaTrend', () => {
  it('上升', () => {
    expect(deltaTrend(3)).toBe('up');
  });

  it('下降', () => {
    expect(deltaTrend(-3)).toBe('down');
  });

  it('持平', () => {
    expect(deltaTrend(0)).toBe('flat');
  });

  it('无基准', () => {
    expect(deltaTrend(null)).toBe('none');
  });

  it('浮点误差视为持平', () => {
    expect(deltaTrend(1e-12)).toBe('flat');
  });
});
