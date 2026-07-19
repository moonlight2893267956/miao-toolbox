import { describe, expect, it } from 'vitest';
import CryptoJS from 'crypto-js';
import {
  computeApiSign,
  defaultDemoParams,
  importParamsFromText,
  prepareParams,
  verifyApiSign,
} from './httpApiSign';

describe('httpApiSign', () => {
  it('AC1 开放平台-MD5：字典序 + &key= + MD5 小写', () => {
    const r = computeApiSign(defaultDemoParams(), {
      presetId: 'open-platform-md5',
      secret: 'SECRET',
    });
    expect(r.sortedParamString).toBe('a=1&b=2&c=3');
    expect(r.stringToSign).toBe('a=1&b=2&c=3&key=SECRET');
    const expected = CryptoJS.MD5('a=1&b=2&c=3&key=SECRET').toString(CryptoJS.enc.Hex);
    expect(r.sign).toBe(expected);
    expect(r.sign).toMatch(/^[0-9a-f]{32}$/);
  });

  it('AC2 排除 sign 字段', () => {
    const r = computeApiSign(
      [
        { key: 'a', value: '1' },
        { key: 'sign', value: 'deadbeef' },
        { key: 'b', value: '2' },
      ],
      { presetId: 'open-platform-md5', secret: 'S' },
    );
    expect(r.usedParams.map((p) => p.key)).toEqual(['a', 'b']);
    expect(r.stringToSign).toBe('a=1&b=2&key=S');
  });

  it('AC2 自定义排除字段', () => {
    const r = computeApiSign(
      [
        { key: 'a', value: '1' },
        { key: 'nonce', value: 'n' },
      ],
      {
        presetId: 'open-platform-md5',
        secret: 'S',
        excludeFields: ['sign', 'nonce'],
      },
    );
    expect(r.usedParams.map((p) => p.key)).toEqual(['a']);
  });

  it('AC3 HMAC-参数串 Hex', () => {
    const r = computeApiSign(defaultDemoParams(), {
      presetId: 'hmac-param-string',
      secret: 'SECRET',
      encoding: 'hex-lower',
    });
    expect(r.sortedParamString).toBe('a=1&b=2&c=3');
    expect(r.stringToSign).toBe('a=1&b=2&c=3');
    const expected = CryptoJS.HmacSHA256('a=1&b=2&c=3', 'SECRET').toString(
      CryptoJS.enc.Hex,
    );
    expect(r.sign).toBe(expected);
  });

  it('AC3 HMAC Base64', () => {
    const r = computeApiSign([{ key: 'x', value: '1' }], {
      presetId: 'hmac-param-string',
      secret: 'k',
      encoding: 'base64',
    });
    const expected = CryptoJS.HmacSHA256('x=1', 'k').toString(CryptoJS.enc.Base64);
    expect(r.sign).toBe(expected);
  });

  it('开放平台-SHA256', () => {
    const r = computeApiSign([{ key: 'a', value: '1' }], {
      presetId: 'open-platform-sha256',
      secret: 'S',
    });
    expect(r.stringToSign).toBe('a=1&key=S');
    expect(r.sign).toBe(CryptoJS.SHA256('a=1&key=S').toString(CryptoJS.enc.Hex));
  });

  it('AC4 导入 URL query', () => {
    const r = importParamsFromText(
      'https://api.example.com/pay?amount=100&appId=demo&timestamp=1',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe('url');
    expect(r.params).toEqual([
      { key: 'amount', value: '100' },
      { key: 'appId', value: 'demo' },
      { key: 'timestamp', value: '1' },
    ]);
  });

  it('AC4 导入 k=v 串', () => {
    const r = importParamsFromText('amount=100&appId=demo');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.params).toHaveLength(2);
  });

  it('AC5 验签', () => {
    const r = computeApiSign(defaultDemoParams(), {
      presetId: 'open-platform-md5',
      secret: 'SECRET',
    });
    expect(verifyApiSign(r.sign, r.sign, 'hex-lower')).toBe(true);
    expect(verifyApiSign(r.sign, r.sign.toUpperCase(), 'hex-lower')).toBe(true);
    expect(verifyApiSign(r.sign, '00', 'hex-lower')).toBe(false);
  });

  it('includeEmpty=false 跳过空值', () => {
    const p = prepareParams(
      [
        { key: 'a', value: '1' },
        { key: 'b', value: '' },
      ],
      ['sign'],
      false,
    );
    expect(p.map((x) => x.key)).toEqual(['a']);
  });
});
