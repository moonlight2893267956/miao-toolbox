import { describe, it, expect } from 'vitest';
import { Virtualizer } from '@tanstack/virtual-core';
import {
  JW_ROW_HEIGHT,
  JW_MIN_ROW_HEIGHT,
  normalizeRowHeight,
} from '../virtualRowMetrics';

/**
 * 回归：JSON 工作台树行的测量归一化
 *
 * 背景缺陷：虚拟化尺寸缓存里一旦写入 0（元素隐藏/未布局时测量），该行就会与
 * 下一行完全重叠 —— 用户看到「父行与子行叠在一起、类型徽标重叠」的展示错乱。
 * 这里锁死「异常测量一律回落到行高」的约定。
 */
describe('virtualRowMetrics.normalizeRowHeight', () => {
  it('行高常量与 CSS .jw-node-row 高度一致（28px），且下限就是行高', () => {
    expect(JW_ROW_HEIGHT).toBe(28);
    // 行高是硬下限：小于一个行高的测量一律视为异常（否则会与下一行重叠）
    expect(JW_MIN_ROW_HEIGHT).toBe(JW_ROW_HEIGHT);
  });

  it('0 高测量必须回落到行高（防止整行重叠）', () => {
    expect(normalizeRowHeight(0)).toBe(JW_ROW_HEIGHT);
  });

  it('NaN / Infinity / null / undefined 回落到行高', () => {
    expect(normalizeRowHeight(Number.NaN)).toBe(JW_ROW_HEIGHT);
    expect(normalizeRowHeight(Number.POSITIVE_INFINITY)).toBe(JW_ROW_HEIGHT);
    expect(normalizeRowHeight(null)).toBe(JW_ROW_HEIGHT);
    expect(normalizeRowHeight(undefined)).toBe(JW_ROW_HEIGHT);
  });

  it('小于行高的测量（含 24~27 这类「比真实行矮」的值）一律回落到行高', () => {
    expect(normalizeRowHeight(1)).toBe(JW_ROW_HEIGHT);
    expect(normalizeRowHeight(23.9)).toBe(JW_ROW_HEIGHT);
    expect(normalizeRowHeight(24)).toBe(JW_ROW_HEIGHT);
    expect(normalizeRowHeight(25)).toBe(JW_ROW_HEIGHT);
    expect(normalizeRowHeight(27.4)).toBe(JW_ROW_HEIGHT);
    expect(normalizeRowHeight(JW_MIN_ROW_HEIGHT - 0.1)).toBe(JW_ROW_HEIGHT);
  });

  it('不小于行高的测量原样保留（取整），以便将来出现更高的行时仍能真实测量', () => {
    expect(normalizeRowHeight(JW_ROW_HEIGHT)).toBe(JW_ROW_HEIGHT);
    expect(normalizeRowHeight(28.4)).toBe(28);
    expect(normalizeRowHeight(32)).toBe(32);
    expect(normalizeRowHeight(JW_MIN_ROW_HEIGHT)).toBe(JW_MIN_ROW_HEIGHT);
  });
});

/**
 * 用真实的 @tanstack/virtual-core 复现「隐藏页测量出 0 → 父子行完全重叠」，
 * 并验证 JsonTreeView 采用的测量函数能堵住这条路径。
 *
 * 现场证据：工具页被 KeepAlive 用 display:none 隐藏时，ResizeObserver 会交付 0，
 * 旧代码把 0 原样写进 itemSizeCache（getTotalSize 426 → 30）；一旦这次 0
 * 之后没有新的尺寸变化通知（例如测量通知在选择行触发的平滑滚动窗口内被丢弃），
 * 0 就会一直留到页面刷新 —— 与用户「刷新就好了」的现象一致。
 */
describe('虚拟化尺寸缓存：0 高测量造成的整行重叠', () => {
  const noop = () => () => {};

  /** 构造一个最小可用的 Virtualizer，行高约定与 JsonTreeView 保持一致 */
  function makeVirtualizer(
    measureElement?: (element: unknown) => number,
  ): Virtualizer<Element, Element> {
    return new Virtualizer<Element, Element>({
      count: 3,
      getScrollElement: () => null,
      observeElementRect: noop as never,
      observeElementOffset: noop as never,
      scrollToFn: () => {},
      estimateSize: () => JW_ROW_HEIGHT,
      getItemKey: (index: number) => `$.key${index}`,
      ...(measureElement ? { measureElement: measureElement as never } : {}),
    });
  }

  /** 伪造成「被 display:none 隐藏的行」：offsetHeight / 矩形高度都是 0 */
  const hiddenRowEl = (index: number) => ({
    getAttribute: () => String(index),
    isConnected: true,
    offsetHeight: 0,
    getBoundingClientRect: () => ({ height: 0, width: 0, top: 0, bottom: 0, left: 0, right: 0 }),
  }) as unknown as Element;

  const rowEl = (index: number, height: number) => ({
    getAttribute: () => String(index),
    isConnected: true,
    offsetHeight: height,
    getBoundingClientRect: () => ({ height, width: 0, top: 0, bottom: height, left: 0, right: 0 }),
  }) as unknown as Element;

  /** getMeasurements 在 d.ts 里是 private，但运行时是公开方法，测试里显式取用 */
  const measurements = (v: Virtualizer<Element, Element>) =>
    (v as unknown as { getMeasurements: () => Array<{ start: number; size: number }> }).getMeasurements();

  it('修复前的测量函数：0 会被写进缓存，下一行与它起点相同（完全重叠）', () => {
    // 修复前的 JsonTreeView 没有传 measureElement，用的就是库默认实现
    const v = makeVirtualizer();
    measurements(v);

    v.measureElement(hiddenRowEl(1));
    const m = measurements(v);

    expect(v.itemSizeCache.get('$.key1')).toBe(0);
    expect(m[1].size).toBe(0);
    // 第 1 行与第 2 行起点完全相同 —— 就是截图里「父行与子行叠在一起」的几何特征
    expect(m[2].start).toBe(m[1].start);

    // 而且自愈不了：库默认实现在没有 ResizeObserver entry 时直接返回缓存里的 0，
    // 因此「恢复可见后的再次测量」不会把 0 修回来 —— 这正是用户说的「刷新才好」
    v.measureElement(rowEl(1, JW_ROW_HEIGHT));
    expect(v.itemSizeCache.get('$.key1')).toBe(0);
  });

  it('修复后的测量函数：0 高被钳制回行高，相邻行不再重叠', () => {
    const v = makeVirtualizer((element) =>
      normalizeRowHeight(
        'offsetHeight' in (element as object)
          ? (element as { offsetHeight: number }).offsetHeight
          : (element as Element).getBoundingClientRect().height,
      ),
    );
    measurements(v);

    v.measureElement(hiddenRowEl(1));
    const m = measurements(v);

    // 隐藏状态量到的 0 已被钳制成行高：0 根本没进尺寸缓存（估算值即行高，delta=0），
    // 因此即便后续的测量通知被丢弃（平滑滚动窗口等），有效尺寸也始终是行高
    expect(normalizeRowHeight((hiddenRowEl(1) as unknown as { offsetHeight: number }).offsetHeight)).toBe(JW_ROW_HEIGHT);
    expect(v.itemSizeCache.has('$.key1')).toBe(false);
    expect(m[1].size).toBe(JW_ROW_HEIGHT);
    // 相邻行严丝合缝：下一行起点 = 上一行起点 + 行高
    expect(m[2].start).toBe(m[1].start + JW_ROW_HEIGHT);
    expect(m[1].start).not.toBe(m[2].start);
  });
});