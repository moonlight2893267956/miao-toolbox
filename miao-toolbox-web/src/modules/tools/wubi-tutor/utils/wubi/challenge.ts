/**
 * 挑战三件套的**唯一口径来源**：规则常量、计分、结果与上报载荷。
 *
 * 为什么要把它们集中在一个纯模块里：
 * - 计分规则同时被「结算面板展示」「个人最佳判定」「后端上报」三处使用，
 *   分散实现必然漂移；
 * - 后端榜单的可比性依赖同一条规则，两处各写一份等于没有规则。
 *
 * 三种模式共用一套「计时 / 计分 / 结算」基建：
 *   限时冲刺：60 秒内正确打出的**汉字数**（题短、追求速度）
 *   生存挑战：坚持下来的**正确题数**（答错扣命）
 *   每日挑战：固定题组的**正确题数**（满分 30）
 */

// ─── 模式与规则 ──────────────────────────────────────────

export type ChallengeMode = 'sprint' | 'survival' | 'daily';

export interface ChallengeConfig {
  mode: ChallengeMode;
  label: string;
  /** 一句话说明（模式卡副标题） */
  tagline: string;
  /** 时长上限（秒）；null = 不限时 */
  timeLimitSec: number | null;
  /** 初始命数；null = 无命数概念 */
  lives: number | null;
  /** 固定题量；null = 无限出题 */
  questionCount: number | null;
  /** 计分口径说明（界面提示用） */
  scoreHint: string;
}

/** 限时冲刺时长（秒） */
export const SPRINT_SECONDS = 60;
/** 生存挑战初始命数 */
export const SURVIVAL_LIVES = 3;
/** 每日挑战题量（满分） */
export const DAILY_QUESTION_COUNT = 30;

/** 界面与榜单统一的模式顺序（后端也按此顺序返回「我的挑战」） */
export const CHALLENGE_ORDER: ChallengeMode[] = ['sprint', 'survival', 'daily'];

export const CHALLENGE_CONFIGS: Record<ChallengeMode, ChallengeConfig> = {
  sprint: {
    mode: 'sprint',
    label: '限时冲刺',
    tagline: `${SPRINT_SECONDS} 秒内尽量多打对`,
    timeLimitSec: SPRINT_SECONDS,
    lives: null,
    questionCount: null,
    scoreHint: `${SPRINT_SECONDS} 秒内打对的字数`,
  },
  survival: {
    mode: 'survival',
    label: '生存挑战',
    tagline: `${SURVIVAL_LIVES} 条命，答错扣命`,
    timeLimitSec: null,
    lives: SURVIVAL_LIVES,
    questionCount: null,
    scoreHint: '坚持下来的正确题数',
  },
  daily: {
    mode: 'daily',
    label: '每日挑战',
    tagline: `每天一套固定题组（${DAILY_QUESTION_COUNT} 题）`,
    timeLimitSec: null,
    lives: null,
    questionCount: DAILY_QUESTION_COUNT,
    scoreHint: `正确题数（满分 ${DAILY_QUESTION_COUNT}）`,
  },
};

/** 是否是需要「每天只记一次正式成绩」的模式 */
export function isDailyMode(mode: ChallengeMode): boolean {
  return mode === 'daily';
}

// ─── 结果与计分 ──────────────────────────────────────────

/** 从会话结果中取出挑战需要的原始量 */
export interface ChallengeStats {
  /** 正确打出的汉字数（冲刺的主指标） */
  correctChars: number;
  /** 正确完成的题数（生存 / 每日的主指标） */
  correctQuestions: number;
  /** 总题数（含答错的） */
  totalQuestions: number;
  /** 准确率 0~1 */
  accuracy: number;
  /** 用时（秒） */
  durationSec: number;
  /** 最高连击 */
  maxCombo: number;
}

export interface ChallengeResult extends ChallengeStats {
  mode: ChallengeMode;
  /** 榜单排序用的分数 */
  score: number;
  /** 归属日期 YYYY-MM-DD（本地时区） */
  statDate: string;
}

/**
 * 计分。
 *
 * 冲刺按「字」、生存与每日按「题」—— 因为冲刺的题池是短码常用字，
 * 按题计会把长码题与短码题算成等值；而生存/每日的题长短不一，
 * 按字计又会让「蒙对一个长词」抵掉好几题。
 */
export function computeChallengeScore(
  mode: ChallengeMode,
  stats: Pick<ChallengeStats, 'correctChars' | 'correctQuestions'>,
): number {
  const raw = mode === 'sprint' ? stats.correctChars : stats.correctQuestions;
  // 防御：负值不该出现在任何真实路径，出现即视为 0（榜单不能有负分）
  return Math.max(0, Math.floor(raw));
}

/** 组装一条挑战结果（分数由口径函数算出，不手工传入） */
export function toChallengeResult(
  mode: ChallengeMode,
  stats: ChallengeStats,
  statDate: string,
): ChallengeResult {
  return {
    ...stats,
    mode,
    statDate,
    score: computeChallengeScore(mode, stats),
  };
}

/**
 * a 是否优于 b（同一模式内比较）。
 *
 * 与后端榜单排序同序：分数 → 准确率 → 用时 → （时间不参与本地比较）。
 * 本地「是否刷新纪录」与榜单名次必须用同一套判据，
 * 否则会出现「本地提示新纪录、榜上却没动」的割裂。
 */
export function isBetterChallengeResult(
  a: Pick<ChallengeResult, 'score' | 'accuracy' | 'durationSec'>,
  b: Pick<ChallengeResult, 'score' | 'accuracy' | 'durationSec'>,
): boolean {
  if (a.score !== b.score) return a.score > b.score;
  if (a.accuracy !== b.accuracy) return a.accuracy > b.accuracy;
  return a.durationSec < b.durationSec;
}

// ─── 上报载荷 ────────────────────────────────────────────

export interface ChallengeSubmitPayload {
  mode: ChallengeMode;
  score: number;
  correctChars: number;
  /** 准确率百分数（整数）—— 后端存整数，避免浮点在各端格式化不一致 */
  accuracyPercent: number;
  durationSec: number;
  maxCombo: number;
  statDate: string;
}

export function toSubmitPayload(result: ChallengeResult): ChallengeSubmitPayload {
  return {
    mode: result.mode,
    score: result.score,
    correctChars: result.correctChars,
    accuracyPercent: Math.round(result.accuracy * 100),
    durationSec: Math.round(result.durationSec),
    maxCombo: result.maxCombo,
    statDate: result.statDate,
  };
}

// ─── 展示辅助 ────────────────────────────────────────────

/** 进度文案：冲刺显示剩余秒数，生存显示剩余命数，每日显示题进度 */
export function challengeProgressLabel(
  mode: ChallengeMode,
  state: { remainingSec: number | null; lives: number | null; answered: number },
): string {
  if (mode === 'sprint' && state.remainingSec !== null) {
    return `剩余 ${Math.max(0, Math.ceil(state.remainingSec))}s`;
  }
  if (mode === 'survival' && state.lives !== null) {
    return `生命 ${Math.max(0, state.lives)}`;
  }
  return `${state.answered} / ${CHALLENGE_CONFIGS.daily.questionCount ?? '∞'}`;
}
