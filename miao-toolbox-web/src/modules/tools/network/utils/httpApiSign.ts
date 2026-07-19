/**
 * HTTP API 业务签名计算器（纯前端）
 * 参数排序 → 待签串 → MD5/SHA256/HMAC 签名
 * 与 FR-34 HMAC 原语分离：本模块面向开放平台 sign 流程。
 */

import CryptoJS from 'crypto-js';

export type SignParam = { key: string; value: string };

export type SignPresetId =
  | 'open-platform-md5'
  | 'open-platform-sha256'
  | 'hmac-param-string';

export type HashAlgo = 'MD5' | 'SHA256' | 'HMAC-SHA256';
export type SignEncoding = 'hex-lower' | 'hex-upper' | 'base64';
/** 密钥如何参与：尾部 &key= / 直接拼接 / 仅作 HMAC key */
export type KeyMode = 'ampersand-key' | 'suffix' | 'hmac-only';

export interface SignPreset {
  id: SignPresetId;
  name: string;
  description: string;
  algo: HashAlgo;
  keyMode: KeyMode;
  encoding: SignEncoding;
  excludeFields: string[];
  includeEmpty: boolean;
}

export interface SignOptions {
  presetId: SignPresetId;
  secret: string;
  /** 覆盖预设 */
  algo?: HashAlgo;
  keyMode?: KeyMode;
  encoding?: SignEncoding;
  excludeFields?: string[];
  includeEmpty?: boolean;
  /** key 参数名（ampersand-key 时，默认 key） */
  keyParamName?: string;
}

export interface SignComputeResult {
  presetId: SignPresetId;
  algo: HashAlgo;
  encoding: SignEncoding;
  keyMode: KeyMode;
  /** 参与签名的参数（已过滤） */
  usedParams: SignParam[];
  /** 排序后的 k=v& 串（不含密钥段） */
  sortedParamString: string;
  /** 完整待签串（可能含密钥） */
  stringToSign: string;
  /** 签名结果 */
  sign: string;
  /** HMAC 时的消息（通常等于 sortedParamString） */
  hmacMessage?: string;
}

export const SIGN_PRESETS: SignPreset[] = [
  {
    id: 'open-platform-md5',
    name: '开放平台-MD5',
    description: '去 sign → 字典序 k=v& → &key=SECRET → MD5 小写',
    algo: 'MD5',
    keyMode: 'ampersand-key',
    encoding: 'hex-lower',
    excludeFields: ['sign'],
    includeEmpty: false,
  },
  {
    id: 'open-platform-sha256',
    name: '开放平台-SHA256',
    description: '去 sign → 字典序 k=v& → &key=SECRET → SHA-256 小写',
    algo: 'SHA256',
    keyMode: 'ampersand-key',
    encoding: 'hex-lower',
    excludeFields: ['sign'],
    includeEmpty: false,
  },
  {
    id: 'hmac-param-string',
    name: 'HMAC-参数串',
    description: '去 sign → 字典序 k=v& 为消息，密钥作 HMAC-SHA256 key',
    algo: 'HMAC-SHA256',
    keyMode: 'hmac-only',
    encoding: 'hex-lower',
    excludeFields: ['sign'],
    includeEmpty: false,
  },
];

export function getPreset(id: SignPresetId): SignPreset {
  return SIGN_PRESETS.find((p) => p.id === id) ?? SIGN_PRESETS[0];
}

function resolveOptions(opts: SignOptions): Required<
  Pick<
    SignOptions,
    'algo' | 'keyMode' | 'encoding' | 'excludeFields' | 'includeEmpty' | 'keyParamName'
  >
> & { secret: string; presetId: SignPresetId } {
  const preset = getPreset(opts.presetId);
  return {
    presetId: opts.presetId,
    secret: opts.secret ?? '',
    algo: opts.algo ?? preset.algo,
    keyMode: opts.keyMode ?? preset.keyMode,
    encoding: opts.encoding ?? preset.encoding,
    excludeFields: (opts.excludeFields ?? preset.excludeFields).map((s) =>
      s.trim().toLowerCase(),
    ),
    includeEmpty: opts.includeEmpty ?? preset.includeEmpty,
    keyParamName: opts.keyParamName?.trim() || 'key',
  };
}

/** 过滤 + 字典序排序 */
export function prepareParams(
  params: SignParam[],
  excludeFields: string[],
  includeEmpty: boolean,
): SignParam[] {
  const excl = new Set(excludeFields.map((s) => s.toLowerCase()));
  const cleaned = params
    .map((p) => ({ key: p.key.trim(), value: p.value ?? '' }))
    .filter((p) => p.key.length > 0)
    .filter((p) => !excl.has(p.key.toLowerCase()))
    .filter((p) => includeEmpty || p.value !== '');

  // 同 key 保留后者
  const map = new Map<string, string>();
  for (const p of cleaned) {
    map.set(p.key, p.value);
  }
  return Array.from(map.entries())
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** 拼 k=v&k2=v2（不做 URL encode，符合多数开放平台文档） */
export function joinSortedParams(params: SignParam[]): string {
  return params.map((p) => `${p.key}=${p.value}`).join('&');
}

export function buildStringToSign(
  sortedParamString: string,
  secret: string,
  keyMode: KeyMode,
  keyParamName: string,
): { stringToSign: string; hmacMessage?: string } {
  if (keyMode === 'hmac-only') {
    return { stringToSign: sortedParamString, hmacMessage: sortedParamString };
  }
  if (keyMode === 'suffix') {
    return { stringToSign: sortedParamString + secret };
  }
  // ampersand-key
  const sep = sortedParamString ? '&' : '';
  return {
    stringToSign: `${sortedParamString}${sep}${keyParamName}=${secret}`,
  };
}

function encodeDigest(
  words: CryptoJS.lib.WordArray,
  encoding: SignEncoding,
): string {
  if (encoding === 'base64') return CryptoJS.enc.Base64.stringify(words);
  const hex = words.toString(CryptoJS.enc.Hex);
  return encoding === 'hex-upper' ? hex.toUpperCase() : hex.toLowerCase();
}

export function hashString(
  data: string,
  algo: HashAlgo,
  secret: string,
  encoding: SignEncoding,
): string {
  let words: CryptoJS.lib.WordArray;
  switch (algo) {
    case 'MD5':
      words = CryptoJS.MD5(data);
      break;
    case 'SHA256':
      words = CryptoJS.SHA256(data);
      break;
    case 'HMAC-SHA256':
      words = CryptoJS.HmacSHA256(data, secret);
      break;
    default:
      words = CryptoJS.MD5(data);
  }
  return encodeDigest(words, encoding);
}

export function computeApiSign(
  params: SignParam[],
  options: SignOptions,
): SignComputeResult {
  const o = resolveOptions(options);
  const usedParams = prepareParams(params, o.excludeFields, o.includeEmpty);
  const sortedParamString = joinSortedParams(usedParams);
  const { stringToSign, hmacMessage } = buildStringToSign(
    sortedParamString,
    o.secret,
    o.keyMode,
    o.keyParamName,
  );

  const signInput = o.algo === 'HMAC-SHA256' ? (hmacMessage ?? sortedParamString) : stringToSign;
  const sign = hashString(signInput, o.algo, o.secret, o.encoding);

  return {
    presetId: o.presetId,
    algo: o.algo,
    encoding: o.encoding,
    keyMode: o.keyMode,
    usedParams,
    sortedParamString,
    stringToSign,
    sign,
    hmacMessage,
  };
}

/** 规范化后比较签名 */
export function verifyApiSign(
  computed: string,
  expected: string,
  encoding: SignEncoding,
): boolean {
  const a = normalizeSign(computed, encoding);
  const b = normalizeSign(expected, encoding);
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function normalizeSign(s: string, encoding: SignEncoding): string {
  const t = s.trim();
  if (encoding === 'base64') return t.replace(/\s+/g, '');
  return t.toLowerCase().replace(/[\s:_-]+/g, '');
}

/**
 * 从 URL 或 query 字符串导入参数
 * 支持：完整 URL、?a=1&b=2、a=1&b=2、JSON 对象字符串
 */
export function importParamsFromText(raw: string): {
  ok: true;
  params: SignParam[];
  source: 'url' | 'query' | 'json';
} | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: '请粘贴 URL 或参数串' };

  // JSON object
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return { ok: false, error: 'JSON 须为对象' };
      }
      const params = Object.entries(obj).map(([key, value]) => ({
        key,
        value: value == null ? '' : String(value),
      }));
      return { ok: true, params, source: 'json' };
    } catch {
      return { ok: false, error: 'JSON 解析失败' };
    }
  }

  let query = text;
  try {
    if (/^https?:\/\//i.test(text) || text.startsWith('//')) {
      const u = new URL(text.startsWith('//') ? `https:${text}` : text);
      query = u.search.startsWith('?') ? u.search.slice(1) : u.search;
      if (!query && text.includes('?')) {
        query = text.split('?')[1]?.split('#')[0] ?? '';
      }
    } else if (text.includes('?') && !text.includes('=')) {
      // unlikely
    } else if (text.startsWith('?')) {
      query = text.slice(1);
    }
  } catch {
    // treat whole as query
    query = text.includes('?') ? (text.split('?')[1]?.split('#')[0] ?? text) : text;
  }

  // strip fragment
  query = query.split('#')[0];

  if (!query.includes('=') && !query.includes('&')) {
    return { ok: false, error: '未识别到 key=value 参数' };
  }

  const params: SignParam[] = [];
  for (const part of query.split('&')) {
    if (!part) continue;
    const idx = part.indexOf('=');
    if (idx < 0) {
      params.push({ key: decodeSafe(part), value: '' });
    } else {
      params.push({
        key: decodeSafe(part.slice(0, idx)),
        value: decodeSafe(part.slice(idx + 1)),
      });
    }
  }
  if (params.length === 0) return { ok: false, error: '未解析到参数' };
  return {
    ok: true,
    params,
    source: /^https?:\/\//i.test(text) || text.includes('://') ? 'url' : 'query',
  };
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

export function formatSignResultText(r: SignComputeResult, match?: boolean | null): string {
  const lines = [
    `预设: ${r.presetId}`,
    `算法: ${r.algo}`,
    `编码: ${r.encoding}`,
    `参与参数: ${r.usedParams.map((p) => `${p.key}=${p.value}`).join(', ') || '（无）'}`,
    `参数串: ${r.sortedParamString}`,
    `待签串: ${r.stringToSign}`,
    `sign: ${r.sign}`,
  ];
  if (match === true) lines.push('验签: 匹配 ✓');
  if (match === false) lines.push('验签: 不匹配 ✗');
  return lines.join('\n');
}

/** 默认示例参数（对应 AC1） */
export function defaultDemoParams(): SignParam[] {
  return [
    { key: 'b', value: '2' },
    { key: 'a', value: '1' },
    { key: 'c', value: '3' },
  ];
}
