/** URL 编解码（参数值模式 encodeURIComponent） */

export function urlEncode(input: string): string {
  return encodeURIComponent(input);
}

export function urlDecode(input: string): string {
  try {
    return decodeURIComponent(input.replace(/\+/g, '%20'));
  } catch {
    // 定位非法 % 序列
    const m = input.match(/%(?![0-9A-Fa-f]{2})|%[0-9A-Fa-f](?![0-9A-Fa-f])/);
    if (m && m.index !== undefined) {
      throw new Error(`URL 解码失败：非法百分号编码位于第 ${m.index + 1} 位`);
    }
    throw new Error('URL 解码失败：输入包含非法百分号编码');
  }
}
