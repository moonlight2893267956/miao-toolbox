/**
 * 挑战 Tab（挑战三件套 + 排行榜）。
 *
 * 结构：
 *   ① 模式卡（限时冲刺 / 生存挑战 / 每日挑战），每张显示规则与个人最佳
 *   ② 每日挑战打卡卡（今日状态 / 连续天数 / 最近 7 天点阵）
 *   ③ 排行榜（总榜 / 日榜 × 三模式）
 *
 * 进入某一模式后由 `ChallengeSessionView` 接管（用 `key` 保证换模式即换会话实例，
 * 否则上一局的剩余生命会被带到下一局）。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DashboardOutlined, HeartOutlined, CalendarOutlined, ThunderboltOutlined,
  ReloadOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import PracticeBoard from '../components/PracticeBoard';
import ChallengeHud from '../components/ChallengeHud';
import ChallengeResultPanel from '../components/ChallengeResultPanel';
import DailyChallengeCard from '../components/DailyChallengeCard';
import LeaderboardPanel from '../components/LeaderboardPanel';
import { useChallengeSession } from '../utils/wubi/useChallengeSession';
import { useWubiData, bucketsForPhraseLength } from '../utils/wubi/useWubiData';
import { useWubiStorage } from '../utils/wubi/useWubiStorage';
import {
  CHALLENGE_CONFIGS,
  CHALLENGE_ORDER,
  DAILY_QUESTION_COUNT,
  computeChallengeScore,
  type ChallengeMode,
} from '../utils/wubi/challenge';
import { challengeStreak, recentDays, isDailyCompleted } from '../utils/wubi/dailyChallenge';
import type { ChallengeProgress } from '../utils/wubi/storage';
import { todayKey } from '../utils/wubi/statsAggregation';
import type { CharMap, PhraseMap } from '../utils/wubi/code';

const MODE_ICONS: Record<ChallengeMode, React.ReactNode> = {
  sprint: <ThunderboltOutlined />,
  survival: <HeartOutlined />,
  daily: <CalendarOutlined />,
};

/** 打卡点阵展示天数 */
const RECENT_DAYS = 7;

interface ChallengeTabProps {
  onOpenSplitDemo?: (char: string) => void;
}

// ═══════════════════════════════════════════════════════
// 进行中的挑战
// ═══════════════════════════════════════════════════════

interface ChallengeSessionViewProps {
  mode: ChallengeMode;
  charMap: CharMap;
  phraseMap: PhraseMap;
  onOpenSplitDemo?: (char: string) => void;
  onExit: () => void;
}

const ChallengeSessionView: React.FC<ChallengeSessionViewProps> = ({
  mode, charMap, phraseMap, onOpenSplitDemo, onExit,
}) => {
  const {
    config, runtime, session, metrics, imeComposing, keyboardAttached,
    startError, clearStartError, result, submitState, submitInfo, submitError,
    isRunning, startChallenge, abandon,
  } = useChallengeSession({ mode, charMap, phraseMap });

  const { loadChallengeProgress } = useWubiStorage();
  /**
   * 本轮开始前的个人最佳（结算面板的「本次 vs 最佳」用它）。
   *
   * 用 state 而不是 ref：它要参与渲染，而渲染期读 ref 是 React 明令禁止的
   * （eslint react-hooks/refs 会直接报错）。
   */
  const [previousBest, setPreviousBest] = useState<number | null>(null);

  const beginRound = useCallback(() => {
    setPreviousBest(loadChallengeProgress().bests[mode]?.score ?? null);
    startChallenge();
  }, [loadChallengeProgress, mode, startChallenge]);

  /*
   * 会话处于 idle 就开一轮。同时覆盖两种情形：
   *   1. 刚进入挑战 → 立刻开始；
   *   2. 用户按 Esc → 会话层把它映射成 reset（回到 idle）→ 这里重新开一轮。
   *      少了这一步，Esc 之后会停在一个没有任何题目的空看板上。
   *
   * 启动失败时**不重试**（错误由下方分支展示），否则会陷入
   * 「启动失败 → 回到 idle → 再启动」的死循环。
   */
  useEffect(() => {
    if (startError) return;
    if (session.status !== 'idle') return;
    beginRound();
  }, [session.status, startError, beginRound]);

  const correctQuestions = Math.max(0, session.completedCount - session.wrongQuestionCount);
  const score = computeChallengeScore(mode, {
    correctChars: session.correctCharCount,
    correctQuestions,
  });

  const handleExit = useCallback(() => {
    abandon();
    onExit();
  }, [abandon, onExit]);

  if (startError) {
    return (
      <div className="wt-practice-loading">
        <p className="wt-practice-loading__error">无法开始挑战：{startError}</p>
        <button type="button" className="wt-practice-loading__retry" onClick={() => { clearStartError(); beginRound(); }}>
          重试
        </button>
        <button type="button" className="wt-practice-loading__back" onClick={handleExit}>返回</button>
      </div>
    );
  }

  return (
    <div className="wt-challenge-session">
      <div className="wt-challenge-session__bar">
        <button type="button" className="wt-practice-session__back" onClick={handleExit}>
          <ArrowLeftOutlined /> 退出挑战
        </button>
        <span className="wt-challenge-session__mode">{config.label}</span>
        <span className="wt-challenge-session__rule">{config.scoreHint}</span>
      </div>

      <ChallengeHud mode={mode} runtime={runtime} session={session} score={score} />

      {imeComposing && (
        <div className="wt-ime-warning">
          ⚠ 请切换到英文输入状态（当前中文输入法会拦截按键）
        </div>
      )}
      {isRunning && !keyboardAttached && (
        <div className="wt-ime-warning">
          ⚠ 当前窗口宽度不足 1024px，键盘监听未启用。请加宽窗口后重开。
        </div>
      )}

      <PracticeBoard
        session={session}
        metrics={metrics}
        showVirtualKeyboard
        // 挑战用 HUD 取代指标条：同一屏里两套数字会互相打架
        showMetricsBar={false}
        frozen={session.status === 'finished'}
        onOpenSplitDemo={onOpenSplitDemo ?? (() => {})}
      />

      {session.status === 'finished' && result && runtime.overReason && (
        <ChallengeResultPanel
          result={result}
          overReason={runtime.overReason}
          previousBest={previousBest}
          submitState={submitState}
          submitInfo={submitInfo}
          submitError={submitError}
          onRestart={beginRound}
          onExit={handleExit}
        />
      )}

      {isRunning && (
        <div className="wt-practice-session__footer-info">
          <span className="wt-practice-session__hotkeys">
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 跳过 · <kbd>Esc</kbd> 重开本轮
          </span>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// 挑战大厅
// ═══════════════════════════════════════════════════════

const ChallengeTab: React.FC<ChallengeTabProps> = ({ onOpenSplitDemo }) => {
  const [activeMode, setActiveMode] = useState<ChallengeMode | null>(null);

  const { loadChallengeProgress } = useWubiStorage();
  /**
   * 挑战本地进度（个人最佳 / 打卡日期）。
   *
   * 懒初始化读一次存储，之后只在**回到大厅时**主动刷新 ——
   * 不用 effect 同步（那会在挂载后立刻触发一次多余渲染）。
   */
  const [progress, setProgress] = useState<ChallengeProgress>(() => loadChallengeProgress());

  const {
    state: dataState, loadChars, loadPhrases, retryChars, retryPhrases,
    charsReady, phraseDataFor,
  } = useWubiData();

  /**
   * 挑战固定使用「二字词」作为进阶阶段的题池。
   *
   * 必须等它加载完才开始：题源是「单字 → 词组」两段式的，
   * 词组没到位就会降级成全程单字 —— 那样每日挑战在不同设备上
   * 会给出**不同的题组**，固定题组的前提就没了。
   */
  const phraseBuckets = useMemo(() => bucketsForPhraseLength(2), []);
  const phrase = phraseDataFor(phraseBuckets);
  const phrasesReady = phrase.status === 'ready' && phrase.map !== null;

  const today = todayKey();

  // 首次进入拉取码表；挑战需要「单字 + 二字词」两份数据
  useEffect(() => {
    if (!charsReady) loadChars();
    if (!phrasesReady) loadPhrases(phraseBuckets);
  }, [charsReady, phrasesReady, loadChars, loadPhrases, phraseBuckets]);

  const dailyDates = progress.dailyCompletedDates ?? [];
  const dailyDone = isDailyCompleted(dailyDates, today);
  const streak = challengeStreak(dailyDates, today);

  const dataFailed = dataState.charsStatus === 'failed' || phrase.status === 'failed';
  const dataLoading = !charsReady || !phrasesReady;

  const handleStart = useCallback((mode: ChallengeMode) => {
    if (dataLoading) return;
    setActiveMode(mode);
  }, [dataLoading]);

  if (activeMode && charsReady && phrase.map) {
    return (
      <ChallengeSessionView
        // key = 模式：换模式即换会话实例，避免上一局的剩余生命被带过来
        key={activeMode}
        mode={activeMode}
        charMap={dataState.chars!}
        phraseMap={phrase.map}
        onOpenSplitDemo={onOpenSplitDemo}
        onExit={() => {
          setActiveMode(null);
          // 刚打完一局：重读一次本地进度，让新纪录 / 新打卡立刻反映到大厅
          setProgress(loadChallengeProgress());
        }}
      />
    );
  }

  return (
    <div className="wt-challenge">
      <header className="wt-challenge__hero">
        <h2 className="wt-challenge__title"><DashboardOutlined /> 挑战</h2>
        <p className="wt-challenge__subtitle">
          三种玩法共用一套计时与计分：刷纪录、拼生存、每天一套固定题。
        </p>
      </header>

      <div className="wt-challenge__modes">
        {CHALLENGE_ORDER.map((mode) => {
          const config = CHALLENGE_CONFIGS[mode];
          const best = progress.bests?.[mode];
          return (
            <button
              key={mode}
              type="button"
              className="wt-challenge-card"
              onClick={() => handleStart(mode)}
              disabled={dataLoading}
            >
              <span className="wt-challenge-card__icon">{MODE_ICONS[mode]}</span>
              <span className="wt-challenge-card__label">{config.label}</span>
              <span className="wt-challenge-card__tagline">{config.tagline}</span>
              <span className="wt-challenge-card__hint">{config.scoreHint}</span>
              <span className="wt-challenge-card__best">
                {best
                  ? <>最佳 <strong>{best.score}</strong></>
                  : '还没挑战过'}
              </span>
            </button>
          );
        })}
      </div>

      {dataLoading && !dataFailed && (
        <p className="wt-challenge__loading">正在加载题源数据…</p>
      )}
      {dataFailed && (
        <div className="wt-challenge__data-error">
          <span>{dataState.charsError || phrase.error || '题源数据加载失败'}</span>
          <button
            type="button"
            className="wt-challenge-btn"
            onClick={() => {
              if (!charsReady) retryChars();
              if (!phrasesReady) retryPhrases(phraseBuckets);
            }}
          >
            <ReloadOutlined /> 重试
          </button>
        </div>
      )}

      <DailyChallengeCard
        today={today}
        completed={dailyDone}
        score={dailyDone ? (progress.bests?.daily?.score ?? null) : null}
        streak={streak}
        recentDays={recentDays(RECENT_DAYS, today)}
        completedDates={dailyDates}
        maxScore={DAILY_QUESTION_COUNT}
        disabled={dataLoading}
        onStart={() => handleStart('daily')}
      />

      <LeaderboardPanel />
    </div>
  );
};

export default ChallengeTab;
