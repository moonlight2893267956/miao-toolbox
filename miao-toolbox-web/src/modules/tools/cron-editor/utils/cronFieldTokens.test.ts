import { describe, it, expect } from 'vitest';
import { getFieldTokens } from './cronFieldTokens';
import { expandFieldValues } from './cronParser';
import { FIELD_DEFS } from '../types';

describe('getFieldTokens（构建器字段派生）', () => {
  it('AC1：空表达式 -> 5 位全 *', () => {
    expect(getFieldTokens('', 'linux5')).toEqual(['*', '*', '*', '*', '*']);
  });

  it('合法 5 位表达式原样返回 token', () => {
    expect(getFieldTokens('*/5 9 * * 1-5', 'linux5')).toEqual(['*/5', '9', '*', '*', '1-5']);
  });

  it('合法 6 位表达式原样返回 token', () => {
    expect(getFieldTokens('0 */5 9 * * 1-5', 'spring6')).toEqual(['0', '*/5', '9', '*', '*', '1-5']);
  });

  it('字段数不符 -> 回退全 *', () => {
    expect(getFieldTokens('* * *', 'linux5')).toEqual(['*', '*', '*', '*', '*']);
  });

  it('非法字段（如分钟 L）仍返回原始 token 供编辑', () => {
    expect(getFieldTokens('L 9 * * 1-5', 'linux5')).toEqual(['L', '9', '*', '*', '1-5']);
  });
});

describe('expandFieldValues（多选模式派生勾选项）', () => {
  it('* 展开为全量范围', () => {
    const r = expandFieldValues('*', FIELD_DEFS.hour);
    expect(r.special).toBe('*');
    expect(r.values).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('单值展开', () => {
    expect(expandFieldValues('9', FIELD_DEFS.hour).values).toEqual([9]);
  });

  it('列表展开', () => {
    expect(expandFieldValues('9,18', FIELD_DEFS.hour).values).toEqual([9, 18]);
  });

  it('范围展开', () => {
    expect(expandFieldValues('9-18', FIELD_DEFS.hour).values).toEqual(
      Array.from({ length: 10 }, (_, i) => 9 + i),
    );
  });

  it('AC4：日字段 L 为合法特殊字符', () => {
    const r = expandFieldValues('L', FIELD_DEFS.day);
    expect(r.special).toBe('L');
    expect(r.error).toBeUndefined();
  });

  it('AC5：分钟字段 L 非法，返回错误', () => {
    const r = expandFieldValues('L', FIELD_DEFS.minute);
    expect(r.error).toContain('特殊字符 L 不适用于分钟字段');
  });
});
