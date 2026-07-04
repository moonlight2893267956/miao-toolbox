/**
 * 哈希工具函数
 *
 * 使用 crypto-js 计算:
 * - 常规哈希: MD5 / SHA-1 / SHA-224 / SHA-256 / SHA-512
 * - MD5 16位格式: 取中间 16 位
 * - HMAC: HMAC-MD5 / HMAC-SHA256 / HMAC-SHA512 (Base64 输出)
 */

import CryptoJS from 'crypto-js';
import type { HashAlgo, HmacAlgo, Md5Format } from '../types';

export function computeHash(input: string, algo: HashAlgo): string {
  switch (algo) {
    case 'MD5': return CryptoJS.MD5(input).toString();
    case 'SHA1': return CryptoJS.SHA1(input).toString();
    case 'SHA224': return CryptoJS.SHA224(input).toString();
    case 'SHA256': return CryptoJS.SHA256(input).toString();
    case 'SHA512': return CryptoJS.SHA512(input).toString();
    default: return '';
  }
}

export function computeAllHashes(input: string): Record<HashAlgo, string> {
  return {
    MD5: computeHash(input, 'MD5'),
    SHA1: computeHash(input, 'SHA1'),
    SHA224: computeHash(input, 'SHA224'),
    SHA256: computeHash(input, 'SHA256'),
    SHA512: computeHash(input, 'SHA512'),
  };
}

export function computeHmac(input: string, key: string, algo: HmacAlgo): string {
  switch (algo) {
    case 'HMAC-MD5':
      return CryptoJS.HmacMD5(input, key).toString(CryptoJS.enc.Base64);
    case 'HMAC-SHA256':
      return CryptoJS.HmacSHA256(input, key).toString(CryptoJS.enc.Base64);
    case 'HMAC-SHA512':
      return CryptoJS.HmacSHA512(input, key).toString(CryptoJS.enc.Base64);
    default: return '';
  }
}

export function computeAllHmacs(input: string, key: string): Record<HmacAlgo, string> {
  if (!key) return {} as Record<HmacAlgo, string>;
  return {
    'HMAC-MD5': computeHmac(input, key, 'HMAC-MD5'),
    'HMAC-SHA256': computeHmac(input, key, 'HMAC-SHA256'),
    'HMAC-SHA512': computeHmac(input, key, 'HMAC-SHA512'),
  };
}

export function formatMd5(hash32: string, fmt: Md5Format): string {
  switch (fmt) {
    case '32-lower': return hash32;
    case '32-upper': return hash32.toUpperCase();
    case '16-lower': return hash32.slice(8, 24);
    case '16-upper': return hash32.slice(8, 24).toUpperCase();
  }
}
