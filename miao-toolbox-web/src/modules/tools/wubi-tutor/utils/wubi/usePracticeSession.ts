/**
 * 练习会话 Hook
 *
 * 串联：会话状态机 + 键盘捕获 + 指标计算。
 *
 * 性能（NFR-1）：keydown 内只做状态迁移（纯函数），不做持久化；
 * 持久化在会话结束时一次性执行。
 */

import { useReducer, useCallback, useMemo, useRef, useEffect, useState } from 'react';
import {
  createInitialSessionState,
  startSession as startSessionPure,
  handleAnswerKey,
  retryCurrentQuestion as retryPure,
  skipCurrentQuestion as skipPure,
  resumeSession as resumePure,
  confirmShortAnswer,
  type SessionCounters,
  computeSessionResult,
  type SessionState,
  type SessionResult,
  type SessionMode,
} from './session';
import type { QuestionSource } from './questionSource';
import {
  computeMetrics,
  calculateAccuracy,
  calculateValidKeystrokeRate,
  type KeystrokeRecord,
  type MetricsSnapshot,
} from './metrics';
import { useKeyboardCapture } from './useKeyboardCapture';
import { randomSeed } from './rng';

/*
 * ── 为什么没有 reducer ──
 *
 * 状态迁移**必须发生在事件回调里**，不能放进 reducer。
 *
 * reducer 必须是纯函数，而这里每一条迁移都要推进题源（`source.next()`），
 * 它会改写题源的内部状态（`used` 集合 + 随机数发生器）。React 在严格模式下
 * **会把 reducer 调用两次**（用于暴露不纯的 reducer），于是每答一题题源前进两次 ——
 * 用户看到的题目顺序仍正常（多抽的那题被丢掉），只有在**中断恢复**时才暴露：
 * 快照记 `completed = 2`，真实位置却已经在第 5 题上，恢复出来就是相邻的题目。
 *
 * 当初把迁移塞进 reducer 是为了另一个正确目标：同一 tick 内的连续按键
 * （快速输入 / 按住重复）如果都基于闭包里的旧 `session`，会丢键。
 * 现在用 `stateRef` 同步保存最新状态，两个目标同时满足：
 * 迁移在回调里只发生一次，且永远基于最新状态。
 */

// ─── Hook ────────────────────────────────────────────────

export interface UsePracticeSessionOptions {
  mode: SessionMode;
  onSessionEnd?: (result: SessionResult) => void;
}

export function usePracticeSession(options: UsePracticeSessionOptions) {
  const { mode, onSessionEnd } = options;

  const [session, setSessionState] = useState<SessionState>(createInitialSessionState);

  /**
   * 会话状态的最新值（同步）。
   *
   * !! 状态迁移读的必须是它，不是 `session` !!
   *
   * `session` 是**这一次渲染**的那一份。同一 tick 内连续按键（快速输入 /
   * 按住重复）如果都读它，就会全部基于同一份旧状态而丢键。
   * 这个 ref 与 state 由 `applySession` 一起更新，是全 Hook 唯一的写入口。
   */
  const stateRef = useRef<SessionState>(session);

  /** 会话状态唯一写入口：ref 与 state 同步更新 */
  const applySession = useCallback((next: SessionState) => {
    stateRef.current = next;
    setSessionState(next);
  }, []);

  /** 会话启动失败原因（题源构造/出题抛错时暴露给 UI，避免静默失败） */
  const [startError, setStartError] = useState<string | null>(null);
  /** 已用时（秒）。由定时器推进，会话结束后冻结 */
  const [elapsedSec, setElapsedSec] = useState(0);
  const sourceRef = useRef<QuestionSource | null>(null);
  /** 0 表示会话尚未开始（不可用于时间差计算） */
  const startTimeRef = useRef<number>(0);
  /**
   * 会话起点时间戳的**渲染副本**（0 = 未开始）。
   *
   * ref 仍是权威（定时器与结束判定都读它，那些地方读 ref 是合法的）；
   * 这一份只为渲染准备 —— 在渲染期读 ref 是 React 明令禁止的，
   * 而 metrics 的计算恰恰发生在渲染期。
   */
  const [startedAt, setStartedAt] = useState(0);
  const keystrokesRef = useRef<KeystrokeRecord[]>([]);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  const endFiredRef = useRef(false);

  // ── 启动会话 ──
  /**
   * 本轮题序种子。
   *
   * !! 为什么它必须住在这里，而不是调用方的组件 ref !!
   *
   * 题序是「种子 → 序列」的纯函数关系。种子一旦与**真正驱动题序的那个题源**
   * 分家，恢复就会落到另一轮题上 —— 而界面看起来完全正常（题目就是另一个字），
   * 用户只会觉得「刷新后题变了」，根本无从查起。
   *
   * 曾经种子放在 PracticeTab 的 `useRef(randomSeed())` 里：组件只要重新挂载
   * 一次，ref 就变成新种子，而会话与题源还是旧的那个，两者永久错开，
   * 快照记的种子再也对不上当时的题序。
   *
   * 现在它与 `sourceRef` 同住一个 Hook、同一个生命周期：
   * 重挂载时题源与种子**一起**重置，结构上不可能只变一个。
   */
  const seedRef = useRef<number>(randomSeed());

  /** 唯一写入口：ref 与渲染副本必须同时更新，分开写迟早漂移 */
  const markSessionStart = useCallback((at: number) => {
    startTimeRef.current = at;
    setStartedAt(at);
  }, []);

  /**
   * 开新一轮：生成（或采纳）种子并记住它，返回供调用方建题源。
   * @param seed 恢复场景传入快照里的种子；不传则新生成
   */
  const beginRound = useCallback((seed?: number): number => {
    seedRef.current = seed === undefined ? randomSeed() : (seed >>> 0);
    return seedRef.current;
  }, []);

  /**
   * 本轮种子（实时读取）。
   *
   * 做成函数而非返回值：调用方（写快照的地方）在闭包里持有它，
   * 读取时必须拿到**当前**这一轮的值，而不是它被 memo 住时的旧值。
   */
  const getSeed = useCallback((): number => seedRef.current, []);

  const start = useCallback((source: QuestionSource) => {
    try {
      sourceRef.current = source;
      markSessionStart(Date.now());
      keystrokesRef.current = [];
      endFiredRef.current = false;
      const newState = startSessionPure(createInitialSessionState(), source);
      setStartError(null);
      setElapsedSec(0);
      applySession(newState);
    } catch (err) {
      // 题源出题失败（如空文章/无可练习字）：显式暴露，不静默停在 idle
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[usePracticeSession] 会话启动失败:', err);
      sourceRef.current = null;
      setStartError(msg);
      applySession(createInitialSessionState());
    }
    /*
     * mode 在本函数里并未被读到（它只影响答题判定，那在 answer 里用）。
     * !! 提示：下面 answer 的依赖里 mode 是必需的，别照抄这里删掉 !!
     */
  }, [applySession, markSessionStart]);

  /**
   * 从中断现场恢复会话。
   *
   * 与 `start` 的差别有三处：
   * 1. 题源必须由调用方用**同一个种子**重建，否则题序对不上；
   * 2. 起点时间前移 `elapsedMs`，让「已用时」从原处接着走 ——
   *    离开页面的那段时间不计入（速度的分母只算真正在练的时间）；
   * 3. 击键时间戳清空：过去的没保留，速度滑窗从零开始（会先显示 0，属正常）。
   *
   * @returns 是否恢复成功；题量已满 / 已完成数越界时为 false，调用方应丢弃快照
   */
  const resume = useCallback((
    source: QuestionSource,
    completed: number,
    counters: SessionCounters,
    elapsedMs: number,
    inputKeys: string[] = [],
  ): boolean => {
    try {
      /*
       * 前置校验用 init()：它只重建 `{index, total, internal}` 并把发生器
       * 重置回种子起点（见 rng.ts 的约定），所以可以安全地先探一次。
       */
      const total = source.init().total;
      if (!Number.isInteger(completed) || completed < 0) return false;
      if (total !== null && completed >= total) return false;

      // 恢复失败（题量已满 / 已完成数越界）时给出 null：保持原状态，由调用方兜底
      const next = resumePure(stateRef.current, source, completed, counters, inputKeys);
      if (!next) return false;

      sourceRef.current = source;
      // 起点前移：Date.now() - elapsedMs ⇒ 已用时立刻从 elapsedMs 接着走
      markSessionStart(Date.now() - elapsedMs);
      keystrokesRef.current = [];
      endFiredRef.current = false;
      setStartError(null);
      setElapsedSec(elapsedMs / 1000);
      applySession(next);
      return true;
    } catch (err) {
      console.error('[usePracticeSession] 恢复中断练习失败:', err);
      sourceRef.current = null;
      applySession(createInitialSessionState());
      return false;
    }
  }, [applySession, markSessionStart]);

  const clearStartError = useCallback(() => setStartError(null), []);

  // ── 答题 ──
  const answer = useCallback((key: string) => {
    const source = sourceRef.current;
    if (!source) return;

    /*
     * 读 `stateRef` 而非 `session`：同一 tick 内的连续按键必须依次基于
     * 前一键的结果，否则快速输入 / 按住重复会丢键（见 stateRef 的说明）。
     */
    const current = stateRef.current;

    try {
      /*
       * 迁移在回调里**只发生一次** —— 这是本次改动的核心。
       * 放进 reducer 会被严格模式双调，而 `handleAnswerKey` 会推进题源
       * （改写 used 集合与随机数发生器），于是每答一题题源前进两次：
       * 用户看到的题序仍正常，但中断恢复会落到相邻的题目上。
       */
      applySession(handleAnswerKey(current, source, mode, key));

      /*
       * 记录击键（仅供速度滑窗使用；计数与准确率以 session 为准）。
       *
       * `typedChars` 把本题的完成量**按码长均摊**到每一键：
       * 有字数的题按字折算（四码字 = 0.25 字/键），
       * 键位 / 字根类题按「题」折算（本题量 = 1）。
       *
       * 不用「完成那一刻才计入」的原因：文章模式整篇是一道大题，
       * 那样整个练习过程的速度都会显示 0，最后一键又突然冲高。
       */
      const question = current.currentQuestion;
      const pos = question ? current.inputKeys.length : 0;
      const wasCorrect = question
        ? question.answerKeys[pos] === key
          || (question.altAnswers?.some((alt) => alt[pos] === key) ?? false)
        : false;

      const unitPerQuestion = (question?.charCount ?? 0) > 0 ? question!.charCount! : 1;
      const typedChars = wasCorrect && question
        ? unitPerQuestion / question.answerKeys.length
        : undefined;

      keystrokesRef.current.push({
        timestamp: Date.now(),
        correct: wasCorrect,
        typedChars,
      });
      forceUpdate();
    } catch (err) {
      // 出题失败（如题源耗尽）：显式暴露，避免按键静默失效
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[usePracticeSession] 出题失败:', err);
      setStartError(msg);
      applySession(createInitialSessionState());
    }
  }, [mode, applySession]);

  // ── 修正错误 ──
  const retry = useCallback(() => {
    applySession(retryPure(stateRef.current));
  }, [applySession]);

  // ── 跳过 ──
  const skip = useCallback(() => {
    const source = sourceRef.current;
    if (!source) return;
    applySession(skipPure(stateRef.current, source));
  }, [applySession]);

  // ── 简码确认（空格）──
  // 打完一级/二三级简码后按空格出字；输入不是任何简码时无副作用
  const confirmShort = useCallback(() => {
    const source = sourceRef.current;
    if (!source) return;
    applySession(confirmShortAnswer(stateRef.current, source));
  }, [applySession]);

  // ── 重置 ──
  const reset = useCallback(() => {
    sourceRef.current = null;
    markSessionStart(0);
    keystrokesRef.current = [];
    endFiredRef.current = false;
    setElapsedSec(0);
    applySession(createInitialSessionState());
  }, [applySession, markSessionStart]);

  // ── 键盘捕获 ──
  const isRunning = session.status === 'running' || session.status === 'feedback';

  const { imeComposing, attached: keyboardAttached } = useKeyboardCapture(isRunning, {
    onAnswer: answer,
    // 空格：打完简码后确认出字（五笔的真实行为）
    onSpaceConfirm: confirmShort,
    onSelectCandidate: () => {
      // 重码选择暂未实现（v1 码表重码率极低）
    },
    onEscape: reset,
    onRestartRound: () => {
      if (sourceRef.current) start(sourceRef.current);
    },
    onSkip: skip,
  });

  // ── 计时器：running 期间每 200ms 推进「已用时」 ──
  useEffect(() => {
    if (!isRunning) return;

    const tick = () => {
      if (startTimeRef.current > 0) {
        setElapsedSec((Date.now() - startTimeRef.current) / 1000);
      }
    };
    tick(); // 立即同步一次，避免首帧显示 0

    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [isRunning]);

  // ── 指标计算 ──
  // 计数与准确率以 session 为唯一事实来源；击键时间戳数组只用于速度滑窗。
  // elapsedSec 必须进依赖，否则会话启动时 memo 不会重算，会残留启动前的值。
  const metrics: MetricsSnapshot = useMemo(() => {
    // 优先用渲染副本（state）而不是 ref：渲染期读 ref 是禁止的
    const now = startedAt > 0 ? startedAt + elapsedSec * 1000 : 0;

    const base = computeMetrics(
      /*
       * keystrokesRef 是**刻意**保留的 ref 读法，不是漏改。
       *
       * 击键时间戳是高频写入的热路径缓冲：模块明确要求「不在 keydown 内做
       * 持久化与重计算」（见 components/PracticeBoard 的文件头），
       * 改成 state 会给每次击键加一次数组分配。性能约束由 perf.test.ts 守着。
       */
      // eslint-disable-next-line react-hooks/refs
      keystrokesRef.current,
      startedAt,
      now,
      session.combo,
      session.maxCombo,
    );
    return {
      ...base,
      totalKeystrokes: session.totalKeystrokes,
      errorKeystrokes: session.errorKeystrokes,
      accuracy: calculateAccuracy(session.totalKeystrokes, session.errorKeystrokes),
      validKeystrokeRate: calculateValidKeystrokeRate(session.totalKeystrokes, session.errorKeystrokes),
    };
  }, [
    elapsedSec,
    startedAt,
    session.totalKeystrokes,
    session.errorKeystrokes,
    session.combo,
    session.maxCombo,
  ]);

  // ── 会话结束：产出结果 + 一次性回调 ──
  useEffect(() => {
    if (session.status === 'finished' && !endFiredRef.current) {
      endFiredRef.current = true;
      const durationSec = startTimeRef.current > 0
        ? (Date.now() - startTimeRef.current) / 1000
        : 0;
      const result = computeSessionResult(session, durationSec);
      onSessionEnd?.(result);
    }
  }, [session, onSessionEnd]);

  return {
    session,
    metrics,
    imeComposing,
    keyboardAttached,
    startError,
    clearStartError,
    start,
    resume,
    beginRound,
    getSeed,
    answer,
    retry,
    skip,
    confirmShort,
    reset,
    isRunning,
  };
}
