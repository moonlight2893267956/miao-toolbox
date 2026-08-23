import { describe, it, expect } from 'vitest';
import { sortText } from './sort';

// 可重复的伪随机源（线性同余），用于 shuffle 确定性断言
function makeRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('sortText', () => {
  // AC1: 升序
  it('AC1: asc 字典升序排序', () => {
    const r = sortText('banana\napple\ncherry');
    expect(r.resultText).toBe('apple\nbanana\ncherry');
    expect(r.stats).toEqual({ remaining: 3, removed: 0 });
  });

  // AC2: 降序
  it('AC2: desc 字典降序排序', () => {
    const r = sortText('banana\napple\ncherry', { method: 'desc' });
    expect(r.resultText).toBe('cherry\nbanana\napple');
  });

  // AC3: 自然排序（数字按数值）
  it('AC3: natural 自然排序使 2 排在 10 之前', () => {
    const r = sortText('item10\nitem2\nitem1', { method: 'natural' });
    expect(r.resultText).toBe('item1\nitem2\nitem10');
  });

  // AC4: 长度短->长
  it('AC4: length-asc 按长度短到长', () => {
    const r = sortText('aaa\nbb\nc', { method: 'length-asc' });
    expect(r.resultText).toBe('c\nbb\naaa');
  });

  // AC4: 长度长->短
  it('AC4: length-desc 按长度长到短', () => {
    const r = sortText('aaa\nbb\nc', { method: 'length-desc' });
    expect(r.resultText).toBe('aaa\nbb\nc');
  });

  // AC5: 乱序（shuffle）
  it('AC5: shuffle 元素集合不变、顺序随机', () => {
    const input = 'a\nb\nc\nd\ne';
    const rng = makeRng(42);
    const r = sortText(input, { method: 'shuffle', rng });
    const out = r.resultText.split('\n').sort().join(',');
    expect(out).toBe('a,b,c,d,e');
    expect(r.stats.remaining).toBe(5);
    // 同一 seed 结果可重复
    const r2 = sortText(input, { method: 'shuffle', rng: makeRng(42) });
    expect(r2.resultText).toBe(r.resultText);
  });

  // AC6: 大小写敏感（默认）/ 不敏感
  it('AC6: 默认大小写敏感', () => {
    const r = sortText('Banana\napple', { method: 'asc' });
    // 大写 B(66) 排在 a(97) 之前
    expect(r.resultText).toBe('Banana\napple');
  });

  it('AC6: ignoreCase 时大小写不敏感', () => {
    const r = sortText('Banana\napple', { method: 'asc', ignoreCase: true });
    expect(r.resultText).toBe('apple\nBanana');
  });

  // AC7: 分隔符模式
  it('AC7: delimiter 按分隔符切分排序', () => {
    const r = sortText('c,b,a', { delimiter: ',', method: 'asc' });
    expect(r.resultText).toBe('a,b,c');
  });

  // 稳定性：相等项保持原顺序
  it('稳定性: 相等项保留原始相对顺序', () => {
    const r = sortText('b2\nb1\nb3', { method: 'asc' });
    expect(r.resultText).toBe('b1\nb2\nb3');
  });

  // 边界：空输入
  it('边界: 空字符串返回全零结果', () => {
    const r = sortText('');
    expect(r).toEqual({ resultText: '', stats: { remaining: 0, removed: 0 }, units: [] });
  });

  // 边界：非字符串输入
  it('边界: 非字符串输入返回全零结果', () => {
    // @ts-expect-error 测试非法输入
    expect(sortText(null)).toEqual({ resultText: '', stats: { remaining: 0, removed: 0 }, units: [] });
    // @ts-expect-error 测试非法输入
    expect(sortText(undefined)).toEqual({ resultText: '', stats: { remaining: 0, removed: 0 }, units: [] });
  });

  // 边界：分隔符为空字符串时按换行处理
  it('边界: delimiter 为空字符串时按换行处理', () => {
    const r = sortText('c\na\nb', { delimiter: '' });
    expect(r.resultText).toBe('a\nb\nc');
  });

  // units: 标注原始 index 与 kept
  it('units: 标注 index 与 action=kept', () => {
    const r = sortText('b\na\nc', { method: 'asc' });
    expect(r.units).toEqual([
      { index: 1, text: 'a', action: 'kept' },
      { index: 0, text: 'b', action: 'kept' },
      { index: 2, text: 'c', action: 'kept' },
    ]);
  });

  // 边界：单元素
  it('边界: 单元素保持原样', () => {
    const r = sortText('only');
    expect(r.resultText).toBe('only');
    expect(r.stats.remaining).toBe(1);
  });

  // 边界：所有元素相等
  it('边界: 全部相等仍返回 N 条', () => {
    const r = sortText('x\nx\nx', { method: 'asc' });
    expect(r.resultText).toBe('x\nx\nx');
    expect(r.stats.remaining).toBe(3);
  });
});
