/**
 * 课程闯关进度 Hook
 *
 * 读写 progress.course，并在变更时落盘。
 */

import { useState, useCallback, useMemo } from 'react';
import { useWubiStorage } from './useWubiStorage';
import {
  INITIAL_COURSE_PROGRESS,
  recordLessonResult,
  getLessonStatus,
  getOverallCoverage,
  resetCourseProgress,
  type CourseProgress,
  type LessonStatus,
} from './course';
import type { SessionResult } from './session';

export function useCourseProgress() {
  const { loadProgress, saveProgress } = useWubiStorage();

  const [progress, setProgress] = useState<CourseProgress>(
    () => loadProgress().course ?? INITIAL_COURSE_PROGRESS,
  );

  /** 落盘（保留 progress 其他字段） */
  const persist = useCallback((next: CourseProgress) => {
    const full = loadProgress();
    saveProgress({ ...full, course: next });
    setProgress(next);
  }, [loadProgress, saveProgress]);

  /** 记录一次关卡练习成绩 */
  const recordLesson = useCallback((lessonId: string, result: SessionResult) => {
    const full = loadProgress();
    const next = recordLessonResult(
      full.course ?? INITIAL_COURSE_PROGRESS,
      lessonId,
      result,
    );
    persist(next);
  }, [loadProgress, persist]);

  /**
   * 切换自由模式。
   *
   * 注意：副作用（读存储 + 写存储）必须在 updater **之外**执行。
   * React StrictMode 会双调用 updater，否则会重复落盘。
   */
  const setFreeMode = useCallback((freeMode: boolean) => {
    const full = loadProgress();
    const next = { ...(full.course ?? INITIAL_COURSE_PROGRESS), freeMode };
    saveProgress({ ...full, course: next });
    setProgress(next);
  }, [loadProgress, saveProgress]);

  /**
   * 重置课程进度（保留自由模式开关）。
   *
   * 从存储读取当前值而不是用 `progress` 闭包 —— 否则本 Hook 之外
   * 发生的进度变更（如导入数据）会被这份旧快照覆盖掉。
   */
  const reset = useCallback(() => {
    const full = loadProgress();
    persist(resetCourseProgress(full.course ?? INITIAL_COURSE_PROGRESS));
  }, [loadProgress, persist]);

  /** 覆盖率 */
  const coverage = useMemo(() => getOverallCoverage(progress), [progress]);

  /** 取关卡状态 */
  const statusOf = useCallback(
    (lessonId: string): LessonStatus => getLessonStatus(progress, lessonId),
    [progress],
  );

  return { progress, coverage, statusOf, recordLesson, setFreeMode, reset };
}
