import { describe, it, expect } from 'vitest';
import { FIELD_CONFIGS, FIELD_CONFIGS as C } from './fieldOptions';
import type { FieldType } from './types';

describe('FIELD_CONFIGS', () => {
  const all: FieldType[] = ['second', 'minute', 'hour', 'day', 'month', 'weekday'];

  it('覆盖全部 6 类字段', () => {
    all.forEach((t) => expect(C[t]).toBeDefined());
  });

  it('每个字段都有快捷选项与多选值集', () => {
    all.forEach((t) => {
      expect(C[t].quickOptions.length).toBeGreaterThan(0);
      expect(C[t].multiValues.length).toBeGreaterThan(0);
    });
  });

  it('分钟快捷选项含 AC1 的「每隔5分钟(*/5)」', () => {
    const opt = C.minute.quickOptions.find((o) => o.value === '*/5');
    expect(opt?.label).toContain('*/5');
  });

  it('小时多选值集为 0-23', () => {
    expect(C.hour.multiValues).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('日字段允许 L/LW 快捷选项', () => {
    const day = C.day.quickOptions;
    expect(day.some((o) => o.value === 'L')).toBe(true);
    expect(day.some((o) => o.value === 'LW')).toBe(true);
  });

  it('月份值标签为「N月」', () => {
    expect(C.month.valueLabel?.(1)).toBe('1月');
    expect(C.month.valueLabel?.(12)).toBe('12月');
  });

  it('星期值标签为「周X」', () => {
    expect(C.weekday.valueLabel?.(0)).toBe('周日');
    expect(C.weekday.valueLabel?.(5)).toBe('周五');
  });
});

describe('fieldOptions 引用稳定性', () => {
  it('FIELD_CONFIGS 为单例引用', () => {
    expect(FIELD_CONFIGS).toBe(C);
  });
});
