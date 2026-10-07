/**
 * 可复现随机数单测。
 *
 * 这份测试是「刷新后继续练习」的地基：整个恢复机制不序列化任何题源内部
 * 状态，而是靠**同一种子 → 同一题序**重建出来的。若这里的确定性不成立，
 * 恢复出来的会是另一轮题，比不恢复更糟。
 */

import { describe, it, expect } from 'vitest';
import { createRng, randomSeed } from './rng';

describe('createRng', () => {
  it('同一种子产生完全相同的序列', () => {
    const a = createRng(12345);
    const b = createRng(12345);

    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());

    expect(seqA).toEqual(seqB);
  });

  it('不同种子产生不同序列', () => {
    const a = Array.from({ length: 20 }, createRng(1));
    const b = Array.from({ length: 20 }, createRng(2));

    expect(a).not.toEqual(b);
  });

  it('取值落在 [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('中段复用不会「跳回开头」——第 N 次的值只由种子与前序调用决定', () => {
    const direct = createRng(99);
    for (let i = 0; i < 10; i++) direct();
    const eleventh = direct();

    const replay = createRng(99);
    let value = 0;
    for (let i = 0; i < 11; i++) value = replay();

    expect(value).toBe(eleventh);
  });

  it('种子为 0 / 负数 / 超 32 位也不崩，且仍可复现', () => {
    for (const seed of [0, -1, -12345, 2 ** 40, 4294967296]) {
      const a = createRng(seed);
      const b = createRng(seed);
      expect(a()).toBe(b());
    }
  });

  it('分布大致均匀（抽题用，不做严格统计检验）', () => {
    const rng = createRng(2026);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 10000; i++) buckets[Math.floor(rng() * 10)]++;

    // 每个桶期望 1000 次，允许 ±30% 的粗放波动
    for (const count of buckets) {
      expect(count).toBeGreaterThan(700);
      expect(count).toBeLessThan(1300);
    }
  });
});

describe('randomSeed', () => {
  it('产出 32 位无符号整数', () => {
    for (let i = 0; i < 50; i++) {
      const seed = randomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(4294967296);
    }
  });
});
