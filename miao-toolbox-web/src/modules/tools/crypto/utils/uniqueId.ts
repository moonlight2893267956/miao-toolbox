/**
 * 唯一标识符生成工具
 *
 * - UUID v4: 基于 crypto.getRandomValues
 * - UUID v7: 时间排序
 * - nanoid: 使用 nanoid 库，支持自定义字母表
 */

import { nanoid, customAlphabet } from 'nanoid';
import type { UuidVersion, UuidFormat, NanoidAlphabet } from '../types';

const ALPHABETS: Record<NanoidAlphabet, string> = {
  default: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
};

/** 生成 UUID v4（RFC 4122） */
export function generateUuidV4(format: UuidFormat = 'with-hyphen'): string {
  let uuid: string;
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    uuid = crypto.randomUUID();
  } else {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return format === 'no-hyphen' ? uuid.replace(/-/g, '') : uuid;
}

/** 生成 UUID v7（时间排序） */
export function generateUuidV7(format: UuidFormat = 'with-hyphen'): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const now = Date.now();
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Math.floor(now / 4294967296));
  view.setUint16(4, (now % 4294967296) & 0xffff);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return format === 'no-hyphen' ? uuid.replace(/-/g, '') : uuid;
}

/** 生成 nanoid */
export function generateNanoid(length: number = 21, alphabet: NanoidAlphabet = 'default'): string {
  if (alphabet === 'default') return nanoid(length);
  return customAlphabet(ALPHABETS[alphabet], length)();
}

/** 按类型生成唯一标识符 */
export function generateId(
  version: UuidVersion,
  nanoidLength: number = 21,
  uuidFormat: UuidFormat = 'with-hyphen',
  nanoidAlphabet: NanoidAlphabet = 'default',
): { id: string; type: string } {
  switch (version) {
    case 'v4':
      return { id: generateUuidV4(uuidFormat), type: uuidFormat === 'with-hyphen' ? 'UUID v4' : 'UUID v4 (无连字符)' };
    case 'v7':
      return { id: generateUuidV7(uuidFormat), type: uuidFormat === 'with-hyphen' ? 'UUID v7' : 'UUID v7 (无连字符)' };
    case 'nanoid':
      return { id: generateNanoid(nanoidLength, nanoidAlphabet), type: `nanoid(${nanoidLength})` };
    default:
      return { id: generateUuidV4(uuidFormat), type: 'UUID v4' };
  }
}

/** 批量生成 */
export function generateIds(
  version: UuidVersion,
  count: number,
  nanoidLength: number = 21,
  uuidFormat: UuidFormat = 'with-hyphen',
  nanoidAlphabet: NanoidAlphabet = 'default',
): Array<{ id: string; type: string }> {
  return Array.from({ length: count }, () => generateId(version, nanoidLength, uuidFormat, nanoidAlphabet));
}
