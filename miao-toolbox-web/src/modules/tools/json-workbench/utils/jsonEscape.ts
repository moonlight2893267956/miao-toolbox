/**
 * JSON 压缩转义 / 反转义工具。
 *
 * 压缩转义输出的是一个 JSON string literal：
 *   { "name": "test" } -> "{\"name\":\"test\"}"
 */

export interface JsonEscapeSuccess {
  value: string;
}

export interface JsonEscapeFailure {
  error: string;
}

export type JsonEscapeResult = JsonEscapeSuccess | JsonEscapeFailure;

export interface EscapedJsonInspection {
  isEscaped: boolean;
  value?: string;
}

const UNRECOGNIZED_ESCAPED_JSON = '无法识别为转义 JSON';

export function compressAndEscapeJson(value: unknown): string {
  const compactJson = JSON.stringify(value);
  return JSON.stringify(compactJson);
}

export function unescapeJsonString(raw: string, indentSize: 2 | 4 = 2): JsonEscapeResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw.trim());
  } catch {
    return { error: UNRECOGNIZED_ESCAPED_JSON };
  }

  if (typeof decoded !== 'string') {
    return { error: UNRECOGNIZED_ESCAPED_JSON };
  }

  try {
    const parsedJson = JSON.parse(decoded);
    return { value: JSON.stringify(parsedJson, null, indentSize) };
  } catch {
    return { error: UNRECOGNIZED_ESCAPED_JSON };
  }
}

export function inspectEscapedJsonString(raw: string, indentSize: 2 | 4 = 2): EscapedJsonInspection {
  const result = unescapeJsonString(raw, indentSize);
  if ('error' in result) {
    return { isEscaped: false };
  }
  return {
    isEscaped: true,
    value: result.value,
  };
}
