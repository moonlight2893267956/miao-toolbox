/**
 * 错误分析（Story 4.2）
 *
 * 三块内容：
 * 1. 键位错误热力图 — 复用 VirtualKeyboard 的 heatmap 模式
 * 2. 易混字根榜 — 「期望字根 vs 实际按下键所属字根」Top N
 * 3. 错字清单 — 本次 + 近 N 天（N = recentDays），可唤起拆字演示或加入专项练习
 *
 * 全部自绘（无图表库），颜色由 CSS 变量派生以适配暗色模式。
 */

import React from 'react';
import { AimOutlined } from '@ant-design/icons';
import VirtualKeyboard from './VirtualKeyboard';
import {
  buildHeatmapFromCounts, DEFAULT_RECENT_DAYS, recentWindowLabel,
  type ErrorSummary,
} from '../utils/wubi/errorAnalysis';

interface ErrorAnalysisProps {
  summary: ErrorSummary;
  /**
   * 语境，决定文案说「本轮」还是「近 N 天」。
   *
   * - `session`（默认）：某轮练习刚结束的结果面板
   * - `recent`：成绩页的常驻回顾 —— 那里没有「本轮」这回事，说本轮就是错的
   */
  scope?: 'session' | 'recent';
  /**
   * 回顾窗口天数，用于文案（「近 N 天」）。
   *
   * 必须与调用 `analyzeErrors` 时的 recentDays 保持一致 —— 它是组件里
   * 唯一说「几天」的地方，不再写死。
   */
  recentDays?: number;
  /** 点击汉字唤起拆分演示 */
  onOpenSplitDemo?: (char: string) => void;
  /** 用错字列表发起专项练习 */
  onPracticeWrong?: (chars: string[]) => void;
}

const ErrorAnalysis: React.FC<ErrorAnalysisProps> = ({
  summary,
  scope = 'session',
  recentDays = DEFAULT_RECENT_DAYS,
  onOpenSplitDemo,
  onPracticeWrong,
}) => {
  const isRecent = scope === 'recent';
  /** 窗口的界面说法（唯一来源，见 errorAnalysis.recentWindowLabel） */
  const windowLabel = recentWindowLabel(recentDays);
  /** 时间限定词：结果面板的主体说「本轮」，成绩页说窗口 */
  const scopeWord = isRecent ? windowLabel : '本轮';
  const { byActualKey, confusionPairs, wrongChars, totalErrors } = summary;

  const heatmap = buildHeatmapFromCounts(byActualKey);
  const maxErrorCount = Math.max(0, ...Object.values(byActualKey));

  const currentWrongChars = wrongChars.filter((w) => w.inCurrent);
  const hasAnything = totalErrors > 0 || wrongChars.length > 0;

  if (!hasAnything) {
    return (
      <div className="wt-errors wt-errors--empty">
        <div className="wt-errors__empty-icon">
          <AimOutlined />
        </div>
        <p className="wt-errors__empty-title">
          {isRecent ? '还没有可分析的错误' : '本轮零失误'}
        </p>
        <p className="wt-errors__empty-desc">
          {isRecent
            ? `完成一轮练习后，这里会汇总${windowLabel}的误按分布与易混字根。`
            : '没有可分析的错误。试着提高速度，或挑战更难的练习模式。'}
        </p>
      </div>
    );
  }

  return (
    <div className="wt-errors">
      {/* ── 1. 键位错误热力图 ── */}
      <section className="wt-errors__section">
        <h4 className="wt-errors__section-title">
          键位错误热力图
          {totalErrors > 0 && (
            <span className="wt-errors__section-badge">共 {totalErrors} 次误按</span>
          )}
        </h4>

        {totalErrors > 0 ? (
          <>
            <div className="wt-errors__heatmap">
              <VirtualKeyboard
                mode="heatmap"
                heatmap={heatmap}
                heatCounts={byActualKey}
              />
            </div>
            <div className="wt-errors__heat-legend">
              <span className="wt-errors__heat-legend-label">错误少</span>
              {[1, 2, 3, 4].map((level) => (
                <span
                  key={level}
                  className={`wt-errors__heat-cell wt-errors__heat-cell--${level}`}
                />
              ))}
              <span className="wt-errors__heat-legend-label">错误多</span>
              <span className="wt-errors__heat-legend-max">最多 {maxErrorCount} 次</span>
            </div>
            <p className="wt-errors__hint">
              色块越深表示该键误按越多——通常意味着对「哪个手指管哪个键」还有模糊。
            </p>
          </>
        ) : (
          <p className="wt-errors__hint">{scopeWord}没有被记录的误按键位。</p>
        )}
      </section>

      {/* ── 2. 易混字根榜 ── */}
      <section className="wt-errors__section">
        <h4 className="wt-errors__section-title">
          易混字根榜
          {confusionPairs.length > 0 && (
            <span className="wt-errors__section-badge">Top {confusionPairs.length}</span>
          )}
        </h4>

        {confusionPairs.length > 0 ? (
          <ul className="wt-errors__pairs">
            {confusionPairs.map((pair) => (
              <li
                key={`${pair.expectedKey}-${pair.actualKey}`}
                className="wt-errors__pair"
              >
                <span className="wt-errors__pair-glyphs">
                  <span className="wt-errors__pair-glyph wt-errors__pair-glyph--expected">
                    {pair.expectedGlyph}
                  </span>
                  <span className="wt-errors__pair-arrow">←</span>
                  <span className="wt-errors__pair-glyph wt-errors__pair-glyph--actual">
                    {pair.actualGlyph}
                  </span>
                </span>
                <span className="wt-errors__pair-desc">
                  该按 <kbd>{pair.expectedKey.toUpperCase()}</kbd> 却按了 <kbd>{pair.actualKey.toUpperCase()}</kbd>
                </span>
                <span className="wt-errors__pair-count">{pair.count} 次</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="wt-errors__hint">{scopeWord}没有可归纳的字根混淆规律。</p>
        )}
      </section>

      {/* ── 3. 错字清单 ── */}
      <section className="wt-errors__section">
        <h4 className="wt-errors__section-title">
          错字清单
          <span className="wt-errors__section-badge">
            {isRecent
              ? `${windowLabel} ${wrongChars.length}`
              : `本次 ${currentWrongChars.length} · ${windowLabel} ${wrongChars.length}`}
          </span>
        </h4>

        {wrongChars.length > 0 ? (
          <>
            <div className="wt-errors__chars">
              {wrongChars.map((entry) => (
                <button
                  key={entry.char}
                  className={`wt-errors__char${entry.inCurrent ? ' wt-errors__char--current' : ''}`}
                  onClick={() => onOpenSplitDemo?.(entry.char)}
                  title={
                    entry.inCurrent
                      ? `本次错字${entry.recentCount > 0 ? ` · ${windowLabel}错 ${entry.recentCount} 次` : ''}`
                      : `${windowLabel}错 ${entry.recentCount} 次`
                  }
                >
                  <span className="wt-errors__char-glyph">{entry.char}</span>
                  {entry.recentCount > 0 && (
                    <span className="wt-errors__char-count">{entry.recentCount}</span>
                  )}
                </button>
              ))}
            </div>

            <p className="wt-errors__hint">
              点击任意字可查看拆分演示。带角标的字是{windowLabel}反复出错的「顽固字」。
            </p>

            {currentWrongChars.length > 0 && onPracticeWrong && (
              <button
                className="wt-errors__practice-btn"
                onClick={() => onPracticeWrong(currentWrongChars.map((w) => w.char))}
              >
                针对本次 {currentWrongChars.length} 个错字专项练习
              </button>
            )}
          </>
        ) : (
          <p className="wt-errors__hint">{windowLabel}没有错字记录。</p>
        )}
      </section>
    </div>
  );
};

export default ErrorAnalysis;
