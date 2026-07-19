import { describe, expect, it } from 'vitest';
import {
  formatCookiesText,
  isSetCookieAttributeSegment,
  parseCookies,
  parseOneCookie,
} from './cookieAnalyzer';

describe('cookieAnalyzer', () => {
  it('AC1: 解析 Set-Cookie 风格属性', () => {
    const raw =
      'session=abc123; Domain=.example.com; Path=/; HttpOnly; Secure; SameSite=Lax';
    const c = parseOneCookie(raw);
    expect(c).not.toBeNull();
    expect(c!.name).toBe('session');
    expect(c!.value).toBe('abc123');
    expect(c!.Domain).toBe('.example.com');
    expect(c!.Path).toBe('/');
    expect(c!.HttpOnly).toBe(true);
    expect(c!.Secure).toBe(true);
    expect(c!.SameSite).toBe('Lax');
  });

  it('支持 Set-Cookie: 前缀', () => {
    const c = parseOneCookie('Set-Cookie: token=xyz; Secure');
    expect(c!.name).toBe('token');
    expect(c!.value).toBe('xyz');
    expect(c!.Secure).toBe(true);
  });

  it('AC2: document.cookie 多对 name=value', () => {
    const list = parseCookies('a=1; b=two; c=3');
    expect(list).toHaveLength(3);
    expect(list.map((x) => x.name)).toEqual(['a', 'b', 'c']);
    expect(list[1].value).toBe('two');
  });

  it('AC2: 多行多条 Cookie（Set-Cookie 风格）', () => {
    const list = parseCookies(
      'session=abc; Domain=.example.com; HttpOnly\nid=42; Path=/app; Secure',
    );
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('session');
    expect(list[0].HttpOnly).toBe(true);
    expect(list[1].name).toBe('id');
    expect(list[1].Secure).toBe(true);
    expect(list[1].Path).toBe('/app');
  });

  it('空输入', () => {
    expect(parseCookies('')).toEqual([]);
    expect(parseCookies('   ')).toEqual([]);
  });

  it('format 含属性名', () => {
    const text = formatCookiesText(
      parseCookies('session=abc123; Domain=.example.com; HttpOnly; Secure; SameSite=Lax'),
    );
    expect(text).toContain('session=abc123');
    expect(text).toContain('Domain: .example.com');
    expect(text).toContain('HttpOnly: true');
    expect(text).toContain('SameSite: Lax');
  });

  it('属性段名必须完全匹配，不因 cookie 名含 domain 误判', () => {
    expect(isSetCookieAttributeSegment('Domain=.example.com')).toBe(true);
    expect(isSetCookieAttributeSegment('HttpOnly')).toBe(true);
    expect(isSetCookieAttributeSegment('bce-login-domain-account=PASSPORT')).toBe(false);
    expect(isSetCookieAttributeSegment('BAIDU_CLOUD_TRACK_PATH=https://x')).toBe(false);
  });

  it('百度 document.cookie 长串应拆成多条，而非 1 条', () => {
    const raw =
      "Hm_lvt_88f108329b252492ea28d8e2e52bc85a=1782140090; " +
      "Hm_lpvt_88f108329b252492ea28d8e2e52bc85a=1784431131; " +
      "BAIDUID=2B49BEEFC6CBC946BB4BDB36C31AD4B3:FG=1; " +
      "MCITY=-%3A; " +
      "PSTM=1771767944; " +
      "BIDUPSID=C260388FAE7D183DCDE54217FEAB1C5D; " +
      "bce-login-domain-account=PASSPORT%3A5211097868; " +
      "bce-ctl-client-cookies=\"BDUSS,BDUSS_BFESS,bce-passport-stoken\"; " +
      "RT=\"z=1&dm=baidu.com&si=be58dce4\"";
    const list = parseCookies(raw);
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list[0].name).toBe('Hm_lvt_88f108329b252492ea28d8e2e52bc85a');
    expect(list[0].value).toBe('1782140090');
    expect(list.map((c) => c.name)).toContain('BAIDUID');
    expect(list.map((c) => c.name)).toContain('bce-login-domain-account');
    expect(list.find((c) => c.name === 'BAIDUID')?.value).toBe(
      '2B49BEEFC6CBC946BB4BDB36C31AD4B3:FG=1',
    );
    // 值里含 = 的 RT
    expect(list.find((c) => c.name === 'RT')?.value).toContain('dm=baidu.com');
  });

  it('整段外层引号应剥离', () => {
    const list = parseCookies("'a=1; b=2'");
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('a');
  });

  it('单条 Set-Cookie 仍正确（不被 document.cookie 拆开）', () => {
    const list = parseCookies(
      'session=abc123; Domain=.example.com; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
    expect(list).toHaveLength(1);
    expect(list[0].Domain).toBe('.example.com');
    expect(list[0].HttpOnly).toBe(true);
  });
});
