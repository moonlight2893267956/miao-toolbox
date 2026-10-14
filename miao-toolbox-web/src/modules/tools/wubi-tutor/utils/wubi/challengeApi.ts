/**
 * 挑战排行榜接口客户端。
 *
 * 复用全局 `axiosInstance`（已带 token 刷新与 HMAC 签名拦截器），
 * 因此这里只做三件事：拼路径、把 `ApiResponse` 外壳剥掉、给出超时。
 *
 * 不做 try/catch：网络异常必须传出去，让界面进入「失败 + 可重试」态 ——
 * 在这里吞掉错误只会得到一个「永远加载中」的榜单。
 */

import axiosInstance from '../../../../../services/axiosInstance';
import type { ChallengeMode, ChallengeSubmitPayload } from './challenge';

const BASE = '/api/wubi/challenge';

/** 榜单接口超时（毫秒）：八秒足够，超时必须是「可重试」而不是无限等待 */
const REQUEST_TIMEOUT = 8000;

// ─── 响应结构（与后端 DTO 字段逐字对应） ────────────────

export interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  accuracyPercent: number;
  durationSec: number;
  maxCombo: number;
  /** 是否是当前登录用户（后端算好，前端只用来高亮） */
  isMe: boolean;
}

export interface LeaderboardData {
  mode: ChallengeMode;
  scope: 'all' | 'daily';
  /** 日榜的日期；总榜为 null */
  date: string | null;
  total: number;
  entries: LeaderboardEntry[];
  /** 我的名次；未上榜为 0 */
  myRank: number;
  /** 我的最好成绩；未上榜为 null */
  myScore: number | null;
}

export interface MyChallengeBest {
  mode: ChallengeMode;
  score: number | null;
  accuracyPercent: number;
  durationSec: number;
  maxCombo: number;
  achievedAt: string | null;
  rank: number;
}

export interface MyChallengeData {
  bests: MyChallengeBest[];
  daily: {
    date: string;
    completed: boolean;
    score: number | null;
  };
}

export interface SubmitScoreResult {
  mode: ChallengeMode;
  score: number;
  rank: number;
  total: number;
  newBest: boolean;
}

export interface LeaderboardQuery {
  mode: ChallengeMode;
  scope: 'all' | 'daily';
  /** 仅日榜需要 */
  date?: string;
  limit?: number;
}

// ─── 接口 ────────────────────────────────────────────────

export async function fetchLeaderboard(query: LeaderboardQuery): Promise<LeaderboardData> {
  const resp = await axiosInstance.get<{ data: LeaderboardData }>(`${BASE}/leaderboard`, {
    params: {
      mode: query.mode,
      scope: query.scope,
      date: query.date,
      limit: query.limit,
    },
    timeout: REQUEST_TIMEOUT,
  });
  return resp.data.data;
}

export async function fetchMyChallenge(): Promise<MyChallengeData> {
  const resp = await axiosInstance.get<{ data: MyChallengeData }>(`${BASE}/me`, {
    timeout: REQUEST_TIMEOUT,
  });
  return resp.data.data;
}

export async function submitChallengeScore(
  payload: ChallengeSubmitPayload,
): Promise<SubmitScoreResult> {
  const resp = await axiosInstance.post<{ data: SubmitScoreResult }>(
    `${BASE}/scores`,
    payload,
    { timeout: REQUEST_TIMEOUT },
  );
  return resp.data.data;
}

/**
 * 把 axios 异常归一成一句可展示的中文。
 *
 * 榜单失败最常见的两类是「网络不可达」与「登录过期」，
 * 它们对用户的处置完全不同（重试 vs 重新登录），因此必须分开说。
 */
export function describeChallengeApiError(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 401) return '登录已过期，请刷新页面后重试';
  if (status === 403) return '当前账号没有五笔练习室权限';
  if (typeof status === 'number' && status >= 500) return '服务器开小差了，稍后再试';
  return '排行榜暂时连不上，稍后可重试';
}
