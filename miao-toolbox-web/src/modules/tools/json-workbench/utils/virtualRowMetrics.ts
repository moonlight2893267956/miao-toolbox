/**
 * 树形视图虚拟滚动的行高约定与测量归一化
 *
 * 背景：JSON 工作台树用 @tanstack/react-virtual 做虚拟滚动。虚拟化按「尺寸缓存」
 * 计算每一行的 translateY，只要某一行的高度被算小（尤其是 0），它就会与下一行
 * 重叠 —— 用户看到的就是「父行和子行叠在一起、类型徽标也叠在一起」的错乱。
 *
 * 这里把两条约定收敛成常量 + 纯函数，方便单测锁死：
 * 1. 行高恒定：CSS `.jw-node-row` 的 height / min-height 都必须等于 JW_ROW_HEIGHT；
 * 2. 测量兜底：隐藏 / 未布局 / 过渡瞬间量到的 0、NaN、小于一个行高的值，
 *    一律回落到行高 —— 尺寸缓存里因此永远不会出现「比真实行还矮」的值。
 */

/** 树行高度（px），必须与 json-workbench.css 中 .jw-node-row 的 height 一致 */
export const JW_ROW_HEIGHT = 28;

/**
 * 有效测量的下限（px）＝行高本身。
 *
 * 行高是硬下限：CSS 已把 `.jw-node-row` 固定为 28px，任何比它小的测量都只可能
 * 来自隐藏 / 未布局 / 过渡中的瞬态；若原样写进尺寸缓存，该行就会与下一行重叠
 * （曾被真实复现：隐藏页测量得 0 → 相邻两行起点完全相同）。
 * 大于行高的测量（将来若新增更高的行）如实保留。
 */
export const JW_MIN_ROW_HEIGHT = JW_ROW_HEIGHT;

/**
 * 归一化一次行高测量结果。
 *
 * @param measured ResizeObserver / offsetHeight / getBoundingClientRect 得到的原始高度
 * @returns 可用于虚拟化尺寸缓存的高度：非法或小于行高的值回落到行高，其余取整
 */
export function normalizeRowHeight(measured: number | null | undefined): number {
  if (typeof measured !== 'number' || !Number.isFinite(measured)) {
    return JW_ROW_HEIGHT;
  }
  const rounded = Math.round(measured);
  return rounded < JW_MIN_ROW_HEIGHT ? JW_ROW_HEIGHT : rounded;
}