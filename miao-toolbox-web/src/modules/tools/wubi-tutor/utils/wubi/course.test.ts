/**
 * 课程闯关纯函数单测
 *
 * 重点覆盖 AC 要求的边界：阈值 89.9%/90%、字数不足 20、重复通关取最优。
 */

import { describe, it, expect } from 'vitest';
import {
  PASS_ACCURACY,
  PASS_MIN_CHARS,
  INITIAL_COURSE_PROGRESS,
  evaluateLesson,
  lessonDoneChars,
  mergeLessonRecord,
  recordLessonResult,
  isLessonUnlocked,
  getLessonStatus,
  isCourseCompleted,
  isFreePracticeUnlocked,
  getZoneCoverage,
  getOverallCoverage,
  getNextLesson,
  resetCourseProgress,
  type CourseProgress,
} from './course';
import { LESSON_ORDER, TOTAL_LESSONS } from '../../data/lessons';
import type { SessionResult } from './session';

/*
 * 通关字数的口径回归。
 *
 * 背景：evaluateLesson 曾用 `totalQuestions`（题数）当「完成字数」，
 * 词组关卡因此被少算 2~6 倍；而 correctChars 对「字根认知 / 字根输入」
 * 环节恒为 0，直接替换又会让这两类关卡永远无法通关 —— 必须有回退。
 */
describe('lessonDoneChars — 以字为单位的口径', () => {
  it('有字数时用字数', () => {
    expect(lessonDoneChars(makeResult({ totalQuestions: 3, correctChars: 40 }))).toBe(40);
  });

  it('键位 / 字根类环节（correctChars = 0）回退到完成题数', () => {
    const result = makeResult({ totalQuestions: 25, correctChars: 0, accuracy: 0.96 });

    expect(lessonDoneChars(result)).toBe(25);
    const evaluation = evaluateLesson(result);
    expect(evaluation.charCountOk).toBe(true);
    expect(evaluation.passed).toBe(true);
  });

  it('词组关卡按词组长度累计：10 个二字词 = 20 字，刚好达标', () => {
    const result = makeResult({ totalQuestions: 10, correctChars: 20, accuracy: 1 });

    expect(evaluateLesson(result).charCountOk).toBe(true);
  });

  it('20 题但只有 19 字正确完成 → 字数不达标', () => {
    const result = makeResult({ totalQuestions: 20, correctChars: 19, accuracy: 1 });

    expect(evaluateLesson(result).charCountOk).toBe(false);
  });

  it('关卡记录也用同一口径（bestCharCount 与判定一致）', () => {
    const result = makeResult({ totalQuestions: 30, correctChars: 0, accuracy: 0.95 });
    const record = mergeLessonRecord(undefined, LESSON_ORDER[0].id, result, 1);

    // 回退到题数，而不是记成 0
    expect(record.bestCharCount).toBe(30);
  });
});

// 构造 SessionResult
function makeResult(overrides: Partial<SessionResult> = {}): SessionResult {
  const result: SessionResult = {
    totalQuestions: 25,
    correctQuestions: 24,
    wrongQuestions: 1,
    // 单字关卡的默认口径：1 题 = 1 字
    correctChars: 24,
    totalKeystrokes: 100,
    errorKeystrokes: 5,
    wrongChars: [],
    attemptedChars: [],
    wrongKeys: [],
    keyErrors: [],
    accuracy: 0.96,
    speedPerMinute: 40,
    maxCombo: 10,
    validKeystrokeRate: 0.95,
    durationSec: 60,
    ...overrides,
  };

  /*
   * 单字关卡默认 1 题 = 1 字，因此 correctChars 必须跟随 totalQuestions。
   *
   * 否则测试若只改 totalQuestions 来测「字数阈值边界」，
   * correctChars 会仍停在 24 → 本该不通过的用例意外通过，
   * 被测的那条分支就永远没被覆盖。
   */
  if (overrides.correctChars === undefined) {
    result.correctChars = result.totalQuestions;
  }

  return result;
}

const FIRST = LESSON_ORDER[0].id;
const SECOND = LESSON_ORDER[1].id;

describe('课程结构', () => {
  it('共 25 个关卡（5 区 × 5 键）', () => {
    expect(TOTAL_LESSONS).toBe(25);
    expect(LESSON_ORDER).toHaveLength(25);
  });

  it('每关含 3 个环节', () => {
    for (const lesson of LESSON_ORDER) {
      expect(lesson.stages).toHaveLength(3);
      expect(lesson.stages.map((s) => s.kind)).toEqual(['recognize', 'input', 'chars']);
    }
  });

  it('关卡顺序为横竖撇捺折', () => {
    expect(LESSON_ORDER.slice(0, 5).map((l) => l.id)).toEqual(['g', 'f', 'd', 's', 'a']);
    expect(LESSON_ORDER.slice(5, 10).map((l) => l.id)).toEqual(['h', 'j', 'k', 'l', 'm']);
    expect(LESSON_ORDER.slice(10, 15).map((l) => l.id)).toEqual(['t', 'r', 'e', 'w', 'q']);
    expect(LESSON_ORDER.slice(15, 20).map((l) => l.id)).toEqual(['y', 'u', 'i', 'o', 'p']);
    expect(LESSON_ORDER.slice(20, 25).map((l) => l.id)).toEqual(['n', 'b', 'v', 'c', 'x']);
  });
});

describe('evaluateLesson — 阈值边界', () => {
  it('恰好 90% 且 20 字 → 通过', () => {
    const result = evaluateLesson(makeResult({ accuracy: 0.9, totalQuestions: 20 }));
    expect(result.passed).toBe(true);
  });

  it('89.9% → 不通过', () => {
    const result = evaluateLesson(makeResult({ accuracy: 0.899, totalQuestions: 20 }));
    expect(result.passed).toBe(false);
    expect(result.accuracyOk).toBe(false);
    expect(result.reasons[0]).toContain('正确率');
  });

  it('90.1% → 通过', () => {
    const result = evaluateLesson(makeResult({ accuracy: 0.901, totalQuestions: 20 }));
    expect(result.passed).toBe(true);
  });

  it('19 字（差 1 个）→ 不通过', () => {
    const result = evaluateLesson(makeResult({ accuracy: 0.99, totalQuestions: 19 }));
    expect(result.passed).toBe(false);
    expect(result.charCountOk).toBe(false);
    expect(result.reasons[0]).toContain('19 字');
  });

  it('正确率与字数同时不达标 → 两条原因', () => {
    const result = evaluateLesson(makeResult({ accuracy: 0.5, totalQuestions: 5 }));
    expect(result.passed).toBe(false);
    expect(result.reasons).toHaveLength(2);
  });

  it('浮点容差：0.9 的等价表示不被误判', () => {
    // 24/20 之类的除算可能得到 0.8999999999999999
    const result = evaluateLesson(makeResult({ accuracy: 0.8999999999999999, totalQuestions: 20 }));
    expect(result.passed).toBe(true);
  });

  it('阈值为 90% / 20 字', () => {
    expect(PASS_ACCURACY).toBe(0.9);
    expect(PASS_MIN_CHARS).toBe(20);
  });
});

describe('mergeLessonRecord — 重复通关取最优', () => {
  it('首次记录', () => {
    const record = mergeLessonRecord(undefined, 'g', makeResult({ accuracy: 0.95, totalQuestions: 25 }), 1000);

    expect(record.lessonId).toBe('g');
    expect(record.passed).toBe(true);
    expect(record.bestAccuracy).toBe(0.95);
    expect(record.bestCharCount).toBe(25);
    expect(record.attempts).toBe(1);
  });

  it('成绩变差时保留历史最优', () => {
    const first = mergeLessonRecord(undefined, 'g', makeResult({ accuracy: 0.95, totalQuestions: 30, speedPerMinute: 50 }), 1000);
    const second = mergeLessonRecord(first, 'g', makeResult({ accuracy: 0.6, totalQuestions: 10, speedPerMinute: 20 }), 2000);

    expect(second.bestAccuracy).toBe(0.95);
    expect(second.bestCharCount).toBe(30);
    expect(second.bestSpeed).toBe(50);
    expect(second.attempts).toBe(2);
    expect(second.updatedAt).toBe(2000);
  });

  it('成绩变好时刷新最优', () => {
    const first = mergeLessonRecord(undefined, 'g', makeResult({ accuracy: 0.92, totalQuestions: 21 }), 1000);
    const second = mergeLessonRecord(first, 'g', makeResult({ accuracy: 0.99, totalQuestions: 40 }), 2000);

    expect(second.bestAccuracy).toBe(0.99);
    expect(second.bestCharCount).toBe(40);
  });

  it('已通关后失败不重置 passed', () => {
    const passed = mergeLessonRecord(undefined, 'g', makeResult({ accuracy: 0.95 }), 1000);
    expect(passed.passed).toBe(true);

    const failed = mergeLessonRecord(passed, 'g', makeResult({ accuracy: 0.3, totalQuestions: 2 }), 2000);
    expect(failed.passed).toBe(true);
  });

  it('首次未通过则 passed 为 false', () => {
    const record = mergeLessonRecord(undefined, 'g', makeResult({ accuracy: 0.5 }), 1000);
    expect(record.passed).toBe(false);
  });
});

describe('recordLessonResult', () => {
  it('写入指定关卡且不改动其他关卡', () => {
    let progress = INITIAL_COURSE_PROGRESS;
    progress = recordLessonResult(progress, 'g', makeResult({ accuracy: 0.95 }), 1000);
    progress = recordLessonResult(progress, 'f', makeResult({ accuracy: 0.5 }), 2000);

    expect(progress.lessons.g.passed).toBe(true);
    expect(progress.lessons.f.passed).toBe(false);
    expect(progress.lessons.d).toBeUndefined();
  });

  it('不修改原对象（不可变更新）', () => {
    const before: CourseProgress = { ...INITIAL_COURSE_PROGRESS, lessons: {} };
    recordLessonResult(before, 'g', makeResult(), 1000);
    expect(before.lessons.g).toBeUndefined();
  });
});

describe('解锁判定', () => {
  it('第一关默认解锁', () => {
    expect(isLessonUnlocked(INITIAL_COURSE_PROGRESS, FIRST)).toBe(true);
  });

  it('第二关默认锁定', () => {
    expect(isLessonUnlocked(INITIAL_COURSE_PROGRESS, SECOND)).toBe(false);
  });

  it('第一关通关后解锁第二关', () => {
    const progress = recordLessonResult(INITIAL_COURSE_PROGRESS, FIRST, makeResult({ accuracy: 0.95 }));
    expect(isLessonUnlocked(progress, SECOND)).toBe(true);
  });

  it('第一关未达标则第二关仍锁定', () => {
    const progress = recordLessonResult(INITIAL_COURSE_PROGRESS, FIRST, makeResult({ accuracy: 0.5 }));
    expect(isLessonUnlocked(progress, SECOND)).toBe(false);
  });

  it('自由模式下全部解锁', () => {
    const progress: CourseProgress = { freeMode: true, lessons: {} };
    for (const lesson of LESSON_ORDER) {
      expect(isLessonUnlocked(progress, lesson.id)).toBe(true);
    }
  });

  it('不存在的关卡返回 false', () => {
    expect(isLessonUnlocked(INITIAL_COURSE_PROGRESS, 'zzz')).toBe(false);
  });
});

describe('getLessonStatus', () => {
  it('未解锁 → locked', () => {
    expect(getLessonStatus(INITIAL_COURSE_PROGRESS, SECOND)).toBe('locked');
  });

  it('已解锁未通关 → in-progress', () => {
    expect(getLessonStatus(INITIAL_COURSE_PROGRESS, FIRST)).toBe('in-progress');
  });

  it('已通关 → passed', () => {
    const progress = recordLessonResult(INITIAL_COURSE_PROGRESS, FIRST, makeResult({ accuracy: 0.95 }));
    expect(getLessonStatus(progress, FIRST)).toBe('passed');
  });
});

describe('覆盖率', () => {
  it('初始整体覆盖率为 0/25', () => {
    const coverage = getOverallCoverage(INITIAL_COURSE_PROGRESS);
    expect(coverage.passed).toBe(0);
    expect(coverage.total).toBe(25);
    expect(coverage.rate).toBe(0);
  });

  it('通关 2 关后覆盖率为 2/25', () => {
    let progress = INITIAL_COURSE_PROGRESS;
    progress = recordLessonResult(progress, 'g', makeResult({ accuracy: 0.95 }));
    progress = recordLessonResult(progress, 'f', makeResult({ accuracy: 0.95 }));

    const coverage = getOverallCoverage(progress);
    expect(coverage.passed).toBe(2);
    expect(coverage.total).toBe(25);
    expect(coverage.rate).toBeCloseTo(2 / 25);
  });

  it('横区覆盖率单独统计', () => {
    const progress = recordLessonResult(INITIAL_COURSE_PROGRESS, 'g', makeResult({ accuracy: 0.95 }));
    const coverage = getZoneCoverage(progress, 'heng');

    expect(coverage.passed).toBe(1);
    expect(coverage.total).toBe(5);
  });
});

describe('全键盘随机解锁', () => {
  it('未通关全部关卡时不可用', () => {
    expect(isFreePracticeUnlocked(INITIAL_COURSE_PROGRESS)).toBe(false);
    expect(isCourseCompleted(INITIAL_COURSE_PROGRESS)).toBe(false);
  });

  it('自由模式下可用', () => {
    expect(isFreePracticeUnlocked({ freeMode: true, lessons: {} })).toBe(true);
  });

  it('全部通关后可用', () => {
    let progress = INITIAL_COURSE_PROGRESS;
    for (const lesson of LESSON_ORDER) {
      progress = recordLessonResult(progress, lesson.id, makeResult({ accuracy: 0.95 }));
    }

    expect(isCourseCompleted(progress)).toBe(true);
    expect(isFreePracticeUnlocked(progress)).toBe(true);
  });
});

describe('getNextLesson', () => {
  it('初始指向第一关', () => {
    expect(getNextLesson(INITIAL_COURSE_PROGRESS)?.id).toBe(FIRST);
  });

  it('第一关通关后指向第二关', () => {
    const progress = recordLessonResult(INITIAL_COURSE_PROGRESS, FIRST, makeResult({ accuracy: 0.95 }));
    expect(getNextLesson(progress)?.id).toBe(SECOND);
  });

  it('第一关未达标仍指向第一关', () => {
    const progress = recordLessonResult(INITIAL_COURSE_PROGRESS, FIRST, makeResult({ accuracy: 0.5 }));
    expect(getNextLesson(progress)?.id).toBe(FIRST);
  });
});

describe('resetCourseProgress', () => {
  it('清空记录但保留自由模式开关', () => {
    const progress: CourseProgress = {
      freeMode: true,
      lessons: { g: { lessonId: 'g', passed: true, bestAccuracy: 1, bestCharCount: 30, bestSpeed: 50, attempts: 2, updatedAt: 1 } },
    };

    const reset = resetCourseProgress(progress);
    expect(reset.lessons).toEqual({});
    expect(reset.freeMode).toBe(true);
  });
});
