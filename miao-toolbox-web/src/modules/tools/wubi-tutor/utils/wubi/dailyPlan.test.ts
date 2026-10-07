import { describe, it, expect } from 'vitest';
import {
  buildDailyPlan,
  hasActivityToday,
  hasLessonActivityToday,
  type DailyPlanInput,
} from './dailyPlan';
import { PRACTICE_MODE_KEYS, lessonModeKey, type ModeRecords } from './sessionStats';

const TODAY = '2026-09-16';
const YESTERDAY = '2026-09-15';

/** 由日期键构造「本地正午」时间戳：任何时区下都稳定落在该本地日 */
function localNoon(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

/** 构造当日某模式的一次成绩记录 */
function withRecord(modeKey: string, day: string): ModeRecords {
  const at = localNoon(day);
  return {
    [modeKey]: {
      last: {
        totalQuestions: 20, correctQuestions: 18, correctChars: 18,
        totalKeystrokes: 80, errorKeystrokes: 6,
        accuracy: 0.9, speedPerMinute: 40, validKeystrokeRate: 0.925,
        maxCombo: 12, durationSec: 30, at,
      },
      best: {
        totalQuestions: 20, correctQuestions: 18, correctChars: 18,
        totalKeystrokes: 80, errorKeystrokes: 6,
        accuracy: 0.9, speedPerMinute: 40, validKeystrokeRate: 0.925,
        maxCombo: 12, durationSec: 30, at,
      },
      sessions: 1,
    },
  };
}

function makeInput(overrides: Partial<DailyPlanInput> = {}): DailyPlanInput {
  return {
    today: TODAY,
    dueReviewCount: 5,
    nextLesson: { id: 'lesson-g', key: 'g' },
    records: {},
    todayPracticeSec: 0,
    ...overrides,
  };
}

// ─── 活动判定 ────────────────────────────────────────────

describe('hasActivityToday', () => {
  it('今日有记录返回 true', () => {
    expect(hasActivityToday(withRecord('review', TODAY), ['review'], TODAY)).toBe(true);
  });

  // 时区回归：凌晨练习必须算作当天，否则今日计划不勾选
  it('本地凌晨的记录也算今日', () => {
    const [y, m, d] = TODAY.split('-').map(Number);
    const midnight = new Date(y, m - 1, d, 0, 30, 0).getTime();
    const records: ModeRecords = {
      review: {
        last: {
          totalQuestions: 1, correctQuestions: 1, correctChars: 1,
          totalKeystrokes: 1, errorKeystrokes: 0,
          accuracy: 1, speedPerMinute: 10, validKeystrokeRate: 1,
          maxCombo: 1, durationSec: 5, at: midnight,
        },
        best: {
          totalQuestions: 1, correctQuestions: 1, correctChars: 1,
          totalKeystrokes: 1, errorKeystrokes: 0,
          accuracy: 1, speedPerMinute: 10, validKeystrokeRate: 1,
          maxCombo: 1, durationSec: 5, at: midnight,
        },
        sessions: 1,
      },
    };

    expect(hasActivityToday(records, ['review'], TODAY)).toBe(true);
  });

  it('仅有昨日记录返回 false', () => {
    expect(hasActivityToday(withRecord('review', YESTERDAY), ['review'], TODAY)).toBe(false);
  });

  it('多个 key 任一命中即 true', () => {
    const records = withRecord('article', TODAY);
    expect(hasActivityToday(records, ['custom-article', 'article'], TODAY)).toBe(true);
  });

  it('空记录返回 false', () => {
    expect(hasActivityToday({}, ['review'], TODAY)).toBe(false);
  });

  it('不抛错于未知 key', () => {
    expect(hasActivityToday({}, ['not-exist'], TODAY)).toBe(false);
  });
});

describe('hasLessonActivityToday', () => {
  it('命中 lesson: 前缀的今日记录', () => {
    const records = withRecord(lessonModeKey('g', 'chars'), TODAY);
    expect(hasLessonActivityToday(records, TODAY)).toBe(true);
  });

  it('普通模式不计入关卡活动', () => {
    expect(hasLessonActivityToday(withRecord('char-code', TODAY), TODAY)).toBe(false);
  });

  it('关卡记录在昨天不算今日', () => {
    const records = withRecord(lessonModeKey('g', 'chars'), YESTERDAY);
    expect(hasLessonActivityToday(records, TODAY)).toBe(false);
  });
});

// ─── 计划生成 ────────────────────────────────────────────

describe('buildDailyPlan', () => {
  it('固定产出三项任务', () => {
    const plan = buildDailyPlan(makeInput());
    expect(plan.tasks.map((t) => t.id)).toEqual(['review', 'lesson', 'article']);
    expect(plan.totalCount).toBe(3);
  });

  it('全新用户三项全未完成', () => {
    const plan = buildDailyPlan(makeInput());

    expect(plan.completedCount).toBe(0);
    expect(plan.allDone).toBe(false);
  });

  it('复习任务：有待复习且今日未复习 → 未完成且可点击', () => {
    const plan = buildDailyPlan(makeInput({ dueReviewCount: 3 }));
    const review = plan.tasks.find((t) => t.id === 'review')!;

    expect(review.done).toBe(false);
    expect(review.actionable).toBe(true);
    expect(review.desc).toContain('3');
  });

  it('复习任务：无待复习 → 视为完成且不可点击（避免进入空队列）', () => {
    const plan = buildDailyPlan(makeInput({ dueReviewCount: 0 }));
    const review = plan.tasks.find((t) => t.id === 'review')!;

    expect(review.done).toBe(true);
    expect(review.actionable).toBe(false);
  });

  it('复习任务：今日已复习 → 完成（即使仍有待复习）', () => {
    const plan = buildDailyPlan(makeInput({
      dueReviewCount: 8,
      records: withRecord(PRACTICE_MODE_KEYS.review, TODAY),
    }));

    expect(plan.tasks.find((t) => t.id === 'review')!.done).toBe(true);
  });

  it('关卡任务：今日练过任意关卡环节 → 完成', () => {
    const plan = buildDailyPlan(makeInput({
      records: withRecord(lessonModeKey('g', 'input'), TODAY),
    }));

    expect(plan.tasks.find((t) => t.id === 'lesson')!.done).toBe(true);
  });

  it('关卡任务：全部通关后文案变化且不可点击', () => {
    const plan = buildDailyPlan(makeInput({ nextLesson: null }));
    const lesson = plan.tasks.find((t) => t.id === 'lesson')!;

    expect(lesson.actionable).toBe(false);
    expect(lesson.title).toContain('全部通关');
  });

  it('关卡任务：有下一关时标题带键位', () => {
    const plan = buildDailyPlan(makeInput());
    expect(plan.tasks.find((t) => t.id === 'lesson')!.title).toContain('G');
  });

  it('短文任务：今日练过 article 或 custom-article → 完成', () => {
    const a = buildDailyPlan(makeInput({ records: withRecord('article', TODAY) }));
    const b = buildDailyPlan(makeInput({ records: withRecord('custom-article', TODAY) }));

    expect(a.tasks.find((t) => t.id === 'article')!.done).toBe(true);
    expect(b.tasks.find((t) => t.id === 'article')!.done).toBe(true);
  });

  it('三项全部完成 → allDone', () => {
    const plan = buildDailyPlan(makeInput({
      dueReviewCount: 0,
      records: {
        ...withRecord(lessonModeKey('g', 'chars'), TODAY),
        ...withRecord('article', TODAY),
      },
    }));

    expect(plan.completedCount).toBe(3);
    expect(plan.allDone).toBe(true);
  });

  it('透出今日练习时长', () => {
    expect(buildDailyPlan(makeInput({ todayPracticeSec: 480 })).todayPracticeSec).toBe(480);
  });

  it('未完成时不产生任何负反馈字段（无警示/落后文案）', () => {
    const plan = buildDailyPlan(makeInput());
    const text = plan.tasks.map((t) => `${t.title}${t.desc}`).join(' ');

    expect(text).not.toMatch(/落后|失败|警告|必须|还没/);
  });
});
