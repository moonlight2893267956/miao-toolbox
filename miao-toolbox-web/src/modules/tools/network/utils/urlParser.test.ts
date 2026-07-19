import { describe, expect, it } from 'vitest';
import {
  buildUrl,
  parseUrl,
  reassembleFromParts,
  paramsToSearch,
} from './urlParser';

describe('urlParser', () => {
  it('AC1: 解析 protocol/host/port/path/query/hash', () => {
    const r = parseUrl('https://example.com:8080/api?q=hello&lang=zh#section');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parts.protocol).toBe('https');
    expect(r.parts.hostname).toBe('example.com');
    expect(r.parts.port).toBe('8080');
    expect(r.parts.pathname).toBe('/api');
    expect(r.parts.search).toBe('?q=hello&lang=zh');
    expect(r.parts.hash).toBe('section');
    expect(r.parts.params).toEqual([
      { key: 'q', value: 'hello' },
      { key: 'lang', value: 'zh' },
    ]);
  });

  it('无协议时补 https', () => {
    const r = parseUrl('example.com/path');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parts.protocol).toBe('https');
    expect(r.parts.hostname).toBe('example.com');
    expect(r.parts.pathname).toBe('/path');
  });

  it('空与非法', () => {
    expect(parseUrl('').ok).toBe(false);
    expect(parseUrl('   ').ok).toBe(false);
    expect(parseUrl('://').ok).toBe(false);
  });

  it('AC2: 修改 params 后 reassemble', () => {
    const r = parseUrl('https://example.com:8080/api?q=hello&lang=zh#section');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const next = {
      ...r.parts,
      params: [
        { key: 'q', value: 'world' },
        { key: 'lang', value: 'en' },
        { key: 'page', value: '1' },
      ],
    };
    const href = reassembleFromParts(next);
    expect(href).toContain('q=world');
    expect(href).toContain('lang=en');
    expect(href).toContain('page=1');
    expect(href).toContain('#section');
    expect(href.startsWith('https://example.com:8080/api?')).toBe(true);
  });

  it('删除参数后重组', () => {
    const href = buildUrl({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/api',
      params: [{ key: 'only', value: '1' }],
    });
    expect(href).toBe('https://example.com/api?only=1');
    expect(paramsToSearch([])).toBe('');
  });

  it('重复 key', () => {
    const r = parseUrl('https://ex.com/?a=1&a=2');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parts.params.filter((p) => p.key === 'a')).toHaveLength(2);
  });
});
