/**
 * 成绩面板（Story 4.2）
 *
 * 展示一次练习会话的完整成绩：
 * - 六项核心指标（字数 / 用时 / 速度 / 准确率 / 击键数 / 有效击键率）
 * - 与上一次同类练习对比（↑↓ 差值）
 * - 个人最佳提示
 * - 三个出口：再来一次 / 练习错字 / 返回
 *
 * 错误分析在本组件内切换视图（summary ⇄ errors），
 * 避免额外弹层打断「练完看成绩」的连贯操作。
 */

import React, { useState } from 'react';
import {
  ThunderboltOutlined,
  AimOutlined,
  ClockCircleOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  FontSizeOutlined,
} from '@ant-design/icons';
import ErrorAnalysis from './ErrorAnalysis';
import { formatTime } from '../utils/wubi/metrics';
import { formatDelta, deltaTrend, hasAnyPersonalBest, type ModeComparison } from '../utils/wubi/sessionStats';
import type { ErrorSummary } from '../utils/wubi/errorAnalysis';
import type { SessionResult } from '../utils/wubi/session';

interface ResultPanelProps {
  result: SessionResult;
  /** 与上一次同类练习的对比（null = 未记录该模式） */
  comparison: ModeComparison | null;
  /** 错误分析数据 */
  errorSummary: ErrorSummary;
  /** 关卡通关判定（仅关卡练习传入） */
  lessonVerdict?: { passed: boolean; reasons: string[]; lessonKey: string } | null;
  /** 练习模式名称（用于「上一次同类练习」文案） */
  modeLabel: string;
  onRestart: () => void;
  /** 用本次错字发起专项练习 */
  onPracticeWrong: (chars: string[]) => void;
  onBack: () => void;
  /** 点击汉字唤起拆分演示 */
  onOpenSplitDemo?: (char: string) => void;
}

type PanelView = 'summary' | 'errors';

/** 差值徽标 */
const DeltaBadge: React.FC<{ delta: number | null; digits?: number; suffix?: string }> = ({
  delta,
  digits = 0,
  suffix = '',
}) => {
  const trend = deltaTrend(delta);
  if (trend === 'none') return null;

  return (
    <span className={`wt-result__delta wt-result__delta--${trend}`}>
      {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'} {formatDelta(delta, digits, suffix)}
    </span>
  );
};

const ResultPanel: React.FC<ResultPanelProps> = ({
  result,
  comparison,
  errorSummary,
  lessonVerdict,
  modeLabel,
  onRestart,
  onPracticeWrong,
  onBack,
  onOpenSplitDemo,
}) => {
  const [view, setView] = useState<PanelView>('summary');

  const accuracyPercent = (result.accuracy * 100).toFixed(1);
  const validRatePercent = (result.validKeystrokeRate * 100).toFixed(1);
  const pb = comparison?.personalBest;
  const showPbBanner = pb ? hasAnyPersonalBest(pb) : false;

  /*
   * 「完成量」这一格的字数 / 题数口径。
   *
   * 词组题是 2~6 字、文章题是整篇，按题数显示会把它们的完成量严重低估
   * （此前标签写着「完成字数」，值却是题数）。
   *
   * 键位 / 字根类练习不涉及汉字（correctChars 恒为 0），
   * 此时回退到题数并改标签，否则会显示「0 / 0 完成字数」。
   */
  const isCharBased = result.correctChars > 0;
  const charStat = isCharBased
    // 字数本身就是完成量的全部含义，再跟一个「/ 总数」是冗余的
    ? { value: result.correctChars, suffix: '', label: '完成字数' }
    : {
        value: result.correctQuestions,
        suffix: ` / ${result.totalQuestions}`,
        label: '完成题数 / 总题数',
      };
  /** 键位 / 字根类练习的「速度」单位是题而非字 */
  const speedUnit = isCharBased ? '字/分钟' : '题/分钟';

  // ── 错误分析视图 ──
  if (view === 'errors') {
    return (
      <div className="wt-result">
        <div className="wt-result__head">
          <button
            className="wt-result__view-back"
            onClick={() => setView('summary')}
          >
            ← 返回成绩
          </button>
          <h3 className="wt-result__title">错误分析</h3>
        </div>

        <ErrorAnalysis
          summary={errorSummary}
          onOpenSplitDemo={onOpenSplitDemo}
          onPracticeWrong={onPracticeWrong}
        />

        <div className="wt-result__actions">
          <button
            className="wt-result__btn wt-result__btn--primary"
            onClick={onRestart}
          >
            再来一次
          </button>
          <button className="wt-result__btn" onClick={onBack}>
            返回
          </button>
        </div>
      </div>
    );
  }

  // ── 成绩总览视图 ──
  return (
    <div className="wt-result">
      {/* 关卡通关判定 */}
      {lessonVerdict && (
        <div
          className={`wt-result__verdict wt-result__verdict--${lessonVerdict.passed ? 'pass' : 'fail'}`}
        >
          {lessonVerdict.passed
            ? `🎉 「${lessonVerdict.lessonKey.toUpperCase()}」关卡通关！`
            : `未达标：${lessonVerdict.reasons.join('；')}`}
        </div>
      )}

      {/* 个人最佳横幅 */}
      {showPbBanner && (
        <div className="wt-result__pb">
          🏆 刷新个人最佳！
          <span className="wt-result__pb-items">
            {pb!.speed && <span>速度</span>}
            {pb!.accuracy && <span>准确率</span>}
            {pb!.validRate && <span>有效击键率</span>}
            {pb!.maxCombo && <span>最大连击</span>}
          </span>
        </div>
      )}

      <h3 className="wt-result__title">本轮完成</h3>

      {/* 六项核心指标 */}
      <div className="wt-result__grid">
        <div className="wt-result__item">
          <span className="wt-result__icon"><FontSizeOutlined /></span>
          <span className="wt-result__value">
            {charStat.value}
            {charStat.suffix && (
              <span className="wt-result__value-sub">{charStat.suffix}</span>
            )}
          </span>
          <span className="wt-result__label">{charStat.label}</span>
        </div>

        <div className="wt-result__item">
          <span className="wt-result__icon"><ClockCircleOutlined /></span>
          <span className="wt-result__value">{formatTime(result.durationSec)}</span>
          <span className="wt-result__label">用时</span>
        </div>

        <div className="wt-result__item">
          <span className="wt-result__icon"><ThunderboltOutlined /></span>
          <span className="wt-result__value">{result.speedPerMinute.toFixed(1)}</span>
          <span className="wt-result__label">平均速度（{speedUnit}）</span>
          <DeltaBadge delta={comparison?.speedDelta ?? null} digits={1} />
        </div>

        <div className="wt-result__item">
          <span className="wt-result__icon"><AimOutlined /></span>
          <span className="wt-result__value">{accuracyPercent}%</span>
          <span className="wt-result__label">平均准确率</span>
          {comparison?.accuracyDelta != null && (
            <DeltaBadge delta={comparison.accuracyDelta * 100} digits={1} suffix="%" />
          )}
        </div>

        <div className="wt-result__item">
          <span className="wt-result__icon"><KeyOutlined /></span>
          <span className="wt-result__value">{result.totalKeystrokes}</span>
          <span className="wt-result__label">总击键数</span>
          {/* 击键数变少是好事，趋势方向需反转 */}
          {comparison?.keystrokesDelta != null && (
            <span
              className={`wt-result__delta wt-result__delta--${
                comparison.keystrokesDelta === 0
                  ? 'flat'
                  : comparison.keystrokesDelta < 0 ? 'up' : 'down'
              }`}
            >
              {formatDelta(comparison.keystrokesDelta, 0)}
            </span>
          )}
        </div>

        <div className="wt-result__item">
          <span className="wt-result__icon"><CheckCircleOutlined /></span>
          <span className="wt-result__value">{validRatePercent}%</span>
          <span className="wt-result__label">有效击键率</span>
          {comparison?.validRateDelta != null && (
            <DeltaBadge delta={comparison.validRateDelta * 100} digits={1} suffix="%" />
          )}
        </div>
      </div>

      {/* 对比基准说明 */}
      <p className="wt-result__basis">
        {comparison?.isFirst
          ? `这是「${modeLabel}」的首次练习，下次即可看到进步对比`
          : `对比基准：上一次「${modeLabel}」练习`}
        {result.maxCombo > 0 && (
          <span className="wt-result__combo">最大连击 {result.maxCombo}</span>
        )}
      </p>

      {/* 错误分析入口 */}
      {errorSummary.wrongChars.length > 0 && (
        <button
          className="wt-result__errors-entry"
          onClick={() => setView('errors')}
        >
          <span className="wt-result__errors-icon">🔍</span>
          <span className="wt-result__errors-text">
            <strong>查看错误分析</strong>
            <span className="wt-result__errors-desc">
              {errorSummary.wrongChars.length} 个错字 ·{' '}
              {errorSummary.confusionPairs.length} 组易混字根
            </span>
          </span>
          <span className="wt-result__errors-arrow">→</span>
        </button>
      )}

      {/* 三个出口 */}
      <div className="wt-result__actions">
        <button
          className="wt-result__btn wt-result__btn--primary"
          onClick={onRestart}
        >
          再来一次
        </button>
        <button
          className="wt-result__btn"
          onClick={() => onPracticeWrong(result.wrongChars)}
          disabled={result.wrongChars.length === 0}
        >
          练习错字{result.wrongChars.length > 0 ? `（${result.wrongChars.length}）` : ''}
        </button>
        <button className="wt-result__btn" onClick={onBack}>
          返回
        </button>
      </div>
    </div>
  );
};

export default ResultPanel;
