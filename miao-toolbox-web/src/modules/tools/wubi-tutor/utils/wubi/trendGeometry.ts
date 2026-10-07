/**
 * 趋势图几何量（纯函数，与 React 无关，便于单测）。
 *
 * ── 为什么是「实测宽度 + 固定高度」，而不是固定 viewBox ──
 *
 * 原来用固定 viewBox（720×214）配 `width:100%; height:auto`：
 * SVG 等比缩放 ⇒ **高度 = 容器宽度 × 0.297**。
 * 统计页卡片在大屏上约 1030px 宽，图就长到 306px 高（绘图区比设计值高 43%），
 * 连里面的 11px 刻度字也被同步放大约 15.7px —— 整块显得又大又松。
 * 更糟的是它**随窗口变宽而无上限地长高**，在任何大屏上都不可能「紧凑」。
 *
 * 现在把 viewBox 的宽取成**实测宽度**（1:1 对应像素），高度锁死为常量：
 * 图随容器变宽只增宽度，高度与字号都保持设计值。
 *
 * !! 因此：`plotH` / `h` 必须与 `w` 无关 —— 这正是本模块单测锁住的性质 !!
 */

/** 图表总高（固定，不随宽度变化） */
export const TREND_CHART_H = 178;

/** 绘图区上方留白：够放轴单位标题与峰值徽标 */
const PAD_TOP = 24;
/** 绘图区下方留白：日期标签 + 练习日条带 */
const PAD_BOTTOM = 40;
/* 48 而不是 40：最高刻度要带单位后缀（如「2000 秒」），留够宽度才不挤 */
const PAD_LEFT = 48;
const PAD_RIGHT = 16;

const PLOT_TOP = PAD_TOP;
const PLOT_BOTTOM = TREND_CHART_H - PAD_BOTTOM;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

/** 容器未测量出来的首帧宽度（ResizeObserver 首帧前的兜底） */
export const FALLBACK_TREND_WIDTH = 720;
/** 宽度下限：再窄就没有绘图价值了 */
export const MIN_TREND_WIDTH = 280;

export interface TrendGeometry {
  /** viewBox 宽（= 容器实测像素宽） */
  w: number;
  /** viewBox 高（固定） */
  h: number;
  padLeft: number;
  padRight: number;
  plotTop: number;
  plotBottom: number;
  plotH: number;
  plotW: number;
  /** 横轴日期标签的基线 y */
  dateLabelY: number;
  /** 底部「练习日」条带 */
  stripY: number;
  stripH: number;
}

/**
 * 按容器宽度算出整套几何量。
 *
 * @param width 容器实测宽度（px）；未测量时传 0 或负数即可走兜底值
 */
export function trendGeometry(width: number): TrendGeometry {
  const safe = Number.isFinite(width) && width > 0 ? width : FALLBACK_TREND_WIDTH;
  const w = Math.max(MIN_TREND_WIDTH, Math.round(safe));

  return {
    w,
    h: TREND_CHART_H,
    padLeft: PAD_LEFT,
    padRight: PAD_RIGHT,
    plotTop: PLOT_TOP,
    plotBottom: PLOT_BOTTOM,
    plotH: PLOT_H,
    plotW: w - PAD_LEFT - PAD_RIGHT,
    dateLabelY: PLOT_BOTTOM + 15,
    stripY: PLOT_BOTTOM + 23,
    stripH: 5,
  };
}
