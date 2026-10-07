import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * 观测元素宽度（px）。用于让 SVG 的 viewBox 宽度跟随真实像素宽，
 * 从而「高度不随宽度变化」（见 `trendGeometry.ts` 的说明）。
 *
 * 设计取舍：
 *
 * 1. **只关心宽度**。ResizeObserver 在高度变化时也会回调，若不加判断会
 *    造成「设状态 → 重渲 → 又回调」的抖动。这里只在宽度真的变了（>1px）
 *    才 setState。
 * 2. **没有 ResizeObserver 时退化为首帧测量**（老浏览器 / jsdom）。
 *    宁可不响应后续变化，也不要抛错把整个图表带崩。
 *
 * @returns `[ref, width]`；width 为 0 表示尚未测量，调用方应走兜底值
 */
export function useElementWidth<T extends HTMLElement>(): [
  RefObject<T | null>,
  number,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = (next: number) => {
      setWidth((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    };

    measure(el.clientWidth);

    if (typeof ResizeObserver === 'undefined') return;

    /*
     * 用 entry 里的实测尺寸，**不要**回读 el.clientWidth。
     *
     * 这是个踩过的坑：回调触发时布局未必已提交，回读可能拿到上一帧的旧值；
     * 而 ResizeObserver 只在尺寸**变化**时才回调 —— 一旦那一次读到旧值，
     * 就再也没有机会纠正，表现为「图偶尔不跟着容器缩放」
     * （实测复现：卡片压窄后 viewBox 停在旧宽度不动）。
     * entry.contentRect 是观察器自己量的，不存在读旧值的问题。
     */
    const observer = new ResizeObserver((entries) => {
      const reported = entries[entries.length - 1]?.contentRect.width;
      measure(typeof reported === 'number' && reported > 0 ? reported : el.clientWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
