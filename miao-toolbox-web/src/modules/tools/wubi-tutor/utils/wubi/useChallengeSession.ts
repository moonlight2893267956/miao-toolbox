/**
 * 挑战会话 Hook：把「挑战规则」接到既有练习会话引擎上。
 *
 * 不新造状态机，而是在 `usePracticeSession` 之上加三条终止规则与一条结算路径：
 *   1. 到点结束（限时冲刺）—— 由已用时驱动；
 *   2. 命尽结束（生存挑战）—— 由 `onWrongAnswer` 驱动；
 *   3. 题量打满（每日挑战）—— 由已完成题数驱动。
 *
 * 三种模式共用同一套题源、键盘捕获、指标与结算，因此挑战与普通练习
 * 在统计口径上完全一致（`computeSessionResult` 是唯一出口）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePracticeSession } from './usePracticeSession';
import {
  CHALLENGE_CONFIGS,
  toChallengeResult,
  toSubmitPayload,
  type ChallengeMode,
  type ChallengeResult,
  type ChallengeStats,
} from './challenge';
import {
  createChallengeRuntime,
  loseLife,
  markCleared,
  tickChallenge,
  type ChallengeRuntime,
} from './challengeState';
import { createChallengeSource, DEFAULT_WARMUP_QUESTIONS } from './challengeSource';
import { dailySeed } from './dailyChallenge';
import { todayKey } from './statsAggregation';
import { randomSeed } from './rng';
import { useWubiStorage } from './useWubiStorage';
import {
  submitChallengeScore,
  describeChallengeApiError,
  type SubmitScoreResult,
} from './challengeApi';
import type { CharMap, PhraseMap } from './code';
import type { SessionResult } from './session';

export type ChallengeSubmitState = 'idle' | 'pending' | 'ok' | 'failed';

export interface UseChallengeSessionOptions {
  mode: ChallengeMode;
  /** 码表；未就绪时不应开始 */
  charMap: CharMap | null;
  /** 二字词表；为空时题源自动降级为全程单字 */
  phraseMap: PhraseMap | null;
}

export function useChallengeSession(options: UseChallengeSessionOptions) {
  const { mode, charMap, phraseMap } = options;
  const config = CHALLENGE_CONFIGS[mode];

  const { recordChallengeProgress, clearChallengePendingSync } = useWubiStorage();

  const [runtime, setRuntimeState] = useState<ChallengeRuntime>(() => createChallengeRuntime(config));
  const runtimeRef = useRef(runtime);
  const applyRuntime = useCallback((next: ChallengeRuntime) => {
    runtimeRef.current = next;
    setRuntimeState(next);
  }, []);

  /** 本轮归属日期：在**开始时**定格，跨零点结束的挑战仍算开始时那天 */
  const statDateRef = useRef(todayKey());

  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [submitState, setSubmitState] = useState<ChallengeSubmitState>('idle');
  const [submitInfo, setSubmitInfo] = useState<SubmitScoreResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── 结算：本地落盘 + 上报 ──
  const handleSessionEnd = useCallback((sessionResult: SessionResult) => {
    const stats: ChallengeStats = {
      correctChars: sessionResult.correctChars,
      correctQuestions: sessionResult.correctQuestions,
      totalQuestions: sessionResult.totalQuestions,
      accuracy: sessionResult.accuracy,
      durationSec: Math.round(sessionResult.durationSec),
      maxCombo: sessionResult.maxCombo,
    };
    const challengeResult = toChallengeResult(mode, stats, statDateRef.current);
    setResult(challengeResult);

    const payload = toSubmitPayload(challengeResult);

    /*
     * 先落本地再上报。
     * 顺序不能反：接口失败时「个人最佳 / 今日打卡」不能跟着一起丢，
     * 而失败的载荷已经存在 `pendingSync` 里，下次进来会重试。
     */
    recordChallengeProgress(challengeResult, payload);

    setSubmitState('pending');
    setSubmitError(null);
    submitChallengeScore(payload)
      .then((info) => {
        setSubmitInfo(info);
        setSubmitState('ok');
        clearChallengePendingSync();
      })
      .catch((err: unknown) => {
        console.error('[useChallengeSession] 成绩上报失败:', err);
        setSubmitError(describeChallengeApiError(err));
        setSubmitState('failed');
      });
  }, [mode, recordChallengeProgress, clearChallengePendingSync]);

  // ── 答错扣命 ──
  const handleWrongAnswer = useCallback(() => {
    applyRuntime(loseLife(runtimeRef.current));
  }, [applyRuntime]);

  const {
    session, metrics, imeComposing, keyboardAttached, startError, clearStartError,
    start, reset, finish, isRunning, skip, beginRound, getSeed,
  } = usePracticeSession({
    // 挑战用 lenient：答错即跳下一题，扣命由挑战层接管。
    // drill 会要求原地改正，与「扣命」语义冲突（扣了命还能继续打这一题）。
    mode: 'lenient',
    onWrongAnswer: handleWrongAnswer,
    onSessionEnd: handleSessionEnd,
  });

  // ── 开始一轮 ──
  const startChallenge = useCallback(() => {
    if (!charMap) return;

    statDateRef.current = todayKey();
    applyRuntime(createChallengeRuntime(config));
    setResult(null);
    setSubmitState('idle');
    setSubmitInfo(null);
    setSubmitError(null);

    /*
     * 种子：每日挑战用日期派生（同一天所有人同一套题），
     * 其它模式每轮新随机。交给会话层保管，保证「快照记的种子」与
     * 「题源用的种子」是同一个。
     */
    beginRound(mode === 'daily' ? dailySeed(statDateRef.current) : randomSeed());

    const source = createChallengeSource({
      charMap,
      phraseMap: phraseMap ?? new Map(),
      seed: getSeed(),
      warmupQuestionCount: DEFAULT_WARMUP_QUESTIONS,
    });
    start(source);
  }, [charMap, phraseMap, config, mode, beginRound, getSeed, start, applyRuntime]);

  // ── 规则 1：到点结束（限时冲刺）──
  useEffect(() => {
    if (!isRunning) return;
    applyRuntime(tickChallenge(runtimeRef.current, config, metrics.elapsedSec));
  }, [isRunning, metrics.elapsedSec, config, applyRuntime]);

  // ── 规则 3：题量打满（每日挑战）──
  useEffect(() => {
    if (!isRunning || config.questionCount === null) return;
    if (session.completedCount >= config.questionCount) {
      applyRuntime(markCleared(runtimeRef.current));
    }
  }, [isRunning, session.completedCount, config, applyRuntime]);

  // ── 结束：挑战运行时判定 over 后，驱动会话收尾 ──
  useEffect(() => {
    if (runtime.over && isRunning) {
      /*
       * 先同步「结束前的最后计数」再 finish：
       * 命尽那一题已经计入 completedCount，但 React 的 state 尚未落地时
       * 就 finish 会少算一题。这里直接读操作后的最新会话状态。
       */
      finish();
    }
  }, [runtime.over, isRunning, finish]);

  /** 放弃本轮（返回 / 重开） */
  const abandon = useCallback(() => {
    applyRuntime(createChallengeRuntime(config));
    setResult(null);
    setSubmitState('idle');
    setSubmitInfo(null);
    setSubmitError(null);
    reset();
  }, [config, reset, applyRuntime]);

  return {
    mode,
    config,
    runtime,
    session,
    metrics,
    imeComposing,
    keyboardAttached,
    startError,
    clearStartError,
    result,
    submitState,
    submitInfo,
    submitError,
    isRunning,
    startChallenge,
    abandon,
    skip,
    reset,
  };
}
