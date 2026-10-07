import { describe, it, expect } from 'vitest';
import {
  trendGeometry,
  TREND_CHART_H,
  MIN_TREND_WIDTH,
  FALLBACK_TREND_WIDTH,
} from './trendGeometry';

/**
 * 趋势图几何量的回归守卫。
 *
 * 这里锁住的是**用户实际反馈的那个 bug**：图高曾等于「容器宽 × 0.297」
 * （固定 viewBox + height:auto 等比缩放的必然结果），
 * 于是大屏卡片上图长到 306px 高、字号被放大 43%，整块显得又大又松。
 *
 * 所以最关键的一条就是：**高度与宽度无关**。
 */
describe('趋势图几何：高度与宽度解耦', () => {
  it('总高是常量，与容器宽度无关', () => {
    const widths = [320, 600, 720, 1030, 1440, 2560];
    for (const w of widths) {
      expect(trendGeometry(w).h).toBe(TREND_CHART_H);
    }
  });

  it('绘图区高度与宽度无关（回归：宽 1030px 时曾高达 306px 整图）', () => {
    const narrow = trendGeometry(480);
    const wide = trendGeometry(1030);
    const ultraWide = trendGeometry(2560);

    expect(wide.plotH).toBe(narrow.plotH);
    expect(ultraWide.plotH).toBe(narrow.plotH);
    // 绘图区太矮就读不出层次了
    expect(narrow.plotH).toBeGreaterThanOrEqual(100);
    // 整图不应超过一个「紧凑块」的量级
    expect(TREND_CHART_H).toBeLessThanOrEqual(200);
  });

  it('绘图区宽度随容器增长，且不出现负宽', () => {
    expect(trendGeometry(1030).plotW).toBeGreaterThan(trendGeometry(480).plotW);
    for (const w of [0, 1, 120, MIN_TREND_WIDTH, 1030]) {
      expect(trendGeometry(w).plotW).toBeGreaterThan(0);
    }
  });

  it('过窄时钳到下限（否则横轴会挤成一团）', () => {
    expect(trendGeometry(120).w).toBe(MIN_TREND_WIDTH);
    expect(trendGeometry(1).w).toBe(MIN_TREND_WIDTH);
  });

  it('未测量 / 非法宽度走兜底值', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(trendGeometry(bad).w).toBe(FALLBACK_TREND_WIDTH);
    }
  });

  it('日期标签与练习日条带都落在总高之内（不被裁掉）', () => {
    for (const w of [MIN_TREND_WIDTH, 720, 1030]) {
      const geo = trendGeometry(w);
      // 标签基线下方要留出字号高度（约 11px）的余地
      expect(geo.dateLabelY).toBeLessThan(geo.h);
      expect(geo.stripY + geo.stripH).toBeLessThan(geo.h);
      // 条带在日期标签下方，且两者不重叠
      expect(geo.stripY).toBeGreaterThan(geo.dateLabelY);
    }
  });

  it('绘图区与下边界一致，刻度不会压到日期标签上', () => {
    const geo = trendGeometry(1030);
    expect(geo.plotBottom).toBeLessThan(geo.dateLabelY);
    expect(geo.plotTop).toBeLessThan(geo.plotBottom);
    expect(geo.plotW).toBe(geo.w - geo.padLeft - geo.padRight);
  });
});
