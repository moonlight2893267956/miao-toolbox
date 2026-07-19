/**
 * HMAC 签名生成 / 验证（纯前端，crypto-js）
 * 与 FR-41 业务 sign 工作台分离：本模块为任意消息 + 密钥的原语。
 */

import CryptoJS from 'crypto-js';

export type HmacAlgorithm = 'HMAC-SHA256' | 'HMAC-SHA384' | 'HMAC-SHA512';
export type HmacEncoding = 'hex' | 'base64';

export interface HmacResult {
  algorithm: HmacAlgorithm;
  /** 用户当前选择的主编码（用于验签默认） */
  encoding: HmacEncoding;
  /** 主编码下的签名（兼容旧字段） */
  signature: string;
  hex: string;
  base64: string;
  messageLength: number;
  /** hex 字符长度（不含空白） */
  hexLength: number;
  /** 摘要位长：256 / 384 / 512 */
  bitLength: number;
}

function computeWords(message: string, key: string, algo: HmacAlgorithm): CryptoJS.lib.WordArray {
  switch (algo) {
    case 'HMAC-SHA384':
      return CryptoJS.HmacSHA384(message, key);
    case 'HMAC-SHA512':
      return CryptoJS.HmacSHA512(message, key);
    default:
      return CryptoJS.HmacSHA256(message, key);
  }
}

function bitLengthOf(algo: HmacAlgorithm): number {
  switch (algo) {
    case 'HMAC-SHA384':
      return 384;
    case 'HMAC-SHA512':
      return 512;
    default:
      return 256;
  }
}

export function computeHmac(
  message: string,
  key: string,
  algorithm: HmacAlgorithm = 'HMAC-SHA256',
  encoding: HmacEncoding = 'hex',
): HmacResult {
  const words = computeWords(message, key, algorithm);
  const hex = words.toString(CryptoJS.enc.Hex);
  const base64 = CryptoJS.enc.Base64.stringify(words);
  const signature = encoding === 'base64' ? base64 : hex;
  return {
    algorithm,
    encoding,
    signature,
    hex,
    base64,
    messageLength: message.length,
    hexLength: hex.length,
    bitLength: bitLengthOf(algorithm),
  };
}

/** 常量时间比较（规范化后） */
export function verifyHmac(
  message: string,
  key: string,
  expected: string,
  algorithm: HmacAlgorithm = 'HMAC-SHA256',
  encoding: HmacEncoding = 'hex',
): boolean {
  const actual = computeHmac(message, key, algorithm, encoding);
  return compareSignature(actual, expected, encoding);
}

/**
 * 与计算结果比对期望签名。
 * encoding=auto：同时尝试 hex 与 base64 规范化比较。
 */
export function compareSignature(
  result: HmacResult,
  expected: string,
  encoding: HmacEncoding | 'auto' = 'auto',
): boolean {
  const exp = expected.trim();
  if (!exp) return false;

  if (encoding === 'hex' || encoding === 'auto') {
    const a = normalizeSig(result.hex, 'hex');
    const b = normalizeSig(exp, 'hex');
    if (a.length > 0 && a.length === b.length && timingEqual(a, b)) return true;
  }
  if (encoding === 'base64' || encoding === 'auto') {
    const a = normalizeSig(result.base64, 'base64');
    const b = normalizeSig(exp, 'base64');
    if (a.length > 0 && a.length === b.length && timingEqual(a, b)) return true;
  }
  return false;
}

function timingEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function normalizeSig(s: string, encoding: HmacEncoding): string {
  const t = s.trim();
  if (encoding === 'hex') return t.toLowerCase().replace(/[\s:_-]+/g, '');
  return t.replace(/\s+/g, '');
}

/** Hex 分组展示：每 2 字节一组，每 8 组换行感由 CSS 控制 */
export function groupHex(hex: string, groupSize = 2): string {
  const clean = hex.replace(/[\s:_-]/g, '').toLowerCase();
  if (!clean) return '';
  const parts: string[] = [];
  for (let i = 0; i < clean.length; i += groupSize) {
    parts.push(clean.slice(i, i + groupSize));
  }
  return parts.join(' ');
}

export function formatHmacText(r: HmacResult, match?: boolean | null): string {
  const lines = [
    `算法: ${r.algorithm}`,
    `位长: ${r.bitLength}`,
    `消息长度: ${r.messageLength}`,
    `Hex: ${r.hex}`,
    `Base64: ${r.base64}`,
  ];
  if (match === true) lines.push('验签: 匹配 ✓');
  if (match === false) lines.push('验签: 不匹配 ✗');
  if (match == null) lines.push('验签: 未验证');
  return lines.join('\n');
}
