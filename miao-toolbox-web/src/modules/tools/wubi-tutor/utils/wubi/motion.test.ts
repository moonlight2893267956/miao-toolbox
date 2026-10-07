import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MOTION, STAGGER } from './motion';

/**
 * JS 侧动效时长与 CSS 令牌的**一致性守卫**。
 *
 * 背景：framer-motion 的时长只能写在 JS 里，CSS 令牌它读不到；
 * CSS 也没法 import TS。所以「同一套时长存在两份」是结构性的，消除不掉。
 *
 * 能消除的是**漂移**：这里把 CSS 源码读进来逐个比对，
 * 任何一边改了而另一边没改，测试立刻变红。
 *
 * 用测试而不是运行时读 CSS 变量，是因为后者在样式未挂载时会静默拿到空值，
 * 变成 NaN 时长 —— 动画直接瞬跳，还只在特定加载顺序下复现，最难查。
 *
 * !! 读源码必须走 fs，不能用 Vite 的 `?raw` !!
 * 实测：`.tsx?raw` 正常返回源码，但 **`.css?raw` 被 vitest 替换成空串**
 * （vitest 默认不处理 CSS），守卫会因此退化成「在空串里找不到令牌」而误报。
 * 守卫要读的是**文件本身**，不能依赖打包器对它的加工。
 */

const BASE = new URL('../../', import.meta.url);
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, BASE)), 'utf8');

const css = read('wubi-tutor.css');

/** 读取 `--token: 120ms;` 的毫秒值；找不到返回 null */
function cssMs(token: string): number | null {
  const m = new RegExp(`${token}:\\s*([0-9.]+)(m?s)\\b`).exec(css);
  if (!m) return null;
  return m[2] === 'ms' ? parseFloat(m[1]) : parseFloat(m[1]) * 1000;
}

/** JS 镜像的档位 ↔ 对应的 CSS 令牌 */
const MIRRORED: [keyof typeof MOTION, string][] = [
  ['fast', '--wt-dur-fast'],
  ['base', '--wt-dur-base'],
  ['slow', '--wt-dur-slow'],
];

describe('JS 动效时长与 CSS 令牌不漂移', () => {
  for (const [key, token] of MIRRORED) {
    it(`MOTION.${key}（${MOTION[key]}s）与 ${token} 一致`, () => {
      const ms = cssMs(token);

      // 先断言令牌存在：否则下面会退化成「两个 NaN 相等」而假通过
      expect(ms, `CSS 里找不到 ${token} —— 令牌被改名或删除了？`).not.toBeNull();

      // framer-motion 用秒，CSS 用毫秒
      expect(MOTION[key]).toBeCloseTo(ms! / 1000, 5);
    });
  }

  it('错峰节奏是正数，且同组间隔比整句更紧', () => {
    expect(STAGGER.sentence).toBeGreaterThan(0);
    expect(STAGGER.item).toBeGreaterThan(0);
    // 否则「一组」读起来是散的，节奏感就没了
    expect(STAGGER.item).toBeLessThan(STAGGER.sentence);
  });
});

/**
 * 反向守卫：这几个文件里的 transition 时长**只能**来自 MOTION。
 *
 * 上面的守卫防的是「两份值不一致」，这一条防的是「有人又写死一个」——
 * 否则下次改动就绕开了镜像，守卫形同虚设。
 */
describe('动效时长必须取自 MOTION', () => {
  const FILES: [string, string][] = [
    ['SplitDemo.tsx', read('components/SplitDemo.tsx')],
    ['PracticeBoard.tsx', read('components/PracticeBoard.tsx')],
    ['WubiTutorPage.tsx', read('WubiTutorPage.tsx')],
  ];

  for (const [name, code] of FILES) {
    it(`${name} 里没有硬编码的 duration / delay 字面量`, () => {
      const offenders: string[] = [];
      for (const m of code.matchAll(/\b(?:duration|delay):\s*([^,\n}]+)/g)) {
        // 允许 `reduceMotion ? 0 : MOTION.x` 这类表达式；只拦纯数字字面量
        if (/^[0-9.]+$/.test(m[1].trim())) offenders.push(m[0].trim());
      }

      expect(offenders, '发现硬编码时长，请改用 MOTION / STAGGER').toEqual([]);
    });
  }
});
