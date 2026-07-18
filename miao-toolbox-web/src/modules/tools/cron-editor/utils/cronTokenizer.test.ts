import { describe, it, expect } from 'vitest';
import { tokenize } from './cronTokenizer';

describe('cronTokenizer', () => {
  it('5 位模式：正确拆分 5 个字段', () => {
    const r = tokenize('*/5 9 * * 1-5', 'linux5');
    expect(r.error).toBeUndefined();
    expect(r.tokens).toEqual(['*/5', '9', '*', '*', '1-5']);
  });

  it('6 位模式：正确拆分 6 个字段', () => {
    const r = tokenize('0 */5 9 * * 1-5', 'spring6');
    expect(r.error).toBeUndefined();
    expect(r.tokens).toHaveLength(6);
  });

  it('字段数不符（少于预期）报错', () => {
    const r = tokenize('* * * *', 'linux5');
    expect(r.error).toContain('应包含 5 个字段');
  });

  it('字段数不符（多于预期）报错', () => {
    const r = tokenize('* * * * * * *', 'spring6');
    expect(r.error).toContain('应包含 6 个字段');
  });

  it('空表达式不视为结构错误', () => {
    const r = tokenize('', 'linux5');
    expect(r.error).toBeUndefined();
    expect(r.tokens).toEqual([]);
  });

  it('多余空白被归一化', () => {
    const r = tokenize('  */5   9 *  *   1-5  ', 'linux5');
    expect(r.error).toBeUndefined();
    expect(r.tokens).toHaveLength(5);
  });
});
