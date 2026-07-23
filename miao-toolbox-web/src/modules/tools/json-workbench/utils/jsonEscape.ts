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
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: UNRECOGNIZED_ESCAPED_JSON };
  }

  // 尝试 1：整体本身就是一个合法的 JSON 字符串字面量，
  // 例如从代码/接口拿到的 "\"{\\\"name\\\":\\\"x\\\"}\""（外层带双引号）。
  let decoded: unknown;
  try {
    decoded = JSON.parse(trimmed);
  } catch {
    decoded = undefined;
  }

  let inner: string | undefined;
  if (typeof decoded === 'string') {
    inner = decoded;
  } else if (decoded === undefined) {
    // 尝试 2：整体并非字符串字面量，可能是一段「裸」的转义 JSON
    // （例如从控制台/日志复制的 {\"name\":\"x\"}，缺少外层双引号）。
    // 将其作为 JSON 字符串的内容包一层引号后再反转义。
    inner = unwrapBareEscapedJson(trimmed);
  }

  if (inner === undefined) {
    return { error: UNRECOGNIZED_ESCAPED_JSON };
  }

  // 内部内容必须是合法 JSON 才视为转义 JSON，否则按原样拒绝。
  try {
    const parsedJson = JSON.parse(inner);
    return { value: JSON.stringify(parsedJson, null, indentSize) };
  } catch {
    return { error: UNRECOGNIZED_ESCAPED_JSON };
  }
}

/**
 * 把一段「裸」转义 JSON（如 {\"name\":\"x\"}，外层无双引号）当作 JSON 字符串内容反转义。
 * 成功返回反转义后的字符串，失败返回 undefined。
 */
function unwrapBareEscapedJson(body: string): string | undefined {
  try {
    return JSON.parse(`"${body}"`);
  } catch {
    return undefined;
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
