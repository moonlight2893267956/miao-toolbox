/** 文本 ↔ Hex（UTF-8 字节） */

export function hexEncode(input: string, separator = ''): string {
  const bytes = new TextEncoder().encode(input);
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    parts.push(bytes[i]!.toString(16).padStart(2, '0'));
  }
  return parts.join(separator);
}

export function hexDecode(input: string): string {
  let hex = input.trim().replace(/[\s:_,-]/g, '');
  if (!hex) throw new Error('输入为空');
  if (hex.startsWith('0x') || hex.startsWith('0X')) hex = hex.slice(2);
  if (hex.length % 2 !== 0) {
    throw new Error(`Hex 长度无效（${hex.length}），应为偶数，可能在末尾被截断`);
  }
  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    const idx = hex.search(/[^0-9a-fA-F]/);
    throw new Error(
      `非法 Hex 字符「${hex[idx]}」位于第 ${idx + 1} 位`,
    );
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
