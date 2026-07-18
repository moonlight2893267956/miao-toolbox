import { describe, it, expect } from 'vitest';
import { validate } from './cronValidator';

describe('cronValidator', () => {
  it('AC2：合法表达式通过校验', () => {
    const r = validate('*/5 9 * * 1-5', 'linux5');
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it('AC3：小时 25 超范围，字段标红 + 正确错误消息', () => {
    const r = validate('*/5 25 * * 1-5', 'linux5');
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].fieldIndex).toBe(1);
    expect(r.errors[0].message).toBe('小时字段值 25 超出范围 (0-23)');
  });

  it('AC4：2 月 31 号触发语义警告（不阻断）', () => {
    const r = validate('0 0 31 2 *', 'linux5');
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.message.includes('2月没有31号'))).toBe(true);
  });

  it('空表达式视为待输入，无错误无警告', () => {
    const r = validate('', 'linux5');
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it('字段数不符报错', () => {
    const r = validate('* * * * *', 'spring6');
    expect(r.valid).toBe(false);
    expect(r.errors[0].fieldIndex).toBe(-1);
  });

  it('日与星期同时限定触发并集警告', () => {
    const r = validate('0 0 1 * 1', 'linux5');
    expect(r.warnings.some((w) => w.message.includes('并集'))).toBe(true);
  });

  it('特殊字符误用：分钟字段 L 报错', () => {
    const r = validate('L * * * *', 'linux5');
    expect(r.valid).toBe(false);
    expect(r.errors[0].message).toBe('特殊字符 L 不适用于分钟字段');
  });
});
