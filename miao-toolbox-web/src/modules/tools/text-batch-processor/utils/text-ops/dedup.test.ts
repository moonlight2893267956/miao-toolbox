import { describe, it, expect } from 'vitest';
import { deduplicate } from './dedup';

describe('deduplicate', () => {
  // AC1: 基础去重（按行）
  it('AC1: 按行去重返回剩余文本与统计', () => {
    const r = deduplicate('apple\nbanana\napple\ncherry\nbanana');
    expect(r.resultText).toBe('apple\nbanana\ncherry');
    expect(r.stats).toEqual({ removed: 2, remaining: 3 });
  });

  // AC2: keepLast 保留末次
  it('AC2: keepLast 时保留末次出现位置', () => {
    const r = deduplicate('apple\nbanana\napple', { keepLast: true });
    // 末次 apple 在后，输出应保持该顺序 [banana, apple]
    expect(r.resultText).toBe('banana\napple');
    expect(r.stats.remaining).toBe(2);
  });

  // AC2 补: keepLast 应保留末次出现的顺序位置（非简单 reverse）
  it('AC2 补: keepLast 保留末次出现顺序位置', () => {
    const r = deduplicate('banana\napple\napple', { keepLast: true });
    // 末次 apple 在末尾，输出应保持 [banana, apple]
    expect(r.resultText).toBe('banana\napple');
  });

  // AC2 补: keepLast 在分隔符模式下同样成立
  it('AC2 补: keepLast 分隔符模式保留末次顺序', () => {
    const r = deduplicate('a,b,a,c', { delimiter: ',', keepLast: true });
    expect(r.resultText).toBe('b,a,c');
  });

  // AC3: ignoreCase 忽略大小写
  it('AC3: ignoreCase 将不同大小写视为重复', () => {
    const r = deduplicate('Apple\napple\nAPPLE', { ignoreCase: true });
    expect(r.stats.remaining).toBe(1);
  });

  // AC4: ignoreWhitespace trim 后比较
  it('AC4: ignoreWhitespace 将首尾空白 trim 后视为重复', () => {
    const r = deduplicate('  apple  \napple\napple', { ignoreWhitespace: true });
    expect(r.stats.remaining).toBe(1);
    expect(r.resultText).toBe('apple');
  });

  // AC5: ignoreEmptyLines 移除空行
  it('AC5: ignoreEmptyLines 移除空行', () => {
    const r = deduplicate('apple\n\n\nbanana', { ignoreEmptyLines: true });
    expect(r.resultText).toBe('apple\nbanana');
    expect(r.stats.remaining).toBe(2);
  });

  // AC6: 分隔符模式
  it('AC6: delimiter 按分隔符切分去重', () => {
    const r = deduplicate('a,b,a,c,b', { delimiter: ',' });
    expect(r.resultText).toBe('a,b,c');
    expect(r.stats).toEqual({ removed: 2, remaining: 3 });
  });

  // AC7: 空输入
  it('AC7: 空字符串返回全零结果', () => {
    const r = deduplicate('');
    expect(r).toEqual({ resultText: '', stats: { removed: 0, remaining: 0 }, units: [] });
  });

  // 边界：null/undefined 视作空
  it('边界: 非字符串输入返回全零结果', () => {
    // @ts-expect-error 测试非法输入
    expect(deduplicate(null)).toEqual({ resultText: '', stats: { removed: 0, remaining: 0 }, units: [] });
    // @ts-expect-error 测试非法输入
    expect(deduplicate(undefined)).toEqual({ resultText: '', stats: { removed: 0, remaining: 0 }, units: [] });
  });

  // 边界：分隔符模式下 ignoreCase + ignoreWhitespace 组合
  it('边界: 分隔符 + ignoreCase + ignoreWhitespace 组合', () => {
    const r = deduplicate('  Apple ,apple,APPLE ', {
      delimiter: ',',
      ignoreCase: true,
      ignoreWhitespace: true,
    });
    expect(r.stats.remaining).toBe(1);
    expect(r.resultText).toBe('Apple');
  });

  // 边界：ignoreEmptyLines 在分隔符模式下移除空白单元
  it('边界: 分隔符 + ignoreEmptyLines 移除空单元', () => {
    const r = deduplicate('a,,b,', { delimiter: ',', ignoreEmptyLines: true });
    expect(r.resultText).toBe('a,b');
    expect(r.stats.remaining).toBe(2);
  });

  // 边界：无重复时 removed=0
  it('边界: 无重复时 removed 为 0', () => {
    const r = deduplicate('a\nb\nc');
    expect(r.stats).toEqual({ removed: 0, remaining: 3 });
  });

  // 边界：全部为重复行时 remaining=1
  it('边界: 全部重复时 remaining 为 1', () => {
    const r = deduplicate('x\nx\nx\nx');
    expect(r.stats).toEqual({ removed: 3, remaining: 1 });
  });

  // 边界：仅含空行且 ignoreEmptyLines
  it('边界: 仅空行 + ignoreEmptyLines 返回空', () => {
    const r = deduplicate('\n\n\n', { ignoreEmptyLines: true });
    expect(r).toEqual({ resultText: '', stats: { removed: 0, remaining: 0 }, units: r.units });
    // 额外验证：3 个原始行都被标记为 empty-filtered
    expect(r.units.every((u) => u.action === 'empty-filtered')).toBe(true);
  });

  // 边界：分隔符为空字符串时退化为换行模式
  it('边界: delimiter 为空字符串时按换行处理', () => {
    const r = deduplicate('a\nb\na', { delimiter: '' });
    expect(r.resultText).toBe('a\nb');
    expect(r.stats.remaining).toBe(2);
  });

  // units: 每行命运标注
  it('units: 标记 kept/removed 正确', () => {
    const r = deduplicate('a\nb\na\nc');
    expect(r.units).toEqual([
      { index: 0, text: 'a', action: 'kept' },
      { index: 1, text: 'b', action: 'kept' },
      { index: 2, text: 'a', action: 'removed' },
      { index: 3, text: 'c', action: 'kept' },
    ]);
  });

  // units: keepLast 时末次保留、首次被标 removed
  it('units: keepLast 时末次 kept、首次 removed', () => {
    const r = deduplicate('a\nb\na', { keepLast: true });
    expect(r.units[0].action).toBe('removed');
    expect(r.units[2].action).toBe('kept');
  });

  // units: ignoreEmptyLines 时空行被标 empty-filtered
  it('units: ignoreEmptyLines 标注 empty-filtered', () => {
    const r = deduplicate('a\n\nb', { ignoreEmptyLines: true });
    expect(r.units[1].action).toBe('empty-filtered');
    expect(r.units[0].action).toBe('kept');
    expect(r.units[2].action).toBe('kept');
  });
});
