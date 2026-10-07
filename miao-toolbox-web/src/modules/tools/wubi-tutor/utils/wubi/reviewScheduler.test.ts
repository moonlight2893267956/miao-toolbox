/**
 * 间隔重复调度器单测
 *
 * 覆盖：各级升级/降级、到期时间（注入固定 now）、空队列、重复答题幂等、上限裁剪。
 */

import { describe, it, expect } from 'vitest';
import {
  REVIEW_INTERVALS_MS,
  MAX_REVIEW_LEVEL,
  REVIEW_QUEUE_MAX,
  getIntervalMs,
  computeDueAt,
  createReviewItem,
  scheduleNext,
  isDue,
  isMastered,
  getDueItems,
  trimQueue,
  upsertItem,
  removeItem,
  removeMastered,
  summarize,
  applyAnswer,
  applyAnswers,
  buildAnswersFromResult,
} from './reviewScheduler';
import type { ReviewItem } from './storage';

const NOW = 1_700_000_000_000;

function makeItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    char: '啊',
    wrongCount: 1,
    lastSeen: NOW,
    nextReview: NOW,
    source: 'auto',
    level: 0,
    ...overrides,
  };
}

describe('间隔表', () => {
  it('共 6 级，间隔递增', () => {
    expect(REVIEW_INTERVALS_MS).toHaveLength(6);
    for (let i = 1; i < REVIEW_INTERVALS_MS.length; i++) {
      expect(REVIEW_INTERVALS_MS[i]).toBeGreaterThan(REVIEW_INTERVALS_MS[i - 1]);
    }
  });

  it('级别间隔符合 AC：10min/1d/3d/7d/15d/30d', () => {
    const MIN = 60 * 1000;
    const DAY = 24 * 60 * MIN;
    expect(REVIEW_INTERVALS_MS).toEqual([10 * MIN, DAY, 3 * DAY, 7 * DAY, 15 * DAY, 30 * DAY]);
  });

  it('getIntervalMs 钳制越界级别', () => {
    expect(getIntervalMs(-5)).toBe(REVIEW_INTERVALS_MS[0]);
    expect(getIntervalMs(99)).toBe(REVIEW_INTERVALS_MS[MAX_REVIEW_LEVEL]);
  });

  it('computeDueAt 基于注入的 now', () => {
    expect(computeDueAt(0, NOW)).toBe(NOW + REVIEW_INTERVALS_MS[0]);
    expect(computeDueAt(2, NOW)).toBe(NOW + REVIEW_INTERVALS_MS[2]);
  });
});

describe('createReviewItem', () => {
  it('新建条目为第 1 级（10 分钟后到期）', () => {
    const item = createReviewItem('啊', NOW);
    expect(item.level).toBe(0);
    expect(item.char).toBe('啊');
    expect(item.wrongCount).toBe(0);
    expect(item.nextReview).toBe(NOW + REVIEW_INTERVALS_MS[0]);
    expect(item.source).toBe('auto');
  });

  it('可指定来源为 manual', () => {
    expect(createReviewItem('啊', NOW, 'manual').source).toBe('manual');
  });
});

describe('scheduleNext — 升级', () => {
  it('答对升一级', () => {
    const item = makeItem({ level: 0 });
    const next = scheduleNext(item, true, NOW);

    expect(next.level).toBe(1);
    expect(next.nextReview).toBe(NOW + REVIEW_INTERVALS_MS[1]);
  });

  it('连续答对逐级上升', () => {
    let item = makeItem({ level: 0 });
    const levels: number[] = [];
    for (let i = 0; i < 8; i++) {
      item = scheduleNext(item, true, NOW);
      levels.push(item.level!);
    }
    expect(levels).toEqual([1, 2, 3, 4, 5, 5, 5, 5]); // 封顶最高级
  });

  it('答对不增加错误次数', () => {
    const item = makeItem({ wrongCount: 3, level: 1 });
    expect(scheduleNext(item, true, NOW).wrongCount).toBe(3);
  });

  it('level 缺省视为 0', () => {
    const item = makeItem({ level: undefined });
    expect(scheduleNext(item, true, NOW).level).toBe(1);
  });
});

describe('scheduleNext — 降级', () => {
  it('答错回到第 1 级', () => {
    const item = makeItem({ level: 4 });
    const next = scheduleNext(item, false, NOW);

    expect(next.level).toBe(0);
    expect(next.nextReview).toBe(NOW + REVIEW_INTERVALS_MS[0]);
  });

  it('答错累加错误次数', () => {
    const item = makeItem({ wrongCount: 2, level: 3 });
    expect(scheduleNext(item, false, NOW).wrongCount).toBe(3);
  });

  it('已在第 1 级答错仍为第 1 级', () => {
    const item = makeItem({ level: 0 });
    expect(scheduleNext(item, false, NOW).level).toBe(0);
  });

  it('不修改原条目（不可变）', () => {
    const item = makeItem({ level: 3, wrongCount: 1 });
    scheduleNext(item, false, NOW);
    expect(item.level).toBe(3);
    expect(item.wrongCount).toBe(1);
  });

  it('更新 lastSeen', () => {
    const item = makeItem({ lastSeen: 0 });
    expect(scheduleNext(item, true, NOW).lastSeen).toBe(NOW);
  });
});

describe('isDue / isMastered', () => {
  it('到期判定', () => {
    expect(isDue(makeItem({ nextReview: NOW - 1 }), NOW)).toBe(true);
    expect(isDue(makeItem({ nextReview: NOW }), NOW)).toBe(true);
    expect(isDue(makeItem({ nextReview: NOW + 1 }), NOW)).toBe(false);
  });

  it('达最高级视为已掌握', () => {
    expect(isMastered(makeItem({ level: MAX_REVIEW_LEVEL }))).toBe(true);
    expect(isMastered(makeItem({ level: MAX_REVIEW_LEVEL - 1 }))).toBe(false);
    expect(isMastered(makeItem({ level: undefined }))).toBe(false);
  });
});

describe('getDueItems', () => {
  it('空队列返回空数组', () => {
    expect(getDueItems([], NOW)).toEqual([]);
  });

  it('只取到期条目', () => {
    const items = [
      makeItem({ char: '未', nextReview: NOW + 1000 }),
      makeItem({ char: '到', nextReview: NOW - 1000 }),
    ];
    const due = getDueItems(items, NOW);
    expect(due).toHaveLength(1);
    expect(due[0].char).toBe('到');
  });

  it('按到期时间升序，同到期按错误次数降序', () => {
    const items = [
      makeItem({ char: 'A', nextReview: NOW - 500, wrongCount: 1 }),
      makeItem({ char: 'B', nextReview: NOW - 1000, wrongCount: 1 }),
      makeItem({ char: 'C', nextReview: NOW - 500, wrongCount: 9 }),
    ];
    const due = getDueItems(items, NOW);
    expect(due.map((d) => d.char)).toEqual(['B', 'C', 'A']);
  });

  it('不修改原数组', () => {
    const items = [
      makeItem({ char: 'A', nextReview: NOW + 1000 }),
      makeItem({ char: 'B', nextReview: NOW - 1000 }),
    ];
    const before = items.map((i) => i.char);
    getDueItems(items, NOW);
    expect(items.map((i) => i.char)).toEqual(before);
  });
});

describe('trimQueue — 上限裁剪', () => {
  it('未超上限时原样返回', () => {
    const items = [makeItem({ char: 'A' }), makeItem({ char: 'B' })];
    expect(trimQueue(items, 500)).toHaveLength(2);
  });

  it('超上限时保留优先级最高的 N 条', () => {
    const items: ReviewItem[] = [];
    for (let i = 0; i < 600; i++) {
      items.push(makeItem({ char: `字${i}`, nextReview: NOW + i * 1000 }));
    }

    const trimmed = trimQueue(items, REVIEW_QUEUE_MAX);
    expect(trimmed).toHaveLength(REVIEW_QUEUE_MAX);
    // 到期最早（i=0）应被保留
    expect(trimmed[0].char).toBe('字0');
    // 到期最晚的应被裁掉
    expect(trimmed.some((it) => it.char === '字599')).toBe(false);
  });

  it('默认上限为 500', () => {
    expect(REVIEW_QUEUE_MAX).toBe(500);
  });
});

describe('upsertItem — 幂等', () => {
  it('按字去重：重复加入不产生两条', () => {
    let items: ReviewItem[] = [];
    items = upsertItem(items, createReviewItem('啊', NOW));
    items = upsertItem(items, createReviewItem('啊', NOW + 1000));

    expect(items).toHaveLength(1);
    expect(items[0].char).toBe('啊');
  });

  it('重复加入保留较大错误次数', () => {
    let items: ReviewItem[] = [makeItem({ char: '啊', wrongCount: 5 })];
    items = upsertItem(items, createReviewItem('啊', NOW));

    expect(items).toHaveLength(1);
    expect(items[0].wrongCount).toBe(5);
  });

  it('不同字分别加入', () => {
    let items: ReviewItem[] = [];
    items = upsertItem(items, createReviewItem('啊', NOW));
    items = upsertItem(items, createReviewItem('的', NOW));

    expect(items).toHaveLength(2);
  });
});

describe('removeItem / removeMastered', () => {
  it('按字移除', () => {
    const items = [makeItem({ char: '啊' }), makeItem({ char: '的' })];
    expect(removeItem(items, '啊').map((i) => i.char)).toEqual(['的']);
  });

  it('移除已掌握条目', () => {
    const items = [
      makeItem({ char: '掌握', level: MAX_REVIEW_LEVEL }),
      makeItem({ char: '未掌握', level: 1 }),
    ];
    expect(removeMastered(items).map((i) => i.char)).toEqual(['未掌握']);
  });
});

describe('summarize', () => {
  it('空队列统计全为 0', () => {
    expect(summarize([], NOW)).toEqual({ total: 0, due: 0, mastered: 0 });
  });

  it('正确统计总数 / 待复习 / 已掌握', () => {
    const items = [
      makeItem({ char: 'A', nextReview: NOW - 1, level: 0 }),
      makeItem({ char: 'B', nextReview: NOW + 1, level: 2 }),
      makeItem({ char: 'C', nextReview: NOW - 1, level: MAX_REVIEW_LEVEL }),
    ];

    const stats = summarize(items, NOW);
    expect(stats.total).toBe(3);
    expect(stats.due).toBe(2);
    expect(stats.mastered).toBe(1);
  });
});

describe('applyAnswer — 幂等', () => {
  it('队列外的字答对不入队', () => {
    const items: ReviewItem[] = [];
    expect(applyAnswer(items, '啊', true, NOW)).toHaveLength(0);
  });

  it('队列外的字答错自动入队', () => {
    const items = applyAnswer([], '啊', false, NOW);
    expect(items).toHaveLength(1);
    expect(items[0].char).toBe('啊');
    expect(items[0].level).toBe(0);
  });

  it('队列内的字答对升级且不新增条目', () => {
    const items = [makeItem({ char: '啊', level: 0 })];
    const next = applyAnswer(items, '啊', true, NOW);

    expect(next).toHaveLength(1);
    expect(next[0].level).toBe(1);
  });

  it('队列内的字答错降级', () => {
    const items = [makeItem({ char: '啊', level: 3 })];
    const next = applyAnswer(items, '啊', false, NOW);

    expect(next).toHaveLength(1);
    expect(next[0].level).toBe(0);
  });

  it('重复作答同一字始终只有一条', () => {
    let items: ReviewItem[] = [];
    items = applyAnswer(items, '啊', false, NOW);
    items = applyAnswer(items, '啊', true, NOW);
    items = applyAnswer(items, '啊', true, NOW);
    items = applyAnswer(items, '啊', false, NOW);

    expect(items).toHaveLength(1);
  });

  it('不修改原数组', () => {
    const items = [makeItem({ char: '啊', level: 2 })];
    applyAnswer(items, '啊', true, NOW);
    expect(items[0].level).toBe(2);
  });
});

describe('applyAnswers — 批量回写（回归）', () => {
  it('一轮多个字全部生效', () => {
    const items = [
      makeItem({ char: 'A', level: 0 }),
      makeItem({ char: 'B', level: 0 }),
      makeItem({ char: 'C', level: 0 }),
    ];

    const next = applyAnswers(items, [
      { char: 'A', correct: true },
      { char: 'B', correct: false },
      { char: 'C', correct: true },
    ], NOW);

    // 关键回归点：不能只有最后一个字生效
    expect(next.find((i) => i.char === 'A')!.level).toBe(1);
    expect(next.find((i) => i.char === 'B')!.level).toBe(0);
    expect(next.find((i) => i.char === 'C')!.level).toBe(1);
  });

  it('空数组原样返回', () => {
    const items = [makeItem({ char: 'A' })];
    expect(applyAnswers(items, [], NOW)).toBe(items);
  });

  it('与逐条顺序调用结果一致（无闭包快照问题）', () => {
    const base = [
      makeItem({ char: 'A', level: 2 }),
      makeItem({ char: 'B', level: 3 }),
    ];
    const answers = [
      { char: 'A', correct: true },
      { char: 'B', correct: false },
    ];

    // 逐条：每步都基于上一步的结果累积
    let sequential = base;
    for (const a of answers) {
      sequential = applyAnswer(sequential, a.char, a.correct, NOW);
    }

    const batched = applyAnswers(base, answers, NOW);

    expect(batched.map((i) => [i.char, i.level]))
      .toEqual(sequential.map((i) => [i.char, i.level]));
  });

  it('批量中答错的新字自动入队', () => {
    const next = applyAnswers([], [
      { char: '新', correct: false },
      { char: '对', correct: true },
    ], NOW);

    expect(next).toHaveLength(1);
    expect(next[0].char).toBe('新');
  });
});

describe('buildAnswersFromResult', () => {
  it('按 wrongChars 标记对错', () => {
    const answers = buildAnswersFromResult(['啊', '的', '工'], ['的']);

    expect(answers).toEqual([
      { char: '啊', correct: true },
      { char: '的', correct: false },
      { char: '工', correct: true },
    ]);
  });

  it('全部答对', () => {
    const answers = buildAnswersFromResult(['啊', '的'], []);
    expect(answers.every((a) => a.correct)).toBe(true);
  });

  it('空输入返回空数组', () => {
    expect(buildAnswersFromResult([], ['啊'])).toEqual([]);
  });
});
