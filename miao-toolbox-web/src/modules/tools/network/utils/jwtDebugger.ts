/**
 * JWT 解码 / HS256 构建（纯前端，crypto-js）
 */

import CryptoJS from 'crypto-js';

export interface JwtParts {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  headerRaw: string;
  payloadRaw: string;
  algorithm: string;
}

export type DecodeJwtResult =
  | {
      ok: true;
      parts: JwtParts;
      expired: boolean;
      expiresAt: number | null;
      notBefore: number | null;
      issuedAt: number | null;
      signatureValid: boolean | null;
    }
  | { ok: false; error: string };

function b64urlEncode(words: CryptoJS.lib.WordArray): string {
  return CryptoJS.enc.Base64.stringify(words)
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlEncodeUtf8(str: string): string {
  return b64urlEncode(CryptoJS.enc.Utf8.parse(str));
}

function b64urlDecodeToUtf8(s: string): string | null {
  try {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const words = CryptoJS.enc.Base64.parse(b64);
    return CryptoJS.enc.Utf8.stringify(words);
  } catch {
    return null;
  }
}

function parseJsonObject(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function numClaim(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return Number(v);
  return null;
}

/** 解码 JWT；若提供 secret 则尝试验签（仅 HS*） */
export function decodeJwt(token: string, secret?: string, nowSec = Math.floor(Date.now() / 1000)): DecodeJwtResult {
  const raw = token.trim();
  if (!raw) return { ok: false, error: '请粘贴 JWT' };
  const parts = raw.split('.');
  if (parts.length !== 3) return { ok: false, error: 'JWT 须为 header.payload.signature 三段' };

  const [hB64, pB64, sig] = parts;
  const hStr = b64urlDecodeToUtf8(hB64);
  const pStr = b64urlDecodeToUtf8(pB64);
  if (hStr === null || pStr === null) return { ok: false, error: 'Base64URL 解码失败' };

  const header = parseJsonObject(hStr);
  const payload = parseJsonObject(pStr);
  if (!header) return { ok: false, error: 'Header 不是合法 JSON 对象' };
  if (!payload) return { ok: false, error: 'Payload 不是合法 JSON 对象' };

  const algorithm = String(header.alg ?? 'unknown');
  const exp = numClaim(payload, 'exp');
  const nbf = numClaim(payload, 'nbf');
  const iat = numClaim(payload, 'iat');
  const expired = exp !== null ? nowSec >= exp : false;

  let signatureValid: boolean | null = null;
  if (secret !== undefined && secret !== '') {
    if (algorithm === 'HS256' || algorithm === 'HS384' || algorithm === 'HS512') {
      const expected = signHs(`${hB64}.${pB64}`, secret, algorithm);
      signatureValid = timingSafeEqual(expected, sig);
    } else {
      signatureValid = null; // 非 HMAC 算法本工具不验签
    }
  }

  return {
    ok: true,
    parts: {
      header,
      payload,
      signature: sig,
      headerRaw: hStr,
      payloadRaw: pStr,
      algorithm,
    },
    expired,
    expiresAt: exp,
    notBefore: nbf,
    issuedAt: iat,
    signatureValid,
  };
}

function signHs(data: string, secret: string, alg: string): string {
  let words: CryptoJS.lib.WordArray;
  if (alg === 'HS384') {
    words = CryptoJS.HmacSHA384(data, secret);
  } else if (alg === 'HS512') {
    words = CryptoJS.HmacSHA512(data, secret);
  } else {
    words = CryptoJS.HmacSHA256(data, secret);
  }
  return b64urlEncode(words);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface BuildJwtInput {
  header?: Record<string, unknown>;
  payload: Record<string, unknown>;
  secret: string;
  algorithm?: 'HS256' | 'HS384' | 'HS512';
}

/** 构建 HS256（默认）JWT */
export function buildJwt(input: BuildJwtInput): { ok: true; token: string } | { ok: false; error: string } {
  if (!input.secret) return { ok: false, error: '请输入 Secret' };
  const alg = input.algorithm ?? 'HS256';
  const header = {
    alg,
    typ: 'JWT',
    ...input.header,
  };
  // 强制 alg 一致
  header.alg = alg;
  try {
    const hB64 = b64urlEncodeUtf8(JSON.stringify(header));
    const pB64 = b64urlEncodeUtf8(JSON.stringify(input.payload));
    const sig = signHs(`${hB64}.${pB64}`, input.secret, alg);
    return { ok: true, token: `${hB64}.${pB64}.${sig}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '构建失败' };
  }
}

export function formatJwtText(result: Extract<DecodeJwtResult, { ok: true }>): string {
  const status = result.expired
    ? '已过期'
    : result.expiresAt != null
      ? '未过期'
      : '无 exp';
  const lines = [
    `算法: ${result.parts.algorithm}`,
    `状态: ${status}`,
    result.expiresAt != null
      ? `exp: ${result.expiresAt} (${new Date(result.expiresAt * 1000).toISOString()})`
      : 'exp: —',
    result.issuedAt != null
      ? `iat: ${result.issuedAt} (${new Date(result.issuedAt * 1000).toISOString()})`
      : null,
    result.notBefore != null
      ? `nbf: ${result.notBefore} (${new Date(result.notBefore * 1000).toISOString()})`
      : null,
    result.signatureValid === true
      ? '签名: 有效 ✓'
      : result.signatureValid === false
        ? '签名: 无效 ✗'
        : '签名: 未验证',
    '',
    '--- Header ---',
    JSON.stringify(result.parts.header, null, 2),
    '',
    '--- Payload ---',
    JSON.stringify(result.parts.payload, null, 2),
  ];
  return lines.filter((x) => x !== null).join('\n');
}
