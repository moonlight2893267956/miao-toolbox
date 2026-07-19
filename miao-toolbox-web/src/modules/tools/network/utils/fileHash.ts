/**
 * 文件 / 字节哈希（MD5 / SHA-1 / SHA-256 / SHA-512）
 * 使用 crypto-js（Web Crypto 无 MD5）
 */

import CryptoJS from 'crypto-js';

export type FileHashAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512';

export const FILE_HASH_ALGOS: FileHashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'];

export type FileHashResult = Record<FileHashAlgo, string>;

/** ArrayBuffer → CryptoJS WordArray */
export function arrayBufferToWordArray(buffer: ArrayBuffer): CryptoJS.lib.WordArray {
  const u8 = new Uint8Array(buffer);
  const words: number[] = [];
  for (let i = 0; i < u8.length; i += 4) {
    words.push(
      ((u8[i] ?? 0) << 24) |
        ((u8[i + 1] ?? 0) << 16) |
        ((u8[i + 2] ?? 0) << 8) |
        (u8[i + 3] ?? 0),
    );
  }
  return CryptoJS.lib.WordArray.create(words, u8.length);
}

export function hashWordArray(wa: CryptoJS.lib.WordArray): FileHashResult {
  return {
    MD5: CryptoJS.MD5(wa).toString(CryptoJS.enc.Hex),
    'SHA-1': CryptoJS.SHA1(wa).toString(CryptoJS.enc.Hex),
    'SHA-256': CryptoJS.SHA256(wa).toString(CryptoJS.enc.Hex),
    'SHA-512': CryptoJS.SHA512(wa).toString(CryptoJS.enc.Hex),
  };
}

export function hashArrayBuffer(buffer: ArrayBuffer): FileHashResult {
  return hashWordArray(arrayBufferToWordArray(buffer));
}

/** 便于单元测试：UTF-8 字符串哈希 */
export function hashUtf8String(text: string): FileHashResult {
  const wa = CryptoJS.enc.Utf8.parse(text);
  return hashWordArray(wa);
}

export async function hashFile(file: File | Blob): Promise<FileHashResult> {
  const buffer = await file.arrayBuffer();
  return hashArrayBuffer(buffer);
}

/** 规范化：去空白、小写 */
export function normalizeHash(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

export type HashCompareMatch = {
  expected: string;
  matched: FileHashAlgo[];
  /** 有输入且至少命中一个算法 */
  anyMatch: boolean;
  /** 有非空预期但无命中 */
  mismatch: boolean;
};

/**
 * 将预期哈希与结果比对（忽略大小写与空白）。
 * 可同时匹配多种算法（不同长度通常唯一）。
 */
export function compareHash(
  results: FileHashResult | null | undefined,
  expectedRaw: string,
): HashCompareMatch {
  const expected = normalizeHash(expectedRaw);
  if (!expected || !results) {
    return { expected, matched: [], anyMatch: false, mismatch: false };
  }
  const matched = FILE_HASH_ALGOS.filter((algo) => normalizeHash(results[algo]) === expected);
  return {
    expected,
    matched,
    anyMatch: matched.length > 0,
    mismatch: matched.length === 0,
  };
}

export function formatFileHashText(
  results: FileHashResult,
  meta?: { name?: string; size?: number },
): string {
  const lines: string[] = [];
  if (meta?.name) lines.push(`文件: ${meta.name}`);
  if (typeof meta?.size === 'number') lines.push(`大小: ${meta.size} 字节`);
  if (lines.length) lines.push('');
  for (const algo of FILE_HASH_ALGOS) {
    lines.push(`${algo}: ${results[algo]}`);
  }
  return lines.join('\n');
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
