/**
 * 趋势图（Story 4.4）
 *
 * 纯自绘 SVG（不引入图表库），设计目标是「精密仪器」的克制感 ——
 * 不加装饰，让数据的形状本身成为视觉焦点。
 *
 * ── 四个关键渲染决策（都是为了不误导，其次才是好看）──
 *
 * 1. **折线按「连续练习日」分段，不在休息日之间连线**
 *    这是正确性问题而不只是美观问题：休息日并不等于「打了 0 字/分钟」，
 *    而是**没有测量**。把 0 连进折线会凭空造出深 V 低谷，
 *    让「速度 / 准确率」两个视图的事实含义完全错掉。
 *    数据层的缺日补零（buildTrendSeries）保持不变，只在渲染时分段。
 *
 * 2. **休息日在基线上画空心小点，底部再配一条练习日条带**
 *    「哪几天练了」由这两者表达，比连一条贴底的横线清楚得多，
 *    也顺带解决了「今天还没练 → 折线断崖式下跌」的误导。
 *
 * 3. **每条连续段独立闭合面积**
 *    视觉上形成一个个「练习块」，而不是一座横跨整月的山脉。
 *
 * 4. **数值与单位分离格式化**
 *    坐标轴只显示裸数值（单位放轴标题），其余位置走 formatWithUnit，
 *    避免 `96.0%%` 这类重复单位。
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  trendGeometry,
  type TrendGeometry,
} from '../utils/wubi/trendGeometry';
import { useElementWidth } from '../utils/wubi/useElementWidth';
import {
  formatShortDate,
  METRIC_LABEL,
  METRIC_UNIT,
  seriesAverage,
  type TrendPoint,
  type TrendMetric,
} from '../utils/wubi/statsAggregation';

/*
 * 布局量不再写死。
 *
 * 曾经是固定 viewBox（720×214）+ `width:100%; height:auto`，SVG 等比缩放
 * ⇒ 图高 = 容器宽 × 0.297：大屏卡片上长到 306px，字号也被放大 43%。
 * 现在 viewBox 宽取容器实测宽度、高度固定，详见 trendGeometry.ts。
 *
 * 下面这些名字保持原样（由 geo 解构而来），是为了让整段 JSX 一行都不用改 ——
 * 这类「量纲换代」的重构，改动面越小越不容易出错。
 */

/** 横轴标签最小间距（viewBox 单位），避免日期挤在一起 */
const LABEL_MIN_GAP = 74;

// ─── 工具函数 ────────────────────────────────────────────

/** 把最大值向上取整到「好看」的刻度 */
function niceMax(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 10;

  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  const n = max / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * base;
}

/** 纵轴值域 */
interface Domain {
  min: number;
  max: number;
}

/**
 * 计算纵轴值域。
 *
 * 准确率必须**放大值域**：它天然挤在 90~100 的窄带里，
 * 用 0 作基线会把全部信息压成贴顶的一条直线（面积还会把图填满，
 * 制造「练得很满」的错觉）。这里取 5 的整数倍下界，上界封顶 100。
 *
 * 时长与速度保持 0 基线 —— 「字/分钟」从 0 起算才符合直觉。
 */
function computeDomain(values: number[], metric: TrendMetric): Domain {
  if (metric !== 'accuracy') {
    return { min: 0, max: niceMax(Math.max(0, ...values)) };
  }

  const active = values.filter((v) => v > 0);
  if (active.length === 0) return { min: 0, max: 100 };

  const maxV = Math.min(100, Math.max(...active));
  const minV = Math.min(...active);

  const max = Math.min(100, Math.max(90, Math.ceil((maxV + 2) / 5) * 5));
  // 值域至少留 10 的宽度，否则刻度只剩上下两条、读不出中间层次
  const min = Math.max(0, Math.min(Math.floor((minV - 5) / 5) * 5, max - 10));

  return { min, max };
}

/** 纵轴刻度值（从大到小） */
function buildTicks(domain: Domain, metric: TrendMetric): number[] {
  const span = domain.max - domain.min;

  if (metric === 'accuracy') {
    // 值域窄，按 5 一档铺满，最多 5 条
    const ticks: number[] = [];
    for (let v = domain.max; v >= domain.min - 1e-9 && ticks.length < 5; v -= 5) {
      ticks.push(v);
    }
    return ticks;
  }

  return [domain.max, domain.min + span / 2, domain.min];
}

/**
 * 裸数值（不含单位）。
 * 坐标轴刻度用它；需要带单位的场合用 `formatWithUnit`。
 */
export function formatValue(value: number, metric: TrendMetric): string {
  if (metric === 'accuracy') return value.toFixed(1);
  if (metric === 'speed') return value.toFixed(1);
  return String(Math.round(value));
}

/** 数值 + 单位（唯一拼接口，防止重复追加单位） */
export function formatWithUnit(value: number, metric: TrendMetric): string {
  return `${formatValue(value, metric)}${METRIC_UNIT[metric]}`;
}

/**
 * 估算文本宽度（用于峰值徽标的背景框）。
 * CJK 与 % 按全角计，其余按半角 —— 比固定宽度可靠得多。
 */
function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) {
    units += /[\u3000-\u9fff\uff00-\uffef%]/.test(ch) ? 1 : 0.56;
  }
  return units * fontSize;
}

/**
 * 依据数据点横坐标决定 tooltip 对齐方式。
 * 阈值按「tooltip 半宽」估算；否则首尾两点的 tooltip 会有一半在容器外。
 */
function alignOf(x: number, geo: TrendGeometry): 'start' | 'center' | 'end' {
  const EDGE = 60;
  if (x < geo.padLeft + EDGE) return 'start';
  if (x > geo.w - geo.padRight - EDGE) return 'end';
  return 'center';
}

/** 依最小间距挑选横轴标签索引（末点始终保留，优先从右往左铺） */
function pickLabelIndices(xs: number[]): number[] {
  const n = xs.length;
  if (n === 0) return [];

  const picked = [n - 1];
  for (let i = n - 2; i >= 0; i--) {
    if (xs[picked[picked.length - 1]] - xs[i] >= LABEL_MIN_GAP) picked.push(i);
  }
  // 首点若能塞下也标上，让横轴两端都有锚点
  const last = picked[picked.length - 1];
  if (last !== 0 && xs[last] - xs[0] >= LABEL_MIN_GAP * 0.8) {
    picked.push(0);
  }

  return picked.reverse();
}

interface TrendChartProps {
  series: TrendPoint[];
  metric: TrendMetric;
}

interface PlottedPoint extends TrendPoint {
  x: number;
  y: number;
}

const TrendChart: React.FC<TrendChartProps> = ({ series, metric }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  /*
   * 先测量容器宽度，再据此算几何量。
   * 必须在任何提前 return 之前调用（hook 顺序），空数据的提前返回在下面。
   */
  const [canvasRef, canvasWidth] = useElementWidth<HTMLDivElement>();
  const geo = useMemo(() => trendGeometry(canvasWidth), [canvasWidth]);
  const {
    w: VB_W, h: VB_H,
    padLeft: PAD_LEFT, padRight: PAD_RIGHT,
    plotTop: PLOT_TOP, plotBottom: PLOT_BOTTOM,
    plotH: PLOT_H, plotW: PLOT_W,
    dateLabelY: DATE_LABEL_Y, stripY: STRIP_Y, stripH: STRIP_H,
  } = geo;

  const layout = useMemo(() => {
    const n = series.length;
    const domain = computeDomain(series.map((p) => p.value), metric);
    const tickValues = buildTicks(domain, metric);
    const span = domain.max - domain.min;

    const stepX = n > 1 ? PLOT_W / (n - 1) : 0;
    const toX = (i: number) => (n > 1 ? PAD_LEFT + i * stepX : PAD_LEFT + PLOT_W / 2);
    const toY = (v: number) =>
      PLOT_BOTTOM - (span > 0 ? ((v - domain.min) / span) * PLOT_H : 0);

    const points: PlottedPoint[] = series.map((p, i) => ({ ...p, x: toX(i), y: toY(p.value) }));

    /*
     * 按「连续有数据日」切成若干段。
     * 段内用折线连接；段与段之间的休息日不连线（见文件头注释第 1 条）。
     */
    const runs: PlottedPoint[][] = [];
    let current: PlottedPoint[] = [];
    for (const p of points) {
      if (p.hasData) {
        current.push(p);
      } else if (current.length > 0) {
        runs.push(current);
        current = [];
      }
    }
    if (current.length > 0) runs.push(current);

    const segments = runs.map((run) => ({
      points: run,
      polyline: run.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      // 单点段没有面积，只画竖茎与点
      areaPath: run.length >= 2
        ? `M ${run[0].x.toFixed(1)},${PLOT_BOTTOM} `
          + run.map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
          + ` L ${run[run.length - 1].x.toFixed(1)},${PLOT_BOTTOM} Z`
        : '',
    }));

    // 峰值（仅在有数据点中取；并列取靠后的，通常是最近一次）
    let peak: PlottedPoint | null = null;
    for (const p of points) {
      if (!p.hasData) continue;
      if (!peak || p.value >= peak.value) peak = p;
    }

    const stripW = Math.max(4, Math.min(10, stepX * 0.6 || 8));

    return {
      n, domain, tickValues, points, segments, peak, stripW,
      labelIndices: pickLabelIndices(points.map((p) => p.x)),
    };
  }, [series, metric, geo]);

  /** 鼠标 x → 最近数据点索引 */
  const handleMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (series.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    // 换算到 viewBox 坐标系（SVG 等比缩放，需按宽度比例换算）
    const svgX = ((e.clientX - rect.left) / rect.width) * VB_W;
    const ratio = series.length > 1 ? (svgX - PAD_LEFT) / PLOT_W : 0;

    const idx = Math.round(ratio * Math.max(1, series.length - 1));
    setHoverIndex(Math.min(series.length - 1, Math.max(0, idx)));
  }, [series.length, VB_W, PAD_LEFT, PLOT_W]);

  if (series.length === 0) {
    return (
      <div className="wt-trend wt-trend--empty">
        <p>暂无数据，完成一次练习后即可看到趋势</p>
      </div>
    );
  }

  const { domain, tickValues, points, segments, peak, stripW, labelIndices } = layout;

  const avg = seriesAverage(series);
  const activeDays = series.filter((p) => p.hasData).length;
  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  const span = domain.max - domain.min;
  const toY = (v: number) => PLOT_BOTTOM - (span > 0 ? ((v - domain.min) / span) * PLOT_H : 0);

  // 均值参考线：只有 1 天数据时它与该点重合，画出来只会造成困惑
  const showAvgLine = activeDays >= 2 && avg > 0;
  const avgY = toY(avg);

  const ticks = tickValues.map((value) => ({ value, y: toY(value) }));

  /*
   * 准确率的值域不从 0 起，面积填充会变成「离 90 分有多远」的误导图形
   * （看起来填满整块＝练得很满）。所以准确率只用折线 + 点。
   */
  const showArea = metric !== 'accuracy';

  const unit = METRIC_UNIT[metric];
  const peakText = peak ? formatWithUnit(peak.value, metric) : '';
  const peakLabelW = estimateTextWidth(peakText, 11) + 16;
  const peakLabelX = peak
    ? Math.min(VB_W - PAD_RIGHT - peakLabelW / 2, Math.max(PAD_LEFT + peakLabelW / 2, peak.x))
    : 0;
  const peakLabelY = peak ? peak.y - 16 : 0;
  /*
   * 峰值徽标只在轴顶留得下时才画。
   * 否则它会被钳进绘图区、盖住其它数据点（准确率视图的常态）；
   * 此时「最高 X」已由头部 chip 表达，不丢信息。
   */
  const showPeakLabel =
    peak != null && peak.value > 0 && hoverIndex == null
    && peakLabelY - 13 >= PLOT_TOP + 2;

  return (
    <div className="wt-trend">
      {/* ── 主数值 + 辅助信息 ── */}
      <div className="wt-trend__meta">
        <div className="wt-trend__primary">
          <span className="wt-trend__primary-value">
            {formatValue(avg, metric)}
            <em>{unit}</em>
          </span>
          <span className="wt-trend__primary-label">练习日均值 · {METRIC_LABEL[metric]}</span>
        </div>

        <div className="wt-trend__chips">
          <span className="wt-trend__chip">
            有练习 <strong>{activeDays}</strong> / {series.length} 天
          </span>
          {/* 只有 1 天数据时「最高」与徽标重复，不显示 */}
          {peak && peak.value > 0 && activeDays >= 2 && (
            <span className="wt-trend__chip wt-trend__chip--peak">
              最高 <strong>{formatValue(peak.value, metric)}</strong> {unit}
            </span>
          )}
        </div>
      </div>

      {/*
        minHeight 用几何量的值（而不是写进 CSS）：高度只有一处真相，
        CSS 里再写一遍就成了第二个会漂移的常量。它的作用是让首帧测量
        之前就把位置占住，避免图出现时把下面的内容顶一下。
      */}
      <div className="wt-trend__canvas" ref={canvasRef} style={{ minHeight: geo.h }}>
        <svg
          className="wt-trend__svg"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
          role="img"
          aria-label={`${METRIC_LABEL[metric]}趋势图，${series.length} 天中有 ${activeDays} 天练习`}
        >
          <defs>
            <linearGradient id="wt-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--wt-accent)" stopOpacity="0.26" />
              <stop offset="60%" stopColor="var(--wt-accent)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="var(--wt-accent)" stopOpacity="0" />
            </linearGradient>
            {/*
              折线的发光交给 CSS `filter: drop-shadow(...)`。
              不用 SVG <filter> + floodColor：presentation attribute 里
              无法解析 var()，会静默失效（画出来不发光也不报错）。
            */}
          </defs>

          {/* ── 网格 + 纵轴刻度 ── */}
          {ticks.map((t, i) => (
            <g key={t.y}>
              <line
                className={`wt-trend__grid${i === ticks.length - 1 ? ' wt-trend__grid--baseline' : ''}`}
                x1={PAD_LEFT}
                y1={t.y}
                x2={VB_W - PAD_RIGHT}
                y2={t.y}
              />
              <text
                className="wt-trend__tick-label"
                x={PAD_LEFT - 10}
                y={t.y + 3.5}
                textAnchor="end"
              >
                {/* 准确率刻度按整数显示，90/95/100 比 90.0/95.0/100.0 干净 */}
                {metric === 'accuracy' ? String(Math.round(t.value)) : formatValue(t.value, metric)}
                {/*
                  单位只挂在最高刻度上。
                  曾经是一个独立的轴标题悬在绘图区左上方 —— 它与主数值行里的
                  「30秒」单位重复，位置上又紧贴主数值，看着像个孤立的错字
                  （截图确认过）。挂到顶部刻度后轴自带单位，且只说一次。
                */}
                {i === 0 && <tspan className="wt-trend__tick-unit"> {unit}</tspan>}
              </text>
            </g>
          ))}

          {/* ── 均值参考线 ── */}
          {showAvgLine && (
            <g className="wt-trend__avg-line">
              <line x1={PAD_LEFT} y1={avgY} x2={VB_W - PAD_RIGHT} y2={avgY} />
              <text x={VB_W - PAD_RIGHT} y={avgY - 5} textAnchor="end">
                均值 {formatValue(avg, metric)}
              </text>
              {/* 值域不从 0 起时明确标注下界，避免被误读成全量程 */}
              {domain.min > 0 && (
                <text
                  className="wt-trend__domain-note"
                  x={VB_W - PAD_RIGHT}
                  y={PLOT_TOP - 12}
                  textAnchor="end"
                >
                  纵轴自 {Math.round(domain.min)}% 起
                </text>
              )}
            </g>
          )}

          {/* ── 休息日：基线上的空心小点（表示「当天没有测量」） ── */}
          {points.map((p) =>
            !p.hasData ? (
              <circle
                key={`idle-${p.date}`}
                className="wt-trend__idle"
                cx={p.x}
                cy={PLOT_BOTTOM}
                r={2.6}
              />
            ) : null,
          )}

          {/* ── 每日竖茎：稀疏数据下让「哪几天练了」依然可读 ── */}
          {points.map((p) =>
            p.hasData && p.value > 0 ? (
              <line
                key={`stem-${p.date}`}
                className="wt-trend__stem"
                x1={p.x}
                y1={PLOT_BOTTOM}
                x2={p.x}
                y2={p.y}
              />
            ) : null,
          )}

          {/* ── 面积 + 折线：每段连续练习独立绘制 ── */}
          {segments.map((seg) => (
            <g key={`seg-${seg.points[0].date}`}>
              {showArea && seg.areaPath && (
                <path className="wt-trend__area" d={seg.areaPath} fill="url(#wt-trend-fill)" />
              )}
              {seg.points.length >= 2 && (
                <polyline className="wt-trend__line" points={seg.polyline} />
              )}
            </g>
          ))}

          {/* ── 数据点 ── */}
          {points.map((p, i) => {
            const isHover = hoverIndex === i;
            // 休息日不画实心点（已由 idle 空心点表达）
            if (!p.hasData) return null;

            const isPeak = peak != null && p.date === peak.date;
            const r = isHover ? 5 : isPeak ? 4 : 2.8;

            return (
              <g key={p.date}>
                {isPeak && !isHover && (
                  <circle className="wt-trend__dot-halo" cx={p.x} cy={p.y} r={8} />
                )}
                <circle
                  className={`wt-trend__dot${isHover ? ' wt-trend__dot--hover' : ''}`}
                  cx={p.x}
                  cy={p.y}
                  r={r}
                />
              </g>
            );
          })}

          {/* ── 峰值数值徽标 ── */}
          {showPeakLabel && peak && (
            <g className="wt-trend__peak-label" pointerEvents="none">
              <rect
                x={peakLabelX - peakLabelW / 2}
                y={peakLabelY - 13}
                width={peakLabelW}
                height={19}
                rx={9.5}
              />
              <text x={peakLabelX} y={peakLabelY + 0.5} textAnchor="middle">
                {peakText}
              </text>
            </g>
          )}

          {/* ── hover 指示竖线 ── */}
          {hovered && (
            <line
              className="wt-trend__cursor"
              x1={hovered.x}
              y1={PLOT_TOP}
              x2={hovered.x}
              y2={PLOT_BOTTOM}
            />
          )}

          {/* ── 横轴日期 ── */}
          {labelIndices.map((i) => (
            <text
              key={`label-${points[i].date}`}
              className="wt-trend__tick-label"
              x={points[i].x}
              y={DATE_LABEL_Y}
              textAnchor="middle"
            >
              {formatShortDate(points[i].date)}
            </text>
          ))}

          {/* ── 练习日条带 ── */}
          {points.map((p) => (
            <rect
              key={`strip-${p.date}`}
              className={`wt-trend__strip${p.hasData ? ' wt-trend__strip--on' : ''}`}
              x={p.x - stripW / 2}
              y={STRIP_Y}
              width={stripW}
              height={STRIP_H}
              rx={2}
            />
          ))}
        </svg>

        {/*
          Tooltip（HTML 覆盖层，样式更好控）。
          首尾数据点必须改变对齐方式：默认 translateX(-50%) 会让 tooltip
          在左右边缘越出容器被裁切/溢出面板。
        */}
        {hovered && (
          <div
            className={`wt-trend__tooltip wt-trend__tooltip--${alignOf(hovered.x, geo)}`}
            style={{ left: `${(hovered.x / VB_W) * 100}%` }}
          >
            <span className="wt-trend__tooltip-date">{formatShortDate(hovered.date)}</span>
            {hovered.hasData ? (
              <span className="wt-trend__tooltip-value">
                {formatValue(hovered.value, metric)}
                <em>{unit}</em>
              </span>
            ) : (
              <span className="wt-trend__tooltip-empty">当日未练习</span>
            )}
            {hovered.hasData && activeDays >= 2 && hovered.value >= avg && (
              <span className="wt-trend__tooltip-tag">高于练习日均值</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrendChart;
