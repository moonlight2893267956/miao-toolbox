/**
 * Base64 编解码工具函数
 *
 * - encode: 字符串 → Base64（支持 Unicode）
 * - decode: Base64 → 字符串，非文本内容自动转 Hex
 * - urlSafe: 使用 URL 安全字符集
 */

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function isPrintableText(input: string): boolean {
  // 检查是否全是可打印字符或常见控制字符（\n \r \t）
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c < 0x20 && c !== 0x0a && c !== 0x0d && c !== 0x09) return false;
    if (c === 0xfffd) return false; // replacement character
  }
  return true;
}

export interface Base64DecodeResult {
  text: string;
  isBinary: boolean;
  hex?: string;
}

export function base64Encode(input: string, urlSafe: boolean = false): string {
  const utf8 = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < utf8.length; i++) {
    binary += String.fromCharCode(utf8[i]);
  }
  let result = btoa(binary);
  if (urlSafe) {
    result = result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return result;
}

export function base64Decode(input: string, urlSafe: boolean = false): Base64DecodeResult {
  let str = input.trim();
  if (!str) throw new Error('输入为空');

  if (urlSafe) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = str.length % 4;
    if (pad === 2) str += '==';
    else if (pad === 3) str += '=';
  }

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) {
    throw new Error('不是有效的 Base64 编码');
  }

  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

  if (isPrintableText(text)) {
    return { text, isBinary: false };
  }

  return { text, isBinary: true, hex: bytesToHex(bytes) };
}
