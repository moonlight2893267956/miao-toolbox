/**
 * HTML 实体编解码
 * 编码：常用字符 → 命名/数字实体
 * 解码：命名实体 + 十进制/十六进制数字实体
 */

const ENCODE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const DECODE_NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
};

export function htmlEncode(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => ENCODE_MAP[ch] ?? ch);
}

export function htmlDecode(input: string): string {
  return input.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g,
    (full, body: string) => {
      if (body.startsWith('#x') || body.startsWith('#X')) {
        const code = parseInt(body.slice(2), 16);
        if (Number.isNaN(code)) throw new Error(`非法十六进制实体：${full}`);
        return String.fromCodePoint(code);
      }
      if (body.startsWith('#')) {
        const code = parseInt(body.slice(1), 10);
        if (Number.isNaN(code)) throw new Error(`非法十进制实体：${full}`);
        return String.fromCodePoint(code);
      }
      const named = DECODE_NAMED[body.toLowerCase()];
      if (named !== undefined) return named;
      // 未知命名实体原样保留
      return full;
    },
  );
}
