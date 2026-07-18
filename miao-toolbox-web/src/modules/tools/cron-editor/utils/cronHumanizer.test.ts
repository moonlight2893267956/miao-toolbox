import { describe, it, expect } from 'vitest';
import { humanizeCron } from './cronHumanizer';
import type { CronDialect } from '../types';

describe('humanizeCron', () => {
  it('AC1: */5 9 * * 1-5 → 工作日 9点 每隔5分钟执行', () => {
    expect(humanizeCron('*/5 9 * * 1-5', 'linux5' as CronDialect)).toBe('工作日 9点 每隔5分钟执行');
  });

  it('AC2: 0 0 31 2 * → 每年2月31日零点执行', () => {
    expect(humanizeCron('0 0 31 2 *', 'linux5' as CronDialect)).toBe('每年2月31日零点执行');
  });

  it('每分钟：* * * * *', () => {
    expect(humanizeCron('* * * * *', 'linux5' as CronDialect)).toBe('每分钟执行');
  });

  it('每小时整点：0 * * * *', () => {
    expect(humanizeCron('0 * * * *', 'linux5' as CronDialect)).toBe('每小时执行');
  });

  it('每月1日零点：0 0 1 * *', () => {
    expect(humanizeCron('0 0 1 * *', 'linux5' as CronDialect)).toBe('每月1日零点执行');
  });

  it('每天零点：0 0 * * *', () => {
    expect(humanizeCron('0 0 * * *', 'linux5' as CronDialect)).toBe('每天零点执行');
  });

  it('周末：0 0 * * 0,6', () => {
    expect(humanizeCron('0 0 * * 0,6', 'linux5' as CronDialect)).toBe('周末零点执行');
  });

  it('6 位含秒：0 0 9 * * 1-5（秒被吸收，与 5 位一致）', () => {
    expect(humanizeCron('0 0 9 * * 1-5', 'spring6' as CronDialect)).toBe('工作日9点执行');
  });

  it('每周一零点：0 0 * * 1', () => {
    expect(humanizeCron('0 0 * * 1', 'linux5' as CronDialect)).toBe('每周一零点执行');
  });

  it('非法表达式返回空串', () => {
    expect(humanizeCron('*/5 25 * * 1-5', 'linux5' as CronDialect)).toBe('');
  });
});
