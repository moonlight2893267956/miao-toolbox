import { describe, expect, it } from 'vitest';
import {
  generateCommand,
  parseCurlCommand,
  defaultCurlState,
  normalizeCurlState,
} from './curlGenerator';
import { parseCidr, splitIPv4Subnets, formatCidrText } from './cidrCalculator';
import { buildJwt, decodeJwt } from './jwtDebugger';
import { compareSignature, computeHmac, groupHex, verifyHmac } from './hmacSigner';
import { generateNginxConfig, defaultNginxState } from './nginxConfig';
import {
  detectSubnetConflicts,
  generateComposeNetwork,
  defaultDockerNetworkForm,
  suggestGateway,
} from './dockerNetwork';

describe('curlGenerator', () => {
  it('POST + JSON body 生成完整 curl', () => {
    const cmd = generateCommand(
      defaultCurlState({
        method: 'POST',
        url: 'https://api.example.com/v1',
        bodyType: 'json',
        body: '{"a":1}',
        headers: [],
      }),
      'curl',
    );
    expect(cmd).toContain('curl');
    expect(cmd).toContain('-X POST');
    expect(cmd).toContain('Content-Type: application/json');
    expect(cmd).toContain(`-d '{"a":1}'`);
    expect(cmd).toContain(`'https://api.example.com/v1'`);
  });

  it('Body=无 时不带 -d', () => {
    const cmd = generateCommand(
      defaultCurlState({
        method: 'POST',
        url: 'https://example.com',
        bodyType: 'none',
        body: '{"ignored":true}',
      }),
      'curl',
    );
    expect(cmd).not.toContain('-d');
    expect(cmd).toContain('-X POST');
  });

  it('Form 模式生成多次 -d 与 urlencoded Content-Type', () => {
    const cmd = generateCommand(
      defaultCurlState({
        method: 'POST',
        url: 'https://example.com/login',
        bodyType: 'form',
        formFields: [
          { key: 'user', value: 'alice' },
          { key: 'pass', value: 'p@ss' },
        ],
      }),
      'curl',
    );
    expect(cmd).toContain('Content-Type: application/x-www-form-urlencoded');
    expect(cmd).toContain(`-d 'user=alice'`);
    expect(cmd).toContain(`-d 'pass=p@ss'`);
  });

  it('Raw 模式使用自定义 Content-Type', () => {
    const cmd = generateCommand(
      defaultCurlState({
        method: 'POST',
        url: 'https://example.com/xml',
        bodyType: 'raw',
        body: '<root/>',
        rawContentType: 'application/xml',
      }),
      'curl',
    );
    expect(cmd).toContain('Content-Type: application/xml');
    expect(cmd).toContain(`-d '<root/>'`);
  });

  it('支持 wget / httpie 格式', () => {
    const state = defaultCurlState({
      method: 'GET',
      url: 'https://example.com',
      bodyType: 'none',
    });
    expect(generateCommand(state, 'wget')).toMatch(/^wget /);
    expect(generateCommand(state, 'httpie')).toMatch(/^http get /i);
  });

  it('反向解析 JSON curl', () => {
    const raw =
      `curl -X POST -H 'Content-Type: application/json' -d '{"x":1}' 'https://api.example.com'`;
    const r = parseCurlCommand(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.method).toBe('POST');
    expect(r.state.url).toBe('https://api.example.com');
    expect(r.state.body).toBe('{"x":1}');
    expect(r.state.bodyType).toBe('json');
    expect(r.state.headers?.some((h) => h.key.toLowerCase() === 'content-type')).toBe(true);
  });

  it('反向解析多次 -d 为 Form', () => {
    const raw = `curl -X POST -d 'a=1' -d 'b=2' 'https://example.com'`;
    const r = parseCurlCommand(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.bodyType).toBe('form');
    expect(r.state.formFields).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
  });

  it('旧 Tab 状态缺字段时 generateCommand 不崩溃', () => {
    // 模拟升级前持久化：无 bodyType / formFields / rawContentType
    const legacy = {
      method: 'POST' as const,
      url: 'https://api.example.com',
      headers: [],
      body: '{"a":1}',
      followRedirects: false,
      insecure: false,
      includeHeaders: false,
      compressed: false,
      userAgent: '',
    };
    const cmd = generateCommand(legacy as never, 'curl');
    expect(cmd).toContain('curl');
    expect(cmd).toContain('-d');
    const n = normalizeCurlState(legacy as never);
    expect(n.bodyType).toBe('json');
    expect(n.rawContentType).toBeTruthy();
    expect(Array.isArray(n.formFields)).toBe(true);
  });
});

describe('cidrCalculator', () => {
  it('10.0.0.0/24 计算正确', () => {
    const r = parseCidr('10.0.0.0/24');
    expect(r.ok).toBe(true);
    if (!r.ok || r.info.version !== 4) return;
    expect(r.info.network).toBe('10.0.0.0');
    expect(r.info.broadcast).toBe('10.0.0.255');
    expect(r.info.netmask).toBe('255.255.255.0');
    expect(r.info.usableHosts).toBe(254);
    expect(r.info.firstHost).toBe('10.0.0.1');
    expect(r.info.lastHost).toBe('10.0.0.254');
    expect(formatCidrText(r.info)).toContain('可用主机: 254');
  });

  it('子网划分 /24 → /26', () => {
    const base = parseCidr('10.0.0.0/24');
    expect(base.ok && base.info.version === 4).toBe(true);
    if (!base.ok || base.info.version !== 4) return;
    const split = splitIPv4Subnets(base.info, 26);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.subnets).toHaveLength(4);
    expect(split.subnets[0].cidr).toBe('10.0.0.0/26');
    expect(split.subnets[3].cidr).toBe('10.0.0.192/26');
  });

  it('IPv6 基础解析', () => {
    const r = parseCidr('2001:db8::/32');
    expect(r.ok).toBe(true);
    if (!r.ok || r.info.version !== 6) return;
    expect(r.info.prefix).toBe(32);
    expect(r.info.network).toContain('2001:db8');
  });
});

describe('jwtDebugger', () => {
  it('构建 HS256 并可解码验签', () => {
    const built = buildJwt({
      payload: { sub: 'user1', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret: 's3cret',
      algorithm: 'HS256',
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const dec = decodeJwt(built.token, 's3cret');
    expect(dec.ok).toBe(true);
    if (!dec.ok) return;
    expect(dec.parts.payload.sub).toBe('user1');
    expect(dec.expired).toBe(false);
    expect(dec.signatureValid).toBe(true);
  });

  it('过期 Token 标红标记', () => {
    const built = buildJwt({
      payload: { exp: 1 },
      secret: 'k',
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const dec = decodeJwt(built.token, 'k', 100);
    expect(dec.ok && dec.expired).toBe(true);
  });
});

describe('hmacSigner', () => {
  it('HMAC-SHA256 hex 与验证', () => {
    const r = computeHmac('message', 'key', 'HMAC-SHA256', 'hex');
    expect(r.signature).toMatch(/^[0-9a-f]+$/);
    expect(r.signature.length).toBe(64);
    expect(r.hex).toBe(r.signature);
    expect(r.base64.length).toBeGreaterThan(10);
    expect(r.bitLength).toBe(256);
    expect(verifyHmac('message', 'key', r.signature, 'HMAC-SHA256', 'hex')).toBe(true);
    expect(verifyHmac('message', 'key', 'deadbeef', 'HMAC-SHA256', 'hex')).toBe(false);
  });

  it('Base64 输出', () => {
    const r = computeHmac('hi', 'k', 'HMAC-SHA256', 'base64');
    expect(r.signature).toBe(r.base64);
    expect(r.signature.length).toBeGreaterThan(10);
    expect(verifyHmac('hi', 'k', r.signature, 'HMAC-SHA256', 'base64')).toBe(true);
  });

  it('compareSignature auto 同时识别 hex/base64', () => {
    const r = computeHmac('message', 'key', 'HMAC-SHA256', 'hex');
    expect(compareSignature(r, r.hex, 'auto')).toBe(true);
    expect(compareSignature(r, r.base64, 'auto')).toBe(true);
    expect(compareSignature(r, groupHex(r.hex), 'auto')).toBe(true);
    expect(compareSignature(r, 'nope', 'auto')).toBe(false);
  });
});

describe('nginxConfig', () => {
  it('反向代理场景生成 proxy_pass', () => {
    const cfg = generateNginxConfig({
      ...defaultNginxState(),
      scenarios: ['reverse_proxy'],
      upstreamUrl: 'http://127.0.0.1:8080',
      locationPath: '/',
    });
    expect(cfg).toContain('location /');
    expect(cfg).toContain('proxy_pass http://127.0.0.1:8080');
    expect(cfg).toContain('proxy_set_header Host $host');
  });

  it('多场景可组合', () => {
    const cfg = generateNginxConfig({
      ...defaultNginxState(),
      scenarios: ['reverse_proxy', 'cors', 'https'],
      serverName: 'app.example.com',
    });
    expect(cfg).toContain('ssl_certificate');
    expect(cfg).toContain('Access-Control-Allow-Origin');
    expect(cfg).toContain('proxy_pass');
  });
});

describe('dockerNetwork', () => {
  it('生成 compose networks 配置', () => {
    const yaml = generateComposeNetwork({
      ...defaultDockerNetworkForm(),
      networkName: 'mynet',
      subnet: '172.20.0.0/16',
      gateway: '172.20.0.1',
    });
    expect(yaml).toContain('networks:');
    expect(yaml).toContain('mynet:');
    expect(yaml).toContain('subnet: 172.20.0.0/16');
    expect(yaml).toContain('gateway: 172.20.0.1');
  });

  it('检测与 Docker 默认 bridge 冲突', () => {
    const hits = detectSubnetConflicts('172.17.0.0/16');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.cidr === '172.17.0.0/16')).toBe(true);
  });

  it('suggestGateway', () => {
    expect(suggestGateway('172.20.0.0/16')).toBe('172.20.0.1');
  });
});
