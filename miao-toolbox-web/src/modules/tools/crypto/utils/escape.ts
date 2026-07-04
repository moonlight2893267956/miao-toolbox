/**
 * Escape 编解码工具函数
 *
 * 与 JavaScript 原生 escape()/unescape() 行为一致：
 * - 字母数字和 @*_+-./ 保留原样
 * - ASCII 特殊字符 → %XX
 * - Unicode 非 ASCII 字符 → %uXXXX
 */

export function escapeEncode(input: string): string {
  let result = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    // 保留字符：A-Z a-z 0-9 @ * _ + - . /
    if (
      (ch >= 0x30 && ch <= 0x39) ||
      (ch >= 0x41 && ch <= 0x5a) ||
      (ch >= 0x61 && ch <= 0x7a) ||
      ch === 0x40 || ch === 0x2a || ch === 0x5f ||
      ch === 0x2b || ch === 0x2d || ch === 0x2e || ch === 0x2f
    ) {
      result += input[i];
    } else if (ch < 0x100) {
      // ASCII 特殊字符 → %XX
      result += '%' + ch.toString(16).padStart(2, '0').toUpperCase();
    } else {
      // Unicode → %uXXXX
      result += '%u' + ch.toString(16).padStart(4, '0').toUpperCase();
    }
  }
  return result;
}

export function escapeDecode(input: string): string {
  return decodeURIComponent(
    input.replace(/%u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    ),
  ).replace(/%u([0-9a-fA-F]{4})/g, (_, hex) =>
    // fallback: handle remaining %uXXXX not consumed by decodeURIComponent
    String.fromCharCode(parseInt(hex, 16)),
  );
}
