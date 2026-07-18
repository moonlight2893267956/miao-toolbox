import { describe, it, expect } from 'vitest';
import { parseExpression } from './cronParser';

describe('cronParser', () => {
  it('解析合法 5 位表达式', () => {
    const r = parseExpression('*/5 9 * * 1-5', 'linux5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.expr.fields).toHaveLength(5);
      // 星期字段 1-5 → [1,2,3,4,5]
      const weekday = r.expr.fields.find((f) => f.type === 'weekday');
      expect(weekday?.values).toEqual([1, 2, 3, 4, 5]);
      // 分钟 */5 → 0,5,...,55
      const minute = r.expr.fields.find((f) => f.type === 'minute');
      expect(minute?.values).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    }
  });

  it('解析合法 6 位表达式（含秒）', () => {
    const r = parseExpression('0 */5 9 * * 1-5', 'spring6');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.expr.fields).toHaveLength(6);
      expect(r.expr.fields[0].type).toBe('second');
      expect(r.expr.fields[0].raw).toBe('0');
    }
  });

  it('范围错误：小时 25 超出 (0-23)，定位到小时字段', () => {
    const r = parseExpression('*/5 25 * * 1-5', 'linux5');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // 5 位顺序：minute(0) hour(1) day(2) month(3) weekday(4)
      expect(r.fieldIndex).toBe(1);
      expect(r.error).toBe('小时字段值 25 超出范围 (0-23)');
    }
  });

  it('字段数不符：5 位表达式在 6 位模式下结构错误（fieldIndex -1）', () => {
    const r = parseExpression('*/5 9 * * 1-5', 'spring6');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldIndex).toBe(-1);
      expect(r.error).toContain('应包含 6 个字段');
    }
  });

  it('特殊字符误用：分钟字段 L 报错', () => {
    const r = parseExpression('L * * * *', 'linux5');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldIndex).toBe(0);
      expect(r.error).toBe('特殊字符 L 不适用于分钟字段');
    }
  });

  it('合法特殊字符：日字段 L 被接受', () => {
    const r = parseExpression('0 0 L * *', 'linux5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const day = r.expr.fields.find((f) => f.type === 'day');
      expect(day?.special).toBe('L');
    }
  });

  it('合法特殊字符：星期字段 2#1（第一个周一）被接受', () => {
    const r = parseExpression('0 0 * * 2#1', 'linux5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const weekday = r.expr.fields.find((f) => f.type === 'weekday');
      expect(weekday?.special).toBe('#');
      expect(weekday?.specialValue).toBe(2);
      expect(weekday?.nth).toBe(1);
    }
  });

  it('月份名称被解析（JAN=1）', () => {
    const r = parseExpression('0 0 1 JAN *', 'linux5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const month = r.expr.fields.find((f) => f.type === 'month');
      expect(month?.values).toEqual([1]);
    }
  });
});
