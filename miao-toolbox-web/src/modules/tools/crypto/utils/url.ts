/**
 * URL 编解码工具函数。
 *
 * 封装浏览器原生 API，提供两种编码模式：
 * - `component`：encodeURIComponent，编码全部保留字符（适合参数值）
 * - `full`：encodeURI，保留 URL 结构字符 `://?=&`（适合完整 URL）
 *
 * 解码统一使用 decodeURIComponent，非法编码时抛出错误。
 */

export type UrlEncodeType = 'component' | 'full';

/** URL 编码：参数值模式（encodeURIComponent） */
export function urlEncodeComponent(input: string): string {
  return encodeURIComponent(input);
}

/** URL 编码：完整 URL 模式（encodeURI），保留 `://?=&` 等结构字符 */
export function urlEncodeFull(input: string): string {
  return encodeURI(input);
}

/** 按类型编码 */
export function urlEncode(input: string, type: UrlEncodeType): string {
  return type === 'component' ? urlEncodeComponent(input) : urlEncodeFull(input);
}

/**
 * URL 解码：将百分号编码字符串还原为原始文本。
 * 输入非法编码（如 `%ZZ`）时抛出 URIError。
 */
export function urlDecode(input: string): string {
  return decodeURIComponent(input);
}
