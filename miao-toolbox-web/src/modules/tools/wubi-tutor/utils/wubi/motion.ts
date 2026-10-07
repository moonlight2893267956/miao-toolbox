/**
 * JS 侧动效时长（framer-motion 用**秒**，注意与 CSS 的毫秒不同）。
 *
 * ── 为什么需要这个文件 ──
 *
 * framer-motion 把时长写在 JS 里，它读不到 CSS 变量；而 CSS 也没法 import TS。
 * 所以「两份数字」无法消除 —— 能做的只是**让重复无法漂移**：
 *
 *   `motion.test.ts` 会去解析 `wubi-tutor.css`，逐个比对这里的值与对应的
 *   `--wt-dur-*` 令牌。任何一边改了而另一边没改，测试立刻变红。
 *
 * ── 为什么不用运行时读 CSS 变量（getComputedStyle） ──
 *
 * 那样确实只有一份来源，但代价是：样式表尚未挂上时会**静默返回空串**，
 * `parseFloat('')` → `NaN` → framer-motion 直接把动画变成瞬跳，而且只在
 * 特定的加载顺序下复现，最难查。测试守卫则是在提交时就报错。
 */

/**
 * 与 CSS 三档时长令牌一一对应（秒）。
 *
 * 只镜像 JS 真正用到的三档：`--wt-dur-shake / spin / pulse / blink` 是纯 CSS
 * 动画的节拍，JS 侧没有对应物，也就没有漂移风险，不必镜像。
 */
export const MOTION = {
  /** ↔ `--wt-dur-fast: 120ms` —— 直接反馈（击键、按键态） */
  fast: 0.12,
  /** ↔ `--wt-dur-base: 150ms` —— 悬停 / 选中 / 常规状态切换 */
  base: 0.15,
  /** ↔ `--wt-dur-slow: 260ms` —— 内容进入、进度演进 */
  slow: 0.26,
} as const;

/**
 * 逐句出现的**错峰**节奏（秒）。
 *
 * 它不是「时长」而是「间隔」，CSS 侧没有对应物 ——
 * 排的是阅读节奏（先讲完一句，再叮嘱一条），不是动画速度。
 */
export const STAGGER = {
  /** 相邻解释句之间的间隔 */
  sentence: 0.18,
  /** 同组内相邻条目之间的间隔：比整句更紧，读起来才连贯 */
  item: 0.1,
} as const;
