import { describe, it, expect } from 'vitest';
import { CRON_PRESETS, presetToExpression, matchPreset, type CronPreset } from './presets';
import type { CronDialect } from './types';

describe('CRON_PRESETS', () => {
  it('AC1: 至少包含 6 个预设模板', () => {
    expect(CRON_PRESETS.length).toBeGreaterThanOrEqual(6);
  });

  it('每个模板为合法 5 位表达式且字段数=5', () => {
    for (const p of CRON_PRESETS) {
      const parts = p.expr5.trim().split(/\s+/);
      expect(parts.length).toBe(5);
    }
  });

  it('包含 FR-7 要求的 6 个关键模板', () => {
    const labels = CRON_PRESETS.map((p) => p.label);
    for (const need of ['每分钟', '每小时', '每天零点', '工作日9点', '每周一零点', '每月1号零点']) {
      expect(labels).toContain(need);
    }
  });
});

describe('presetToExpression', () => {
  const workday9 = CRON_PRESETS.find((p) => p.key === 'workday-9am') as CronPreset;

  it('linux5：直接用 5 位基准', () => {
    expect(presetToExpression(workday9, 'linux5' as CronDialect)).toBe('0 9 * * 1-5');
  });

  it('AC4: spring6：自动前补秒字段 0', () => {
    expect(presetToExpression(workday9, 'spring6' as CronDialect)).toBe('0 0 9 * * 1-5');
  });

  it('AC4: spring6 下"每天零点" → 0 0 0 * * *', () => {
    const daily = CRON_PRESETS.find((p) => p.key === 'daily-midnight') as CronPreset;
    expect(presetToExpression(daily, 'spring6' as CronDialect)).toBe('0 0 0 * * *');
  });
});

describe('matchPreset', () => {
  const workday9 = CRON_PRESETS.find((p) => p.key === 'workday-9am') as CronPreset;

  it('AC2: linux5 表达式 0 9 * * 1-5 匹配"工作日9点"', () => {
    expect(matchPreset('0 9 * * 1-5', 'linux5' as CronDialect, workday9)).toBe(true);
  });

  it('空表达式不匹配任何模板', () => {
    expect(matchPreset('', 'linux5' as CronDialect, workday9)).toBe(false);
  });

  it('spring6 表达式 0 0 9 * * 1-5（前补秒）仍匹配"工作日9点"', () => {
    expect(matchPreset('0 0 9 * * 1-5', 'spring6' as CronDialect, workday9)).toBe(true);
  });

  it('不相关的表达式不匹配', () => {
    expect(matchPreset('0 10 * * 1-5', 'linux5' as CronDialect, workday9)).toBe(false);
  });
});
