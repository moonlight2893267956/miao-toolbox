/**
 * 成就系统（Story 4.4）
 *
 * 设计要点：
 * - 每项成就 = 一个「阈值 + 取值函数」，判定与展示共用同一份定义，
 *   避免出现「显示进度 100% 但未点亮」的不一致。
 * - 判定是**幂等且只增不减**：已解锁的成就永远保持解锁，
 *   即使某天 Streak 断了、错题本又变脏。
 * - 全部数据来自本地持久化，无分享/导出。
 */

import type { Totals, StreakInfo } from './statsAggregation';

// ─── 类型定义 ────────────────────────────────────────────

export type AchievementGroup = 'volume' | 'speed' | 'accuracy' | 'streak' | 'coverage' | 'review';

export interface AchievementContext {
  totals: Totals;
  streak: StreakInfo;
  /** 错题本待复习条目总数 */
  reviewTotal: number;
  /** 已通关的关卡数（1 关 = 1 个键位） */
  passedLessons: number;
  /** 历史最佳单次速度（字/分钟，跨模式取最优） */
  bestSpeed: number;
  /** 历史最佳单日准确率（0~1） */
  bestAccuracy: number;
  /** 历史最大连击 */
  maxCombo: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  /** 展示用短标签（避免引入图标依赖，用文字/符号） */
  badge: string;
  group: AchievementGroup;
  /** 达标阈值 */
  target: number;
  /** 从上下文取当前值 */
  measure: (ctx: AchievementContext) => number;
}

export const GROUP_LABELS: Record<AchievementGroup, string> = {
  volume: '练习量',
  speed: '速度',
  accuracy: '准确率',
  streak: '坚持',
  coverage: '进度',
  review: '复习',
};

// ─── 成就清单（17 项）────────────────────────────────────

export const ACHIEVEMENTS: AchievementDef[] = [
  // 练习量
  {
    id: 'chars-10',
    title: '初出茅庐',
    desc: '首次打对 10 个字',
    badge: '十',
    group: 'volume',
    target: 10,
    measure: (c) => c.totals.totalChars,
  },
  {
    id: 'chars-100',
    title: '小有所成',
    desc: '累计打对 100 个字',
    badge: '百',
    group: 'volume',
    target: 100,
    measure: (c) => c.totals.totalChars,
  },
  {
    id: 'chars-1000',
    title: '千字达成',
    desc: '累计打对 1000 个字',
    badge: '千',
    group: 'volume',
    target: 1000,
    measure: (c) => c.totals.totalChars,
  },
  {
    id: 'chars-10000',
    title: '万字大户',
    desc: '累计打对 10000 个字',
    badge: '万',
    group: 'volume',
    target: 10000,
    measure: (c) => c.totals.totalChars,
  },
  {
    id: 'sessions-50',
    title: '勤学不辍',
    desc: '完成 50 轮练习',
    badge: '50',
    group: 'volume',
    target: 50,
    measure: (c) => c.totals.totalSessions,
  },
  {
    id: 'time-10h',
    title: '十小时功',
    desc: '累计练习满 10 小时',
    badge: '10h',
    group: 'volume',
    target: 36000,
    measure: (c) => c.totals.totalTimeSec,
  },

  // 速度
  {
    id: 'speed-30',
    title: '渐入佳境',
    desc: '单次速度突破 30 字/分钟',
    badge: '30',
    group: 'speed',
    target: 30,
    measure: (c) => c.bestSpeed,
  },
  {
    id: 'speed-60',
    title: '行云流水',
    desc: '单次速度突破 60 字/分钟',
    badge: '60',
    group: 'speed',
    target: 60,
    measure: (c) => c.bestSpeed,
  },
  {
    id: 'speed-100',
    title: '键指如飞',
    desc: '单次速度突破 100 字/分钟',
    badge: '100',
    group: 'speed',
    target: 100,
    measure: (c) => c.bestSpeed,
  },

  // 准确率
  {
    id: 'accuracy-99',
    title: '分毫不差',
    desc: '单日准确率达到 99%',
    badge: '99%',
    group: 'accuracy',
    target: 99,
    // bestAccuracy 为 0~1，转成百分数比较
    measure: (c) => Math.round(c.bestAccuracy * 1000) / 10,
  },
  {
    id: 'combo-100',
    title: '连击达人',
    desc: '单次最大连击达到 100',
    badge: '连',
    group: 'accuracy',
    target: 100,
    measure: (c) => c.maxCombo,
  },

  // 坚持
  {
    id: 'streak-3',
    title: '三日之约',
    desc: '连续练习 3 天',
    badge: '3',
    group: 'streak',
    target: 3,
    measure: (c) => c.streak.longest,
  },
  {
    id: 'streak-7',
    title: '一周不辍',
    desc: '连续练习 7 天',
    badge: '7',
    group: 'streak',
    target: 7,
    measure: (c) => c.streak.longest,
  },
  {
    id: 'streak-30',
    title: '满月坚持',
    desc: '连续练习 30 天',
    badge: '30',
    group: 'streak',
    target: 30,
    measure: (c) => c.streak.longest,
  },

  // 进度
  {
    id: 'first-zone',
    title: '首区通关',
    desc: '完成第一个分区（5 个键位）',
    badge: '区',
    group: 'coverage',
    target: 5,
    measure: (c) => c.passedLessons,
  },
  {
    id: 'keys-all',
    title: '全键盘认知',
    desc: '全部 25 个键位完成认知',
    badge: '全',
    group: 'coverage',
    target: 25,
    measure: (c) => c.passedLessons,
  },

  // 复习
  {
    id: 'review-clear',
    title: '错题清零',
    desc: '累计练习 100 字后错题本保持为空',
    badge: '净',
    group: 'review',
    target: 1,
    /*
     * 需要同时满足「练够量」与「错题本为空」，
     * 否则新用户第一天就能白拿这个成就。
     */
    measure: (c) => (c.totals.totalChars >= 100 && c.reviewTotal === 0 ? 1 : 0),
  },
];

/** 成就总数（成就墙展示用） */
export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;

// ─── 判定 ────────────────────────────────────────────────

/** 单次会话最多弹几个 Toast（防刷屏） */
const MAX_TOAST_PER_SESSION = 2;

/**
 * 计算当前应解锁的全部成就 id（不依赖已解锁状态，纯判定）。
 */
export function getEligibleAchievements(ctx: AchievementContext): string[] {
  return ACHIEVEMENTS
    .filter((def) => def.measure(ctx) >= def.target)
    .map((def) => def.id);
}

/**
 * 计算**本次新解锁**的成就。
 *
 * @param ctx 当前上下文
 * @param unlocked 已解锁的成就 id
 * @param limit Toast 展示上限（默认 2）
 */
export function evaluateAchievements(
  ctx: AchievementContext,
  unlocked: string[],
  limit = MAX_TOAST_PER_SESSION,
): string[] {
  const known = new Set(unlocked);

  /*
   * 按「含金量」排序：分组优先级 + 阈值难度。
   * 一次会话解锁 5 个成就弹 5 个 Toast 毫无意义，只展示最有代表性的。
   *
   * 无论是否超量都走同一套排序 —— 否则「3 个成就」和「4 个成就」
   * 会返回两种不同的顺序，展示逻辑难以预期。
   */
  const groupWeight: Record<AchievementGroup, number> = {
    coverage: 5,
    streak: 4,
    speed: 3,
    accuracy: 3,
    review: 2,
    volume: 1,
  };

  return ACHIEVEMENTS
    .filter((def) => !known.has(def.id) && def.measure(ctx) >= def.target)
    .sort((a, b) => {
      if (groupWeight[b.group] !== groupWeight[a.group]) {
        return groupWeight[b.group] - groupWeight[a.group];
      }
      return b.target - a.target;
    })
    .slice(0, Math.max(0, limit))
    .map((d) => d.id);
}

/** 合并已解锁集合（去重，保持稳定顺序） */
export function mergeUnlocked(unlocked: string[], newlyUnlocked: string[]): string[] {
  const set = new Set(unlocked);
  for (const id of newlyUnlocked) set.add(id);
  // 按 ACHIEVEMENTS 声明顺序输出，保证成就墙排列稳定
  return ACHIEVEMENTS.filter((d) => set.has(d.id)).map((d) => d.id);
}

// ─── 展示辅助 ────────────────────────────────────────────

/** 成就进度 0~1 */
export function getAchievementProgress(def: AchievementDef, ctx: AchievementContext): number {
  if (def.target <= 0) return 1;
  const value = def.measure(ctx);
  if (value <= 0) return 0;
  return Math.min(1, value / def.target);
}

export interface MilestoneHint {
  def: AchievementDef;
  progress: number;
  current: number;
  target: number;
}

/**
 * 取「最接近达成」的未解锁成就，作为里程碑提示。
 *
 * 排除 progress=0 的项：还没开始做的成就提示出来没有指导意义。
 */
export function getNextMilestones(
  ctx: AchievementContext,
  unlocked: string[],
  limit = 3,
): MilestoneHint[] {
  const known = new Set(unlocked);

  return ACHIEVEMENTS
    .filter((def) => !known.has(def.id))
    .map((def) => ({
      def,
      progress: getAchievementProgress(def, ctx),
      current: def.measure(ctx),
      target: def.target,
    }))
    .filter((h) => h.progress > 0 && h.progress < 1)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, limit);
}

/** 按分组归集已解锁成就 */
export function groupUnlocked(
  unlocked: string[],
): Record<AchievementGroup, string[]> {
  const known = new Set(unlocked);
  const result: Record<AchievementGroup, string[]> = {
    volume: [], speed: [], accuracy: [], streak: [], coverage: [], review: [],
  };

  for (const def of ACHIEVEMENTS) {
    if (known.has(def.id)) result[def.group].push(def.id);
  }
  return result;
}
