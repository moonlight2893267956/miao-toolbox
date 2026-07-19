import { describe, it, expect } from 'vitest';
import { analyzeIp, formatIpResultText } from './ipFormat';
import {
  convertTimestamp,
  formatTimestampText,
  timestampToDate,
  buildFormats,
  parseDateString,
  partsToDate,
} from './timestampConvert';
import { searchHttpStatus, formatHttpStatusText } from './httpStatus';
import { lookupMime, formatMimeText } from './mimeTypes';

describe('IP 格式 (AC)', () => {
  it('192.168.1.0/24 显示范围与掩码', () => {
    const r = analyzeIp('192.168.1.0/24');
    expect(r.error).toBeUndefined();
    expect(r.cidr?.network).toBe('192.168.1.0');
    expect(r.cidr?.broadcast).toBe('192.168.1.255');
    expect(r.cidr?.mask).toBe('255.255.255.0');
    expect(r.cidr?.hostCount).toBe(254);
    expect(r.binary).toContain('11000000');
    const text = formatIpResultText(r);
    expect(text).toContain('网络地址');
  });
});

describe('时间戳', () => {
  it('1721318400 秒 → UTC 2024-07-18 16:00:00，北京时间次日 00:00', () => {
    const date = timestampToDate('1721318400', 's');
    const f = buildFormats(date);
    expect(f.utc).toBe('2024-07-18 16:00:00');
    expect(f.beijing).toBe('2024-07-19 00:00:00');
    expect(f.unixSeconds).toBe(1721318400);
  });

  it('北京时间字符串 → 时间戳', () => {
    const date = parseDateString('2024-07-19 00:00:00', 8);
    expect(Math.floor(date.getTime() / 1000)).toBe(1721318400);
  });

  it('年月日组件 → 时间戳', () => {
    const date = partsToDate(
      { year: 2024, month: 7, day: 19, hour: 0, minute: 0, second: 0 },
      8,
    );
    expect(Math.floor(date.getTime() / 1000)).toBe(1721318400);
  });

  it('兼容 convertTimestamp', () => {
    const r = convertTimestamp('1721318400', 8);
    expect(r.error).toBeUndefined();
    expect(r.utc).toContain('2024-07-18 16:00:00');
    expect(formatTimestampText(r)).toContain('UTC');
  });
});

describe('HTTP 状态码 (AC)', () => {
  it('429 Too Many Requests', () => {
    const items = searchHttpStatus('429');
    expect(items.some((i) => i.code === 429)).toBe(true);
    const hit = items.find((i) => i.code === 429)!;
    expect(hit.phrase).toBe('Too Many Requests');
    expect(hit.zh).toContain('请求过多');
    const text = formatHttpStatusText([hit]);
    expect(text).toMatch(/限流|Retry-After|请求过多/);
  });

  it('模糊搜索 限流', () => {
    const items = searchHttpStatus('限流');
    expect(items.some((i) => i.code === 429)).toBe(true);
  });
});

describe('MIME (AC)', () => {
  it('.json → application/json', () => {
    const items = lookupMime('.json');
    expect(items.some((e) => e.mime === 'application/json')).toBe(true);
    expect(formatMimeText(items)).toContain('application/json');
  });

  it('反向 application/json', () => {
    const items = lookupMime('application/json');
    expect(items.some((e) => e.ext === '.json')).toBe(true);
  });

  it('类型前缀 image 能命中 image/*', () => {
    const items = lookupMime('image');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((e) => e.mime.startsWith('image/'))).toBe(true);
    expect(items.some((e) => e.ext === '.png')).toBe(true);
  });

  it('无点号 json 仍可当扩展名命中', () => {
    const items = lookupMime('json');
    expect(items.some((e) => e.mime === 'application/json')).toBe(true);
  });
});
