/**
 * Base64 编解码（UTF-8 安全）
 */

export function base64Encode(input: string, urlSafe = false): string {
  const utf8 = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < utf8.length; i++) {
    binary += String.fromCharCode(utf8[i]!);
  }
  let result = btoa(binary);
  if (urlSafe) {
    result = result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return result;
}

export class Base64DecodeError extends Error {
  readonly position?: number;

  constructor(message: string, position?: number) {
    super(message);
    this.name = 'Base64DecodeError';
    this.position = position;
  }
}

/**
 * 查找首个非法 Base64 字符位置（0-based，相对 trim 后字符串）
 */
export function findInvalidBase64CharIndex(str: string, urlSafe: boolean): number | null {
  const alphabet = urlSafe
    ? /^[A-Za-z0-9\-_]$/
    : /^[A-Za-z0-9+/]$/;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;
    if (ch === '=') {
      // padding only allowed at end
      if (i < str.length - 2) return i;
      continue;
    }
    if (!alphabet.test(ch)) return i;
  }
  return null;
}

export function base64Decode(input: string, urlSafe = false): string {
  let str = input.trim();
  if (!str) {
    throw new Base64DecodeError('输入为空');
  }

  // 去掉空白
  str = str.replace(/\s+/g, '');

  if (urlSafe) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
  }

  const badIdx = findInvalidBase64CharIndex(str, false);
  if (badIdx !== null) {
    throw new Base64DecodeError(
      `非法 Base64 字符「${str[badIdx]}」位于第 ${badIdx + 1} 位`,
      badIdx,
    );
  }

  // 截断：长度不是 4 的倍数且补齐后仍可能失败
  const remainder = str.length % 4;
  if (remainder === 1) {
    // 模 4 余 1 的 Base64 永远非法
    throw new Base64DecodeError(
      `Base64 长度无效（${str.length} 字符，模 4 余 1），可能在第 ${str.length} 位附近被截断`,
      Math.max(0, str.length - 1),
    );
  }
  if (remainder === 2) str += '==';
  else if (remainder === 3) str += '=';

  let binary: string;
  try {
    binary = atob(str);
  } catch {
    throw new Base64DecodeError(
      `Base64 解码失败，字符串可能被截断或不完整（长度 ${str.replace(/=+$/, '').length}）`,
      Math.max(0, str.replace(/=+$/, '').length - 1),
    );
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
