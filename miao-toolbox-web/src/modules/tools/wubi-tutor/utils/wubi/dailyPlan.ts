/**
 * 每日计划纯函数（Story 4.4）
 *
 * 生成「今日该练什么」的默认答案：复习 + 当前关卡 + 短文测速。
 *
 * 设计约束（来自 AC）：
 * - 未完成时**不施加强制或负反馈**：没有红色告警、没有「你已落后」文案
 * - 完成状态必须从已有持久化数据推导，不额外引入「当日任务表」存储
 */

import { isSameDayTimestamp } from './statsAggregation';
import {
  PRACTICE_MODE_KEYS,
  LESSON_MODE_PREFIX,
  type ModeRecords,
} from './sessionStats';

// ─── 类型 ────────────────────────────────────────────────

export type DailyPlanTaskId = 'review' | 'lesson' | 'article';

export interface DailyPlanInput {
  /** 今天（YYYY-MM-DD） */
  today: string;
  /** 今日待复习字数 */
  dueReviewCount: number;
  /** 当前待通关的关卡（null = 已全部通关） */
  nextLesson: { id: string; key: string } | null;
  /** 各模式成绩记录（用于判定今日是否已练过） */
  records: ModeRecords;
  /** 今日累计练习时长（秒） */
  todayPracticeSec: number;
}

export interface DailyPlanTask {
  id: DailyPlanTaskId;
  title: string;
  desc: string;
  /** 今日是否已完成 */
  done: boolean;
  /** 是否可直接开始 */
  actionable: boolean;
}

export interface DailyPlan {
  tasks: DailyPlanTask[];
  completedCount: number;
  totalCount: number;
  todayPracticeSec: number;
  allDone: boolean;
}

// ─── 判定辅助 ────────────────────────────────────────────

/** 指定模式今日是否练过 */
export function hasActivityToday(
  records: ModeRecords,
  modeKeys: string[],
  today: string,
): boolean {
  return modeKeys.some((key) => {
    const rec = records?.[key];
    return rec?.last ? isSameDayTimestamp(rec.last.at, today) : false;
  });
}

/** 今日是否练过任意关卡环节 */
export function hasLessonActivityToday(records: ModeRecords, today: string): boolean {
  return Object.keys(records ?? {}).some((key) => {
    if (!key.startsWith(LESSON_MODE_PREFIX)) return false;
    const rec = records[key];
    return rec?.last ? isSameDayTimestamp(rec.last.at, today) : false;
  });
}

// ─── 主函数 ──────────────────────────────────────────────

/**
 * 生成今日计划。
 *
 * 任务固定为三项，顺序即推荐顺序：
 * 先复习（巩固遗忘项）→ 再推关卡（学新内容）→ 最后短文（综合测速）。
 */
export function buildDailyPlan(input: DailyPlanInput): DailyPlan {
  const { today, dueReviewCount, nextLesson, records, todayPracticeSec } = input;

  // 复习：待复习清空或今日已复习过，都算完成
  const reviewDone = dueReviewCount === 0 || hasActivityToday(records, [PRACTICE_MODE_KEYS.review], today);

  const lessonDone = hasLessonActivityToday(records, today);

  const articleDone = hasActivityToday(
    records,
    [PRACTICE_MODE_KEYS.article, PRACTICE_MODE_KEYS.customArticle],
    today,
  );

  const tasks: DailyPlanTask[] = [
    {
      id: 'review',
      title: '复习待巩固的字',
      desc: dueReviewCount > 0
        ? `${dueReviewCount} 个字已到复习时间`
        : '当前没有到期的字，可以跳过',
      done: reviewDone,
      // 没有待复习内容时不引导点击，避免进入空队列
      actionable: dueReviewCount > 0,
    },
    {
      id: 'lesson',
      title: nextLesson ? `推进「${nextLesson.key.toUpperCase()}」键关卡` : '关卡已全部通关',
      desc: nextLesson
        ? '三个环节走一遍，掌握这个键位'
        : '可以挑战文章测速或专项练习',
      done: lessonDone,
      actionable: nextLesson != null,
    },
    {
      id: 'article',
      title: '一篇短文测速',
      desc: '用真实文本检验综合熟练度',
      done: articleDone,
      actionable: true,
    },
  ];

  const completedCount = tasks.filter((t) => t.done).length;

  return {
    tasks,
    completedCount,
    totalCount: tasks.length,
    todayPracticeSec,
    allDone: completedCount === tasks.length,
  };
}
