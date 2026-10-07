/**
 * 成绩 Tab（Story 4.4）
 *
 * 三块内容：
 * 1. 坚持指标 — Streak / 累计天数 / 累计字数 / 累计时长
 * 2. 里程碑提示 — 最接近达成的未解锁成就
 * 3. 趋势图 — 近 14 / 30 天切换，三个视图（时长 / 速度 / 准确率）
 * 4. 错误分析 — 误按热力图 + 易混字根榜 + 错字清单（近 7 天）
 * 5. 成就墙 — 全部成就（已解锁点亮 + 未解锁进度）
 *
 * 图表全部自绘 SVG，无图表库依赖。
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  FireOutlined,
  CalendarOutlined,
  FontSizeOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import TrendChart from '../components/TrendChart';
import AchievementWall from '../components/AchievementWall';
import ErrorAnalysis from '../components/ErrorAnalysis';
import { analyzeErrors } from '../utils/wubi/errorAnalysis';
import { collectKeyErrors } from '../utils/wubi/statsAggregation';
import { DEFAULT_RECENT_DAYS } from '../utils/wubi/errorAnalysis';
import { useWubiStorage } from '../utils/wubi/useWubiStorage';
import { useWubiStats } from '../utils/wubi/useWubiStats';
import {
  formatCompact,
  formatDuration,
  METRIC_LABEL,
  type TrendMetric,
} from '../utils/wubi/statsAggregation';

const TREND_DAYS_OPTIONS = [14, 30] as const;
type TrendDays = typeof TREND_DAYS_OPTIONS[number];

const METRIC_OPTIONS: TrendMetric[] = ['time', 'speed', 'accuracy'];

interface StatsTabProps {
  /** 点击错字唤起拆分演示（与练习 / 查码页同一个入口） */
  onOpenSplitDemo?: (char: string) => void;
}

/** 错误分析的回顾窗口（天）—— 与文案同源，改了这里到处都跟着变 */
const ERROR_WINDOW_DAYS = DEFAULT_RECENT_DAYS;

const StatsTab: React.FC<StatsTabProps> = ({ onOpenSplitDemo }) => {
  const { snapshot, refresh, getSeries, getRangeTotals } = useWubiStats();
  const { loadStats, loadReview } = useWubiStorage();

  const [days, setDays] = useState<TrendDays>(14);
  const [metric, setMetric] = useState<TrendMetric>('time');

  // 每次切到本 Tab 拉取最新数据（练习 Tab 的写入不会触发这里重渲染）
  useEffect(() => {
    refresh();
  }, [refresh]);

  const series = useMemo(() => getSeries(days, metric), [getSeries, days, metric]);
  const rangeTotals = useMemo(() => getRangeTotals(days), [getRangeTotals, days]);

  /*
   * 错误分析的数据来自两处：
   * - 按键配对：日统计里的 keyErrors（本次起才落盘，旧记录按空处理）
   * - 错字：复习队列（近 7 天）
   *
   * 依赖 snapshot 是为了在 refresh() 之后重算 ——
   * 只在 mount 时算一次会读到上一次的数据（练习写入不会触发本页重渲染）。
   *
   * snapshot 本身没有在计算里被读到，所以 eslint 会判它「多余」；
   * 这里是**故意**拿它当失效键（refresh 后它换成新对象）。
   */
  const errorSummary = useMemo(
    () => analyzeErrors(
      { wrongChars: [], keyErrors: collectKeyErrors(loadStats(), ERROR_WINDOW_DAYS) },
      loadReview(),
      { recentDays: ERROR_WINDOW_DAYS },
    ),
    /*
     * 豁免必须紧贴**依赖数组**这一行：exhaustive-deps 把告警报在这里，
     * 而 disable-next-line 只管下一行 —— 写在 useMemo( 上方会隔了好几行，无效。
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, loadStats, loadReview],
  );

  const { totals, streak, milestones, unlocked, context, hasData } = snapshot;

  // ── 无数据：给明确的下一步，而不是空白页 ──
  if (!hasData) {
    return (
      <div className="wt-stats wt-stats--empty">
        <div className="wt-stats__empty-icon">
          <BarChartOutlined />
        </div>
        <h2 className="wt-stats__empty-title">还没有练习记录</h2>
        <p className="wt-stats__empty-desc">
          完成任意一轮练习后，这里会显示练习时长、速度与准确率的趋势，
          以及坚持天数和成就进度。
        </p>
      </div>
    );
  }

  return (
    <div className="wt-stats">
      {/* ── 1. 坚持指标 ── */}
      <section className="wt-stats__section">
        <div className="wt-stats__metrics">
          <div className={`wt-stat-card${streak.activeToday ? ' wt-stat-card--active' : ''}`}>
            <span className="wt-stat-card__icon"><FireOutlined /></span>
            <span className="wt-stat-card__value">{streak.current}</span>
            <span className="wt-stat-card__label">
              连续练习（天）
              {streak.longest > streak.current && (
                <em className="wt-stat-card__sub">最长 {streak.longest}</em>
              )}
            </span>
          </div>

          <div className="wt-stat-card">
            <span className="wt-stat-card__icon"><CalendarOutlined /></span>
            <span className="wt-stat-card__value">{totals.practiceDays}</span>
            <span className="wt-stat-card__label">累计练习天数</span>
          </div>

          <div className="wt-stat-card">
            <span className="wt-stat-card__icon"><FontSizeOutlined /></span>
            <span className="wt-stat-card__value">{formatCompact(totals.totalChars)}</span>
            <span className="wt-stat-card__label">累计字数</span>
          </div>

          <div className="wt-stat-card">
            <span className="wt-stat-card__icon"><ClockCircleOutlined /></span>
            <span className="wt-stat-card__value">{formatDuration(totals.totalTimeSec)}</span>
            <span className="wt-stat-card__label">累计练习时长</span>
          </div>
        </div>

        {/* 今日状态（正向提示，非催促） */}
        <p className="wt-stats__today">
          {streak.activeToday
            ? '今天已经练过了，保持这个节奏。'
            : '今天还没开始练习，随时可以来一轮。'}
        </p>
      </section>

      {/* ── 2. 里程碑 ── */}
      {milestones.length > 0 && (
        <section className="wt-stats__section">
          <h3 className="wt-stats__section-title">即将达成</h3>
          <ul className="wt-milestones">
            {milestones.map(({ def, progress, current, target }) => (
              <li key={def.id} className="wt-milestone">
                <span className="wt-milestone__badge">{def.badge}</span>
                <div className="wt-milestone__body">
                  <span className="wt-milestone__title">{def.title}</span>
                  <span className="wt-milestone__desc">{def.desc}</span>
                </div>
                <div className="wt-milestone__progress">
                  <div className="wt-milestone__bar">
                    <div
                      className="wt-milestone__bar-fill"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                  <span className="wt-milestone__text">
                    {Math.round(current)} / {target}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 3. 趋势图 ── */}
      <section className="wt-stats__section">
        <div className="wt-stats__section-head">
          <h3 className="wt-stats__section-title">练习趋势</h3>

          <div className="wt-stats__controls">
            <div className="wt-seg">
              {METRIC_OPTIONS.map((m) => (
                <button
                  key={m}
                  className={`wt-seg__btn${metric === m ? ' wt-seg__btn--active' : ''}`}
                  onClick={() => setMetric(m)}
                >
                  {METRIC_LABEL[m]}
                </button>
              ))}
            </div>

            <div className="wt-seg">
              {TREND_DAYS_OPTIONS.map((d) => (
                <button
                  key={d}
                  className={`wt-seg__btn${days === d ? ' wt-seg__btn--active' : ''}`}
                  onClick={() => setDays(d)}
                >
                  {d} 天
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="wt-stats__chart">
          <TrendChart series={series} metric={metric} />
        </div>

        <div className="wt-stats__range-summary">
          <span>近 {days} 天练习 <strong>{formatDuration(rangeTotals.totalTimeSec)}</strong></span>
          <span>打对 <strong>{rangeTotals.totalChars}</strong> 字</span>
          <span>练习 <strong>{rangeTotals.practiceDays}</strong> 天</span>
        </div>
      </section>

      {/* ── 4. 错误分析（易混字根榜的常驻入口） ── */}
      <section className="wt-stats__section">
        <h3 className="wt-stats__section-title">错误分析</h3>
        <ErrorAnalysis
          summary={errorSummary}
          scope="recent"
          recentDays={ERROR_WINDOW_DAYS}
          onOpenSplitDemo={onOpenSplitDemo}
        />
      </section>

      {/* ── 5. 成就墙 ── */}
      <section className="wt-stats__section">
        <h3 className="wt-stats__section-title">成就墙</h3>
        <AchievementWall unlocked={unlocked} context={context} />
      </section>
    </div>
  );
};

export default StatsTab;
