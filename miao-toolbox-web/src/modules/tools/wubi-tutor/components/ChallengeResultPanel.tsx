/**
 * 挑战结算面板。
 *
 * 与普通练习的结果面板刻意不同：**以「本次 vs 个人最佳」为主角**。
 * 挑战的意义就是刷纪录，如果结算只报一堆原始指标，
 * 用户不知道自己这局到底算好还是不好。
 *
 * ── 版式意图：一块机械记分牌 ──
 *
 * 成绩落在**内凹托盘**上（不是白底大字），右侧接一条**对比轨**说明
 * 「离个人最佳还差多少」，下面四个指标做成**键帽小卡**，底部是
 * 状态灯 + 操作。左右两栏是为了让宽屏下不再右半边空一大片。
 */

import React from 'react';
import { LinkOutlined, ReloadOutlined, TrophyOutlined } from '@ant-design/icons';
import { CHALLENGE_CONFIGS, type ChallengeResult } from '../utils/wubi/challenge';
import { OVER_REASON_LABELS, type ChallengeOverReason } from '../utils/wubi/challengeState';
import type { ChallengeSubmitState } from '../utils/wubi/useChallengeSession';
import type { SubmitScoreResult } from '../utils/wubi/challengeApi';

interface ChallengeResultPanelProps {
  result: ChallengeResult;
  /** 本轮结束原因；null 表示手动退出（不应渲染本面板） */
  overReason: ChallengeOverReason;
  /** 本轮之前的个人最佳；null 表示首次挑战 */
  previousBest: number | null;
  submitState: ChallengeSubmitState;
  submitInfo: SubmitScoreResult | null;
  submitError: string | null;
  onRestart: () => void;
  onExit: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}分${String(s).padStart(2, '0')}秒` : `${s}秒`;
}

/**
 * 准确率配色分档：只有「准确率」这一项用状态色，其余保持中性，避免整块变成红绿灯。
 * 门槛刻意留宽（60% 才算「偏低」）—— 五笔初学期准确率普遍在六七成，
 * 阈值定高会让新手每次结算都看到一片红。
 */
function accuracyTone(accuracy: number): 'good' | 'mid' | 'low' {
  if (accuracy >= 0.9) return 'good';
  if (accuracy >= 0.6) return 'mid';
  return 'low';
}

const ChallengeResultPanel: React.FC<ChallengeResultPanelProps> = ({
  result,
  overReason,
  previousBest,
  submitState,
  submitInfo,
  submitError,
  onRestart,
  onExit,
}) => {
  const config = CHALLENGE_CONFIGS[result.mode];

  /*
   * 「新纪录」以**服务端判定**为准（多端成绩都算上），
   * 服务端还没回话时先用本地比较兜底 —— 让用户在等待期间就能看到结果，
   * 而不是盯着一个转圈等排行榜。
   */
  const localNewBest = previousBest === null || result.score > previousBest;
  const isNewBest = submitInfo ? submitInfo.newBest : localNewBest;

  const bestAfter = previousBest === null
    ? result.score
    : Math.max(previousBest, result.score);

  const delta = previousBest === null ? null : result.score - previousBest;
  /** 对比轨：本次成绩占个人最佳的比例（最佳为 0 时退化成空轨） */
  const ratio = bestAfter > 0 ? Math.max(0, Math.min(1, result.score / bestAfter)) : 0;

  const unit = result.mode === 'sprint' ? '字' : '题';

  /*
   * 对比文案**永远有内容**。
   * 留空会让对比轨下面空出一块，右半栏看起来像没画完；
   * 而「首次挑战」与「服务端判非新纪录但本地无记录」两种情况必须分开措辞，
   * 否则会出现「首次挑战」却带着旧最佳的自相矛盾。
   */
  const compareHint = isNewBest
    ? previousBest === null
      ? '首次挑战，已记入个人最佳'
      : `比上次最好成绩多 ${result.score - previousBest} ${unit}`
    : previousBest === null
      ? '本局成绩已计入榜单'
      : `距个人最佳还差 ${Math.max(0, previousBest - result.score)} ${unit}`;

  return (
    <div
      className={`wt-challenge-result${isNewBest ? ' wt-challenge-result--record' : ''}`}
      role="dialog"
      aria-label="挑战结算"
    >
      {/* 新纪录：顶部一次性高光条（纯装饰，语义由下方徽记承担） */}
      {isNewBest && <div className="wt-challenge-result__sheen" aria-hidden="true" />}

      <header className="wt-challenge-result__head">
        <span className="wt-challenge-result__mode">{config.label}</span>
        <span className="wt-challenge-result__reason">{OVER_REASON_LABELS[overReason]}</span>
        {isNewBest && (
          <span className="wt-challenge-result__record">
            <TrophyOutlined /> 新纪录
          </span>
        )}
      </header>

      <div className="wt-challenge-result__body">
        {/* 左：本次成绩 */}
        <div className="wt-challenge-result__stage">
          <span className="wt-challenge-result__stage-caption">本次成绩</span>
          <div className="wt-challenge-result__score">
            <span className="wt-challenge-result__score-value">{result.score}</span>
            <span className="wt-challenge-result__score-unit">{unit}</span>
          </div>
        </div>

        {/* 右：与个人最佳的对比轨 */}
        <div className="wt-challenge-result__compare">
          <div className="wt-challenge-result__compare-top">
            <span className="wt-challenge-result__best-label">个人最佳</span>
            <span className="wt-challenge-result__best-value">{bestAfter}</span>
            {delta !== null && delta !== 0 && (
              <span
                className={`wt-challenge-result__delta${
                  delta > 0 ? '' : ' wt-challenge-result__delta--down'
                }`}
              >
                {delta > 0 ? '+' : ''}{delta}
              </span>
            )}
          </div>

          <div
            className="wt-challenge-result__track"
            role="img"
            aria-label={`本次 ${result.score}，个人最佳 ${bestAfter}`}
          >
            <span
              className="wt-challenge-result__track-fill"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
            {/* 起点刻度：让空轨也有「这是从 0 起量」的暗示 */}
            <span className="wt-challenge-result__track-origin" aria-hidden="true" />
          </div>

          <span className="wt-challenge-result__compare-hint">{compareHint}</span>
        </div>
      </div>

      <div className="wt-challenge-result__grid">
        <div className="wt-challenge-result__item">
          <span className="wt-challenge-result__item-value">{result.correctQuestions}</span>
          <span className="wt-challenge-result__item-label">正确题数</span>
        </div>
        <div
          className={`wt-challenge-result__item wt-challenge-result__item--${accuracyTone(result.accuracy)}`}
        >
          <span className="wt-challenge-result__item-value">
            {Math.round(result.accuracy * 100)}
            <span className="wt-challenge-result__item-suffix">%</span>
          </span>
          <span className="wt-challenge-result__item-label">准确率</span>
        </div>
        <div className="wt-challenge-result__item">
          <span className="wt-challenge-result__item-value">{result.maxCombo}</span>
          <span className="wt-challenge-result__item-label">最高连击</span>
        </div>
        <div className="wt-challenge-result__item">
          <span className="wt-challenge-result__item-value">{formatDuration(result.durationSec)}</span>
          <span className="wt-challenge-result__item-label">用时</span>
        </div>
      </div>

      <footer className="wt-challenge-result__foot">
        <div
          className={`wt-challenge-result__sync wt-challenge-result__sync--${submitState}`}
          role="status"
        >
          <span className="wt-challenge-result__sync-dot" aria-hidden="true" />
          {submitState === 'pending' && <span>正在上报成绩…</span>}
          {submitState === 'ok' && submitInfo && (
            <span>
              <LinkOutlined /> 已上榜 · 当前第 <strong>{submitInfo.rank}</strong> 名
              <span className="wt-challenge-result__sync-dim">（共 {submitInfo.total} 人）</span>
            </span>
          )}
          {submitState === 'failed' && (
            <span className="wt-challenge-result__sync-error">
              成绩已存本地，{submitError ?? '上报失败'}（下次进入挑战页会重试）
            </span>
          )}
        </div>

        <div className="wt-challenge-result__actions">
          <button
            type="button"
            className="wt-challenge-btn wt-challenge-btn--primary"
            onClick={onRestart}
          >
            <ReloadOutlined /> 再来一局
          </button>
          <button type="button" className="wt-challenge-btn" onClick={onExit}>
            返回挑战
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ChallengeResultPanel;
