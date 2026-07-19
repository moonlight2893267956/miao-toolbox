import { describe, expect, it } from 'vitest';
import {
  SAMPLE_EMAIL_HEADERS,
  analyzeEmailHeaders,
  extractAuthResults,
  parseHeaderFields,
} from './emailHeader';
import { SAMPLE_NGINX_LOG, parseLogs } from './logParser';
import { computeLineDiff, tryFormatJson } from './textDiff';

describe('emailHeader', () => {
  it('AC1: 字段分类 + Received 链 + SPF/DKIM/DMARC', () => {
    const a = analyzeEmailHeaders(SAMPLE_EMAIL_HEADERS);
    expect(a.fields.length).toBeGreaterThan(5);
    expect(a.subject).toContain('Test delivery');
    expect(a.received.length).toBeGreaterThanOrEqual(2);
    expect(a.received[0].from || a.received[0].by).toBeTruthy();
    // 两跳均有日期 → 延迟约 30s
    expect(a.received[0].delaySeconds).toBe(30);

    const protocols = a.auth.map((x) => x.protocol);
    expect(protocols).toContain('spf');
    expect(protocols).toContain('dkim');
    expect(protocols).toContain('dmarc');
    expect(a.auth.find((x) => x.protocol === 'spf')?.result).toBe('pass');
  });

  it('折行 Header 展开', () => {
    const fields = parseHeaderFields(
      'Subject: hello\n world\nFrom: a@b.com',
    );
    expect(fields.find((f) => f.name === 'Subject')?.value).toBe('hello world');
  });

  it('空行后正文不再当 Header 解析', () => {
    const fields = parseHeaderFields(
      'From: a@b.com\nSubject: hi\n\nBody-Line: should-not-be-header\nNote: ignore',
    );
    expect(fields.map((f) => f.name)).toEqual(['From', 'Subject']);
    expect(fields.find((f) => f.name === 'Note')).toBeUndefined();
  });

  it('extractAuthResults 从 Authentication-Results', () => {
    const r = extractAuthResults([
      {
        name: 'Authentication-Results',
        value: 'mx; spf=fail; dkim=pass; dmarc=none',
        category: 'auth',
      },
    ]);
    expect(r.map((x) => `${x.protocol}=${x.result}`)).toEqual(
      expect.arrayContaining(['spf=fail', 'dkim=pass', 'dmarc=none']),
    );
  });

  it('Auth 多源同协议去重，优先 Authentication-Results', () => {
    const a = analyzeEmailHeaders(SAMPLE_EMAIL_HEADERS);
    const spf = a.auth.filter((x) => x.protocol === 'spf');
    const dkim = a.auth.filter((x) => x.protocol === 'dkim');
    expect(spf).toHaveLength(1);
    expect(dkim).toHaveLength(1);
    expect(spf[0].result).toBe('pass');
    expect(dkim[0].result).toBe('pass'); // 非 signed 兜底
  });
});

describe('logParser', () => {
  it('AC2: Nginx access log 识别', () => {
    const r = parseLogs(SAMPLE_NGINX_LOG);
    expect(r.detected).toBe('nginx');
    expect(r.matched).toBeGreaterThanOrEqual(4);
    expect(r.lines[0].fields.method).toBe('GET');
    expect(r.lines[0].fields.status).toBe('200');
  });

  it('AC2: 关键词与级别筛选', () => {
    const byKw = parseLogs(SAMPLE_NGINX_LOG, { keyword: 'login' });
    expect(byKw.matched).toBe(1);
    expect(byKw.lines[0].raw).toContain('login');

    const byLvl = parseLogs(SAMPLE_NGINX_LOG, { level: 'error' });
    expect(byLvl.matched).toBe(1);
    expect(byLvl.lines[0].fields.status).toBe('500');
  });

  it('AC2: 自定义正则捕获组', () => {
    const r = parseLogs('user=alice action=login\nuser=bob action=logout', {
      customRegex: 'user=(?<user>\\w+) action=(?<action>\\w+)',
    });
    expect(r.error).toBeUndefined();
    expect(r.customFilter).toBe(true);
    expect(r.matched).toBe(2);
    expect(r.lines[0].fields.user).toBe('alice');
    expect(r.lines[1].fields.action).toBe('logout');
  });

  it('自定义正则作筛选：POST 只留含 POST 的行，并保留 nginx 字段', () => {
    const r = parseLogs(SAMPLE_NGINX_LOG, { customRegex: 'POST' });
    expect(r.matched).toBe(1);
    expect(r.detected).toBe('nginx');
    expect(r.lines[0].fields.method).toBe('POST');
    expect(r.lines[0].fields.path).toBe('/api/login');
  });

  it('^POST$ 不应误匹配整行日志', () => {
    const r = parseLogs(SAMPLE_NGINX_LOG, { customRegex: '^POST$' });
    expect(r.matched).toBe(0);
    expect(r.hint).toBeTruthy();
    // 不应回退展示全部 nginx 行
    expect(r.lines).toHaveLength(0);
  });
});

describe('textDiff', () => {
  it('AC3: JSON 格式化后行级 diff', () => {
    const left = '{"a":1,"b":2}';
    const right = '{"a":1,"b":3,"c":4}';
    const r = computeLineDiff(left, right, { formatJson: true });
    expect(r.jsonFormatted).toBe(true);
    expect(r.added).toBeGreaterThan(0);
    expect(r.removed).toBeGreaterThan(0);
    expect(r.lines.some((l) => l.kind === 'add')).toBe(true);
    expect(r.lines.some((l) => l.kind === 'remove')).toBe(true);
  });

  it('仅一侧合法 JSON 时不格式化、不标 jsonFormatted', () => {
    const r = computeLineDiff('{"a":1}', 'not-json', { formatJson: true });
    expect(r.jsonFormatted).toBe(false);
    expect(r.leftFormatted).toBe('{"a":1}');
    expect(r.rightFormatted).toBe('not-json');
  });

  it('tryFormatJson 非法则原文', () => {
    expect(tryFormatJson('not json').formatted).toBe(false);
  });
});
