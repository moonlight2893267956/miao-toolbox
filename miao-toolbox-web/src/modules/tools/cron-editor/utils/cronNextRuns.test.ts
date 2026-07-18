import { describe, it, expect } from 'vitest';
import { nextRuns } from './cronNextRuns';
import type { CronDialect } from '../types';

const TZ = 'Asia/Shanghai';

// 2026-07-17 08:00:00 Asia/Shanghai（该日为周五）
const FROM = new Date('2026-07-17T00:00:00Z');

describe('nextRuns', () => {
  it('AC3: 0 9 * * 1-5 在 2026-07-17 08:00 起，第一次为 09:00 同一天', () => {
    const runs = nextRuns('0 9 * * 1-5', 'linux5' as CronDialect, TZ, 10, FROM);
    expect(runs.length).toBe(10);
    expect(runs[0].toISOString()).toBe('2026-07-17T01:00:00.000Z'); // 09:00 Shanghai
  });

  it('AC3: 连续 10 次均为工作日 09:00', () => {
    const runs = nextRuns('0 9 * * 1-5', 'linux5' as CronDialect, TZ, 10, FROM);
    for (const r of runs) {
      const wt = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        hour12: false,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).formatToParts(r);
      const get = (t: string) => wt.find((p) => p.type === t)?.value;
      expect(get('hour')).toBe('09');
      expect(get('minute')).toBe('00');
      const wd = get('weekday');
      expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).toContain(wd);
    }
  });

  it('AC4: 0 0 31 2 * 未来 1 年内无执行时间', () => {
    const runs = nextRuns('0 0 31 2 *', 'linux5' as CronDialect, TZ, 10, FROM);
    expect(runs.length).toBe(0);
  });

  it('每天零点：返回 10 个 00:00', () => {
    const runs = nextRuns('0 0 * * *', 'linux5' as CronDialect, TZ, 10, FROM);
    expect(runs.length).toBe(10);
    for (const r of runs) {
      const hour = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, hour: '2-digit' }).format(r);
      expect(hour).toBe('00');
    }
  });

  it('AC5: 时区切换改变绝对时刻（同 09:00 本地，Shanghai 比 New_York 早）', () => {
    const shanghai = nextRuns('0 9 * * 1-5', 'linux5' as CronDialect, 'Asia/Shanghai', 1, FROM)[0];
    const ny = nextRuns('0 9 * * 1-5', 'linux5' as CronDialect, 'America/New_York', 1, FROM)[0];
    expect(shanghai.toISOString()).not.toBe(ny.toISOString());
    // 纽约 09:00 = 上海 21:00（同日或次日），UTC 偏移差 12h
    const diffHours = Math.abs(shanghai.getTime() - ny.getTime()) / 3600000;
    expect(diffHours).toBe(12);
  });

  it('6 位含秒：0 0 9 * * 1-5 首次仍为当日 09:00:00', () => {
    const runs = nextRuns('0 0 9 * * 1-5', 'spring6' as CronDialect, TZ, 1, FROM);
    expect(runs[0].toISOString()).toBe('2026-07-17T01:00:00.000Z');
  });

  it('非法表达式返回空数组', () => {
    expect(nextRuns('bad expr', 'linux5' as CronDialect, TZ, 10, FROM)).toEqual([]);
  });

  it('回归：5 位从整点 00:00:00 出发，后续 10 次仍是 00:00 整点（不出现秒数递增）', () => {
    // 旧 bug：从 00:00:00 +1s 触发后秒字段未参与匹配，导致连续返回 00:00:00、00:00:01、...
    // 注：nextRuns 内部 cur = from + 1s（严格晚于），所以首项是次日 00:00 而非当日 00:00
    const fromMidnight = new Date('2026-07-19T16:00:00.000Z'); // Shanghai 2026-07-20 00:00:00
    const runs = nextRuns('0 0 * * *', 'linux5' as CronDialect, TZ, 10, fromMidnight);
    expect(runs.length).toBe(10);
    for (const r of runs) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).formatToParts(r);
      const get = (t: string) => parts.find((p) => p.type === t)?.value;
      expect(get('hour')).toBe('00');
      expect(get('minute')).toBe('00');
      expect(get('second')).toBe('00');
    }
  });

  it('回归：5 位 0 0 * * 1-4 每天 0 点，10 个结果均为周一~周四 00:00', () => {
    // 旧 bug：从整点出发秒字段未参与匹配，导致秒数递增 + 跳过同日后续匹配
    const fromMidnight = new Date('2026-07-19T16:00:00.000Z'); // Shanghai 2026-07-20 00:00:00
    const runs = nextRuns('0 0 * * 1-4', 'linux5' as CronDialect, TZ, 10, fromMidnight);
    expect(runs.length).toBe(10);
    for (const r of runs) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
      }).formatToParts(r);
      const get = (t: string) => parts.find((p) => p.type === t)?.value;
      expect(get('hour')).toBe('00');
      expect(get('minute')).toBe('00');
      expect(get('second')).toBe('00');
      expect(['Mon', 'Tue', 'Wed', 'Thu']).toContain(get('weekday'));
    }
  });

  it('回归：6 位步长分钟（0 0/15 * * * *）匹配时刻分钟在 0/15/30/45 上', () => {
    // 旧 bug：分钟按 +1 进位，遇到 */15 步长时可能错过下一个合法值
    const fromMidnight = new Date('2026-07-19T16:00:00.000Z'); // Shanghai 2026-07-20 00:00:00
    const runs = nextRuns('0 0/15 * * * *', 'spring6' as CronDialect, TZ, 6, fromMidnight);
    expect(runs.length).toBe(6);
    const minutes = runs.map((r) => {
      const m = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, minute: '2-digit' })
        .formatToParts(r)
        .find((p) => p.type === 'minute')?.value;
      return m;
    });
    expect(minutes).toEqual(['15', '30', '45', '0', '15', '30']);
  });
});
