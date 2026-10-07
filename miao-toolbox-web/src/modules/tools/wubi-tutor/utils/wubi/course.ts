/**
 * 课程闯关纯函数
 *
 * 职责：
 * - 通关判定（正确率 ≥ 90% 且完成 ≥ 20 字）
 * - 解锁判定（线性解锁 / 自由模式）
 * - 成绩取最优
 * - 覆盖率统计
 *
 * 全部为纯函数，便于单测（阈值边界、字数不足、重复通关取最优）。
 */

import { LESSON_ORDER, TOTAL_LESSONS, getLessonIndex, ZONE_COURSE } from '../../data/lessons';
import type { WubiZone } from '../../data/radicals';
import type { SessionResult } from './session';

// ─── 常量 ────────────────────────────────────────────────

/** 通关所需最低正确率 */
export const PASS_ACCURACY = 0.9;
/** 通关所需最少完成字数 */
export const PASS_MIN_CHARS = 20;

// ─── 类型定义 ────────────────────────────────────────────

export interface LessonRecord {
  lessonId: string;
  /** 是否已通关 */
  passed: boolean;
  /** 历史最佳正确率 */
  bestAccuracy: number;
  /** 历史最佳完成字数 */
  bestCharCount: number;
  /** 历史最佳速度（字/分钟） */
  bestSpeed: number;
  /** 尝试次数 */
  attempts: number;
  updatedAt: number;
}

export interface CourseProgress {
  /** 自由模式：跳过全部解锁限制 */
  freeMode: boolean;
  /** 各关卡记录（key = lessonId） */
  lessons: Record<string, LessonRecord>;
}

export const INITIAL_COURSE_PROGRESS: CourseProgress = {
  freeMode: false,
  lessons: {},
};

export type LessonStatus = 'locked' | 'in-progress' | 'passed';

export interface LessonEvaluation {
  /** 是否达标 */
  passed: boolean;
  /** 正确率是否达标 */
  accuracyOk: boolean;
  /** 字数是否达标 */
  charCountOk: boolean;
  /** 未达标原因（用于 UI 提示） */
  reasons: string[];
}

// ─── 通关判定 ────────────────────────────────────────────

/**
 * 一次练习在「以字为单位」口径下的完成量。
 *
 * 优先取 `correctChars`（真实汉字数，词组按长度计）；
 * 「字根认知」「字根输入」两个环节不涉及汉字（charCount = 0），
 * 此时回退到「完成题数」—— 否则这两类关卡永远无法通关。
 *
 * 通关判定与关卡记录必须共用这一个口径，否则会出现
 * 「按字数判定通过、却按题数记录成绩」这类不一致。
 */
export function lessonDoneChars(result: SessionResult): number {
  return result.correctChars > 0 ? result.correctChars : result.totalQuestions;
}

/**
 * 判定一次练习是否达到通关标准。
 *
 * 标准：正确率 ≥ 90% 且 完成字数 ≥ 20。
 */
export function evaluateLesson(result: SessionResult): LessonEvaluation {
  // 使用浮点比较容差，避免 0.9 无法被精确表示导致 89.999% 误判
  const accuracyOk = result.accuracy >= PASS_ACCURACY - 1e-9;

  const doneChars = lessonDoneChars(result);
  const charCountOk = doneChars >= PASS_MIN_CHARS;

  const reasons: string[] = [];
  if (!accuracyOk) {
    reasons.push(`正确率 ${(result.accuracy * 100).toFixed(1)}%，需 ≥ ${PASS_ACCURACY * 100}%`);
  }
  if (!charCountOk) {
    reasons.push(`完成 ${doneChars} 字，需 ≥ ${PASS_MIN_CHARS} 字`);
  }

  return {
    passed: accuracyOk && charCountOk,
    accuracyOk,
    charCountOk,
    reasons,
  };
}

// ─── 成绩取最优 ──────────────────────────────────────────

/**
 * 合并一次练习成绩到关卡记录，保留历史最优。
 *
 * - bestAccuracy / bestCharCount / bestSpeed 取最大值
 * - passed 一旦为 true 不会被后续失败重置
 */
export function mergeLessonRecord(
  prev: LessonRecord | undefined,
  lessonId: string,
  result: SessionResult,
  now: number,
): LessonRecord {
  const evaluation = evaluateLesson(result);

  const doneChars = lessonDoneChars(result);

  if (!prev) {
    return {
      lessonId,
      passed: evaluation.passed,
      bestAccuracy: result.accuracy,
      bestCharCount: doneChars,
      bestSpeed: result.speedPerMinute,
      attempts: 1,
      updatedAt: now,
    };
  }

  return {
    lessonId,
    passed: prev.passed || evaluation.passed,
    bestAccuracy: Math.max(prev.bestAccuracy, result.accuracy),
    bestCharCount: Math.max(prev.bestCharCount, doneChars),
    bestSpeed: Math.max(prev.bestSpeed, result.speedPerMinute),
    attempts: prev.attempts + 1,
    updatedAt: now,
  };
}

/** 记录一次练习到课程进度（返回新对象） */
export function recordLessonResult(
  progress: CourseProgress,
  lessonId: string,
  result: SessionResult,
  now: number = Date.now(),
): CourseProgress {
  return {
    ...progress,
    lessons: {
      ...progress.lessons,
      [lessonId]: mergeLessonRecord(progress.lessons[lessonId], lessonId, result, now),
    },
  };
}

// ─── 解锁判定 ────────────────────────────────────────────

/** 某关卡是否已通关 */
export function isLessonPassed(progress: CourseProgress, lessonId: string): boolean {
  return progress.lessons[lessonId]?.passed === true;
}

/**
 * 某关卡是否已解锁。
 *
 * 线性解锁：第一个关卡始终解锁；其余关卡需前一关已通关。
 * 自由模式：全部解锁。
 */
export function isLessonUnlocked(progress: CourseProgress, lessonId: string): boolean {
  if (progress.freeMode) return true;

  const index = getLessonIndex(lessonId);
  if (index < 0) return false;
  if (index === 0) return true;

  const prevLesson = LESSON_ORDER[index - 1];
  return isLessonPassed(progress, prevLesson.id);
}

/** 关卡状态 */
export function getLessonStatus(progress: CourseProgress, lessonId: string): LessonStatus {
  if (isLessonPassed(progress, lessonId)) return 'passed';
  if (isLessonUnlocked(progress, lessonId)) return 'in-progress';
  return 'locked';
}

/** 全部关卡是否已通关（用于解锁「全键盘随机」） */
export function isCourseCompleted(progress: CourseProgress): boolean {
  return LESSON_ORDER.every((l) => isLessonPassed(progress, l.id));
}

/**
 * 「全键盘随机」模式是否可用。
 * 全部关卡通关，或开启自由模式。
 */
export function isFreePracticeUnlocked(progress: CourseProgress): boolean {
  return progress.freeMode || isCourseCompleted(progress);
}

// ─── 覆盖率统计 ──────────────────────────────────────────

export interface Coverage {
  passed: number;
  total: number;
  /** 0~1 */
  rate: number;
}

function makeCoverage(passed: number, total: number): Coverage {
  return { passed, total, rate: total > 0 ? passed / total : 0 };
}

/** 某区的覆盖率 */
export function getZoneCoverage(progress: CourseProgress, zone: WubiZone): Coverage {
  const zoneCourse = ZONE_COURSE.find((z) => z.zone === zone);
  if (!zoneCourse) return makeCoverage(0, 0);

  const passed = zoneCourse.lessons.filter((l) => isLessonPassed(progress, l.id)).length;
  return makeCoverage(passed, zoneCourse.lessons.length);
}

/** 整体覆盖率（已掌握 N / 25 个键位） */
export function getOverallCoverage(progress: CourseProgress): Coverage {
  const passed = LESSON_ORDER.filter((l) => isLessonPassed(progress, l.id)).length;
  return makeCoverage(passed, TOTAL_LESSONS);
}

// ─── 其他 ────────────────────────────────────────────────

/** 下一个待练习的关卡（第一个未通关且已解锁的） */
export function getNextLesson(progress: CourseProgress) {
  return LESSON_ORDER.find(
    (l) => !isLessonPassed(progress, l.id) && isLessonUnlocked(progress, l.id),
  );
}

/** 重置课程进度（保留自由模式开关） */
export function resetCourseProgress(progress: CourseProgress): CourseProgress {
  return { freeMode: progress.freeMode, lessons: {} };
}
