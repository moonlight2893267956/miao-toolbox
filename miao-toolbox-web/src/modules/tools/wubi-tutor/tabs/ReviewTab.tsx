/**
 * 复习 Tab
 *
 * 展示今日待复习 / 已掌握统计，支持一键进入复习模式（仅出题 + 快速反馈）。
 * 复习模式复用 char-code 题源，范围限定为待复习集合。
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  SyncOutlined,
  PlayCircleFilled,
  DeleteOutlined,
  EyeOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import PracticeBoard from '../components/PracticeBoard';
import { usePracticeSession } from '../utils/wubi/usePracticeSession';
import { useWubiData } from '../utils/wubi/useWubiData';
import { useReview } from '../utils/wubi/useReview';
import { createCharCodeSource } from '../utils/wubi/questionSource';
import { getIntervalMs, buildAnswersFromResult } from '../utils/wubi/reviewScheduler';
import { useWubiStorage } from '../utils/wubi/useWubiStorage';
import { PRACTICE_MODE_KEYS } from '../utils/wubi/sessionStats';
import type { SessionResult } from '../utils/wubi/session';

interface ReviewTabProps {
  onOpenSplitDemo?: (char: string) => void;
}

/** 复习轮次题量上限 */
const REVIEW_ROUND_SIZE = 20;

function formatInterval(level: number | undefined): string {
  const ms = getIntervalMs(level ?? 0);
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} 分钟`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} 小时`;
  return `${Math.round(hours / 24)} 天`;
}

const ReviewTab: React.FC<ReviewTabProps> = ({ onOpenSplitDemo }) => {
  const { state: dataState, loadChars, charsReady, retryChars } = useWubiData();
  const {
    items, dueItems, stats, refresh, answerReviewBatch, remove, removeAllMastered,
    // 判断单项是否到期要用它，而不是在渲染里叫 Date.now()（见 useReview 里的说明）
    now,
  } = useReview();

  const [reviewing, setReviewing] = useState(false);
  const [lastResult, setLastResult] = useState<SessionResult | null>(null);

  const { recordSession } = useWubiStorage();

  const handleSessionEnd = useCallback((result: SessionResult) => {
    setLastResult(result);

    // 一次性合并回写（切勿循环调用单条 API：闭包快照会互相覆盖）
    answerReviewBatch(
      buildAnswersFromResult(result.attemptedChars, result.wrongChars),
    );

    /*
     * 复习也要计入日统计与 Streak——否则「今天复习了 20 个字」
     * 不会体现在成绩页，今日计划的复习任务也无法判定完成。
     *
     * !! 必须传 enqueueWrongChars: false !!
     * 错题队列已由上面的 answerReviewBatch（reviewScheduler）回写完毕，
     * 若让 recordSession 再入队一次，每个答错的字会被
     * scheduleNext 和 upsertReviewItem 各加一次 wrongCount → 双计。
     */
    recordSession(result, PRACTICE_MODE_KEYS.review, { enqueueWrongChars: false });
  }, [answerReviewBatch, recordSession]);

  const {
    session, metrics, imeComposing, keyboardAttached,
    startError, clearStartError, start, reset, isRunning,
  } = usePracticeSession({ mode: 'drill', onSessionEnd: handleSessionEnd });

  // 进入复习时按需加载码表
  useEffect(() => {
    if (reviewing && !charsReady) loadChars();
  }, [reviewing, charsReady, loadChars]);

  // 码表就绪后启动复习会话
  useEffect(() => {
    if (!reviewing || !charsReady || session.status !== 'idle' || startError) return;
    const chars = dueItems.map((it) => it.char);
    if (chars.length === 0) return;
    const source = createCharCodeSource(
      { count: Math.min(REVIEW_ROUND_SIZE, chars.length), chars },
      dataState.chars!,
    );
    start(source);
    // dueItems 每次 refresh 都会变，仅在本轮启动时消费一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, charsReady, session.status, startError, dataState.chars, start]);

  // 复习 Tab 常驻时，「待复习」计数会随时间推移变化（间隔到期），
  // 定期刷新 now 让计数与列表状态保持准确。
  useEffect(() => {
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const handleStartReview = useCallback(() => {
    setLastResult(null);
    // 清掉上一次的启动错误，否则会被 effect 的 startError 守卫永久拦住
    clearStartError();
    reset();
    setReviewing(true);
  }, [reset, clearStartError]);

  const handleExitReview = useCallback(() => {
    reset();
    setReviewing(false);
    setLastResult(null);
    refresh();
  }, [reset, refresh]);

  // ── 复习进行中 ──
  if (reviewing) {
    const charsFailed = dataState.charsStatus === 'failed';
    if (charsFailed) {
      return (
        <div className="wt-practice-loading">
          <p className="wt-practice-loading__error">{dataState.charsError || '码表加载失败'}</p>
          <button className="wt-practice-loading__retry" onClick={retryChars}>重试</button>
          <button className="wt-practice-loading__back" onClick={handleExitReview}>返回</button>
        </div>
      );
    }

    // 启动失败：显式提示，避免停留在空白看板被误认为「按键无反应」
    if (startError) {
      return (
        <div className="wt-practice-loading">
          <p className="wt-practice-loading__error">无法开始复习：{startError}</p>
          <button className="wt-practice-loading__retry" onClick={handleStartReview}>重试</button>
          <button className="wt-practice-loading__back" onClick={handleExitReview}>返回</button>
        </div>
      );
    }

    if (!charsReady || session.status === 'idle') {
      return (
        <div className="wt-practice-loading">
          <div className="wt-tutorial__loading-spinner" />
          <p>正在准备复习…</p>
        </div>
      );
    }

    return (
      <div className="wt-practice-session">
        <div className="wt-practice-session__bar">
          <button className="wt-practice-session__back" onClick={handleExitReview}>← 退出复习</button>
          <span className="wt-practice-session__mode"><SyncOutlined /> 复习模式</span>
          <span className="wt-practice-session__progress">
            {session.completedCount} / {session.questionState?.total ?? '∞'}
          </span>
        </div>

        {imeComposing && (
          <div className="wt-ime-warning">
            ⚠ 请切换到英文输入状态（当前中文输入法会拦截按键）
          </div>
        )}
        {isRunning && !keyboardAttached && (
          <div className="wt-ime-warning">
            ⚠ 当前窗口宽度不足 1024px，键盘监听未启用。
          </div>
        )}

        <PracticeBoard
          session={session}
          metrics={metrics}
          showVirtualKeyboard
          showMetricsBar
          frozen={session.status === 'finished'}
          onOpenSplitDemo={onOpenSplitDemo ?? (() => {})}
        />

        {session.status === 'finished' && lastResult && (
          <div className="wt-practice-result">
            <h3>本轮复习完成</h3>
            <div className="wt-practice-result__grid">
              <div className="wt-practice-result__item">
                <span className="wt-practice-result__value">{lastResult.totalQuestions}</span>
                <span className="wt-practice-result__label">题数</span>
              </div>
              <div className="wt-practice-result__item">
                <span className="wt-practice-result__value">
                  {(lastResult.accuracy * 100).toFixed(0)}%
                </span>
                <span className="wt-practice-result__label">准确率</span>
              </div>
              <div className="wt-practice-result__item">
                <span className="wt-practice-result__value">{lastResult.maxCombo}</span>
                <span className="wt-practice-result__label">最大连击</span>
              </div>
              <div className="wt-practice-result__item">
                <span className="wt-practice-result__value">{stats.due}</span>
                <span className="wt-practice-result__label">剩余待复习</span>
              </div>
            </div>
            <div className="wt-practice-result__actions">
              <button
                className="wt-practice-result__btn wt-practice-result__btn--primary"
                onClick={handleStartReview}
              >
                再来一轮
              </button>
              <button className="wt-practice-result__btn" onClick={handleExitReview}>
                返回错题本
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 错题本 ──
  const hasItems = stats.total > 0;

  return (
    <div className="wt-review">
      {/* 统计卡片 */}
      <div className="wt-review__stats">
        <div className="wt-review__stat wt-review__stat--due">
          <span className="wt-review__stat-value">{stats.due}</span>
          <span className="wt-review__stat-label">今日待复习</span>
        </div>
        <div className="wt-review__stat">
          <span className="wt-review__stat-value">{stats.total}</span>
          <span className="wt-review__stat-label">错题总数</span>
        </div>
        <div className="wt-review__stat wt-review__stat--mastered">
          <span className="wt-review__stat-value">{stats.mastered}</span>
          <span className="wt-review__stat-label">已掌握</span>
        </div>
      </div>

      {/* 操作 */}
      <div className="wt-review__actions">
        <button
          className="wt-review__start"
          onClick={handleStartReview}
          disabled={stats.due === 0 || !hasItems}
        >
          <PlayCircleFilled /> 开始复习{stats.due > 0 ? `（${stats.due} 字）` : ''}
        </button>
        {stats.mastered > 0 && (
          <button className="wt-review__clean" onClick={removeAllMastered}>
            <CheckCircleOutlined /> 清空已掌握（{stats.mastered}）
          </button>
        )}
      </div>

      {/* 空状态 */}
      {!hasItems && (
        <div className="wt-placeholder">
          <div className="wt-placeholder__icon"><SyncOutlined /></div>
          <h2 className="wt-placeholder__title">错题本是空的</h2>
          <p className="wt-placeholder__desc">
            练习中出错的<strong>单字</strong>会自动进入复习队列，按「10 分钟 → 1 天 → 3 天 →
            7 天 → 15 天 → 30 天」的间隔安排复习。答对逐级延长，答错回到第一级。
          </p>

          {/*
            边界说明，必须有。
            原文只说「出错的字会自动进入复习队列」，读起来是「只要错了就会在这看到」——
            而键位 / 字根 / 词组 / 文章的题面不是单字，压根进不来。
            用户据此判断「功能坏了」，实际是设计如此。
          */}
          <p className="wt-placeholder__desc wt-placeholder__desc--note">
            只有单字类题（单字拆分 / 简码专项）的错字进得来。
            键位热身、字根定位、字根序列、课程闯关、词组输入、文章练习（含自定义文本）
            的错处对应不到具体某个汉字，所以进不了这里 ——
            那类错处看<strong>每轮练习结束后结果面板里的「易混字根榜」</strong>。
          </p>
        </div>
      )}

      {/* 错题清单 */}
      {hasItems && (
        <div className="wt-review__list-wrap">
          <h4 className="wt-review__list-title">错题清单</h4>
          <div className="wt-review__list">
            {[...items]
              .sort((a, b) => a.nextReview - b.nextReview)
              .map((item) => {
                // 与 dueItems / stats 同一个 now：来源一致，不会两套口径
                const due = item.nextReview <= now;
                return (
                  <div
                    key={item.char}
                    className={`wt-review__item${due ? ' wt-review__item--due' : ''}`}
                  >
                    <span className="wt-review__item-char">{item.char}</span>
                    <span className="wt-review__item-meta">
                      错 {item.wrongCount} 次 · 间隔 {formatInterval(item.level)}
                    </span>
                    <span className={`wt-review__item-state${due ? ' wt-review__item-state--due' : ''}`}>
                      {due ? '待复习' : '已排期'}
                    </span>
                    <button
                      className="wt-review__item-btn"
                      title="查看拆分演示"
                      onClick={() => onOpenSplitDemo?.(item.char)}
                    >
                      <EyeOutlined />
                    </button>
                    <button
                      className="wt-review__item-btn wt-review__item-btn--danger"
                      title="从错题本移除"
                      onClick={() => remove(item.char)}
                    >
                      <DeleteOutlined />
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewTab;
