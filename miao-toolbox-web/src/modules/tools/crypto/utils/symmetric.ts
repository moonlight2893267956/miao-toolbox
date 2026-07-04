/**
 * 对称加解密工具函数
 *
 * 使用 crypto-js 实现 AES / DES / TripleDES 加解密。
 * 支持 CBC/ECB/CFB/OFB/CTR 模式（AES）和 CBC/ECB 模式（DES/3DES）。
 * 支持密钥格式：Utf8 / Base64 / Hex。
 * ECB 模式无需 IV；CBC/CFB/OFB/CTR 必须提供 IV。
 * 解密时自动识别 Base64 或 Hex 格式密文。
 */

import CryptoJS from 'crypto-js';
import type { SymmetricAlgo, SymmetricMode, KeyFormat } from '../types';

const AES_MODES: Record<SymmetricMode, any> = {
  CBC: CryptoJS.mode.CBC,
  ECB: CryptoJS.mode.ECB,
  CFB: CryptoJS.mode.CFB,
  OFB: CryptoJS.mode.OFB,
  CTR: CryptoJS.mode.CTR,
};

const DES_MODES: Record<'CBC' | 'ECB', any> = {
  CBC: CryptoJS.mode.CBC,
  ECB: CryptoJS.mode.ECB,
};

/** 根据算法和输入长度返回目标密钥长度（AES 根据输入长度选择 128/192/256） */
function getTargetKeyLength(algorithm: SymmetricAlgo, inputBytes: number): number {
  if (algorithm === 'AES') {
    if (inputBytes <= 16) return 16;
    if (inputBytes <= 24) return 24;
    return 32;
  }
  if (algorithm === 'DES') return 8;
  return 24; // TripleDES
}

/** 根据算法返回目标 IV 长度 */
function getTargetIvLength(algorithm: SymmetricAlgo): number {
  return algorithm === 'AES' ? 16 : 8;
}

/** 将 WordArray 补零或截断到目标字节长度 */
function padToLength(wordArray: CryptoJS.lib.WordArray, targetBytes: number): CryptoJS.lib.WordArray {
  if (wordArray.sigBytes === targetBytes) return wordArray;
  const hex = wordArray.toString(CryptoJS.enc.Hex);
  const bytes: string[] = hex.match(/.{2}/g) || [];
  if (bytes.length >= targetBytes) {
    return CryptoJS.enc.Hex.parse(bytes.slice(0, targetBytes).join(''));
  }
  const padCount = targetBytes - bytes.length;
  const zeros: string[] = new Array(padCount).fill('00');
  return CryptoJS.enc.Hex.parse(bytes.concat(zeros).join(''));
}

/** 根据密钥格式解析为 WordArray，并补齐到合法长度 */
function parseKey(key: string, format: KeyFormat, algorithm: SymmetricAlgo): CryptoJS.lib.WordArray {
  if (!key) throw new Error('请输入密钥');
  let parsed: CryptoJS.lib.WordArray;
  switch (format) {
    case 'Base64':
      parsed = CryptoJS.enc.Base64.parse(key);
      break;
    case 'Hex':
      parsed = CryptoJS.enc.Hex.parse(key);
      break;
    case 'Utf8':
    default:
      parsed = CryptoJS.enc.Utf8.parse(key);
  }
  if (parsed.sigBytes === 0) throw new Error('密钥格式无效');
  return padToLength(parsed, getTargetKeyLength(algorithm, parsed.sigBytes));
}

/** 解析 IV（Hex 优先，否则 Utf8），并补齐到合法长度 */
function parseIv(iv: string, algorithm: SymmetricAlgo): CryptoJS.lib.WordArray | undefined {
  if (!iv) return undefined;
  let parsed: CryptoJS.lib.WordArray;
  if (/^[0-9A-Fa-f]+$/.test(iv)) {
    parsed = CryptoJS.enc.Hex.parse(iv);
  } else {
    parsed = CryptoJS.enc.Utf8.parse(iv);
  }
  if (parsed.sigBytes === 0) throw new Error('IV 格式无效');
  return padToLength(parsed, getTargetIvLength(algorithm));
}

/** 获取当前算法支持的 mode 对象 */
function getMode(algo: SymmetricAlgo, mode: SymmetricMode) {
  if (algo === 'AES') {
    return AES_MODES[mode];
  }
  if (mode !== 'CBC' && mode !== 'ECB') {
    throw new Error(`${algo} 仅支持 CBC 和 ECB 模式`);
  }
  return DES_MODES[mode];
}

/** 判断字符串是否为 Base64 格式 */
function isBase64(value: string): boolean {
  if (!value) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length % 4 === 0 && value.length > 0;
}

/** 判断字符串是否为 Hex 格式 */
function isHex(value: string): boolean {
  return /^[0-9A-Fa-f]+$/.test(value) && value.length % 2 === 0 && value.length > 0;
}

/**
 * 对称加密。
 * 输出统一为 Base64 字符串。
 */
export function symmetricEncrypt(
  input: string,
  key: string,
  algorithm: SymmetricAlgo,
  symmetricMode: SymmetricMode,
  keyFormat: KeyFormat,
  iv?: string,
): string {
  if (!key) throw new Error('请输入密钥');
  if (symmetricMode !== 'ECB' && !iv) throw new Error(`${symmetricMode} 模式需要输入 IV`);

  const keyBytes = parseKey(key, keyFormat, algorithm);
  const cfg: Record<string, unknown> = {
    mode: getMode(algorithm, symmetricMode),
    padding: CryptoJS.pad.Pkcs7,
  };
  if (iv) {
    cfg.iv = parseIv(iv, algorithm);
  }

  switch (algorithm) {
    case 'AES':
      return CryptoJS.AES.encrypt(input, keyBytes, cfg).toString();
    case 'DES':
      return CryptoJS.DES.encrypt(input, keyBytes, cfg).toString();
    case 'TripleDES':
      return CryptoJS.TripleDES.encrypt(input, keyBytes, cfg).toString();
    default:
      throw new Error(`不支持的算法: ${algorithm}`);
  }
}

/**
 * 对称解密。
 * 自动识别 Base64 或 Hex 格式密文。
 */
export function symmetricDecrypt(
  ciphertext: string,
  key: string,
  algorithm: SymmetricAlgo,
  symmetricMode: SymmetricMode,
  keyFormat: KeyFormat,
  iv?: string,
): string {
  if (!key) throw new Error('请输入密钥');
  if (symmetricMode !== 'ECB' && !iv) throw new Error(`${symmetricMode} 模式需要输入 IV`);
  if (!ciphertext) throw new Error('请输入密文');

  const keyBytes = parseKey(key, keyFormat, algorithm);
  const cfg: Record<string, unknown> = {
    mode: getMode(algorithm, symmetricMode),
    padding: CryptoJS.pad.Pkcs7,
  };
  if (iv) {
    cfg.iv = parseIv(iv, algorithm);
  }

  const parsed: CryptoJS.lib.CipherParams | string = isBase64(ciphertext)
    ? ciphertext
    : isHex(ciphertext)
    ? CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Hex.parse(ciphertext) }) as CryptoJS.lib.CipherParams
    : (() => { throw new Error('密文格式无法识别，请提供 Base64 或 Hex 格式'); })();

  let decrypted: CryptoJS.lib.WordArray;
  switch (algorithm) {
    case 'AES':
      decrypted = CryptoJS.AES.decrypt(parsed, keyBytes, cfg);
      break;
    case 'DES':
      decrypted = CryptoJS.DES.decrypt(parsed, keyBytes, cfg);
      break;
    case 'TripleDES':
      decrypted = CryptoJS.TripleDES.decrypt(parsed, keyBytes, cfg);
      break;
    default:
      throw new Error(`不支持的算法: ${algorithm}`);
  }

  const result = decrypted.toString(CryptoJS.enc.Utf8);
  if (!result) throw new Error('解密失败：密钥不匹配或密文格式错误');
  return result;
}

/** 根据算法返回可用的模式列表 */
export function getSupportedModes(algo: SymmetricAlgo): SymmetricMode[] {
  if (algo === 'AES') return ['CBC', 'ECB', 'CFB', 'OFB', 'CTR'];
  return ['CBC', 'ECB'];
}
