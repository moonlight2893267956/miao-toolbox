import { describe, it, expect } from 'vitest';
import { transformDialect } from './cronDialect';

describe('transformDialect', () => {
  it('AC5：5→6 在表达式前补秒字段 0', () => {
    expect(transformDialect('*/5 9 * * 1-5', 'linux5', 'spring6')).toBe('0 */5 9 * * 1-5');
  });

  it('AC5：6→5 移除秒字段', () => {
    expect(transformDialect('0 */5 9 * * 1-5', 'spring6', 'linux5')).toBe('*/5 9 * * 1-5');
  });

  it('空表达式转换保持为空', () => {
    expect(transformDialect('', 'linux5', 'spring6')).toBe('');
  });
});
