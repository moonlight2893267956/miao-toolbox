/**
 * JSONPath → 原文位置定位
 *
 * 缺陷背景：点击树节点后，左侧原文编辑器要跳到该节点对应的行。旧实现是
 * `rawJson.indexOf(`"${key}"`)` 取「第一次出现」，而数组元素共用同一批 key
 * （`bank_uniq_code`、`bank_name` …），于是点第 2 个元素里的字段会跳到第 1 个
 * 元素的同名字段上。
 *
 * 这里改成「按 JSONPath 逐段下降到原文里对应的键/数组元素」：
 * - 对象成员命中时返回「键」所在的偏移（键与值通常同一行，键更符合直觉）；
 * - 数组元素命中时返回该元素起始偏移；
 * - 「…N more items」占位节点（路径以 `.__ellipsis__` 结尾）回退到父数组；
 * - 文本不是合法 JSON、路径不存在、层级过深时返回 null，由调用方决定回退策略。
 */

/** 树里大数组折叠占位节点的路径后缀 */
const ELLIPSIS_KEY = '__ellipsis__';

/** 路径段的最大深度保护（避免病态深嵌套输入把调用栈打爆） */
const MAX_LOCATE_DEPTH = 512;

export interface JsonTextLocation {
  /** 目标位置在原文中的字符偏移 */
  offset: number;
  /** 1 起始的行号（与 CodeMirror 的 doc.line(n) 一致） */
  line: number;
  /** 1 起始的列号 */
  column: number;
}

type PathSegment = { kind: 'key'; key: string } | { kind: 'index'; index: number };

/**
 * 解析 `$.a[0]["b.c"]` 形式的 JSONPath（与 parseAndFlatten 的 id 规则一致）。
 * 无法解析时返回 null。
 */
export function parseJsonPathSegments(jsonPath: string): PathSegment[] | null {
  if (typeof jsonPath !== 'string' || jsonPath[0] !== '$') return null;

  const segments: PathSegment[] = [];
  let i = 1;

  while (i < jsonPath.length) {
    const ch = jsonPath[i];

    if (ch === '.') {
      i += 1;
      // 树里的 id 形如 `$.["a.b"]`：parseAndFlatten 用 `${path}.${safeKey(key)}` 拼接，
      // 特殊键会变成「点号 + 方括号」两段。这里遇到点号后紧跟 `[` 时不能要求非空 key，
      // 直接交给下面的方括号分支解析（否则这类键会静默无法定位）。
      if (jsonPath[i] === '[') continue;
      const start = i;
      while (i < jsonPath.length && jsonPath[i] !== '.' && jsonPath[i] !== '[') i += 1;
      // 空 key 是合法 JSON 键（`{"":1}` 在树里的 id 是 `$.`、`$.a.`、`$.a..b`），
      // 这里不能直接判非法；真正的空串键在原文里是 `""`，由文本扫描决定能否命中。
      segments.push({ kind: 'key', key: jsonPath.slice(start, i) });
      continue;
    }

    if (ch === '[') {
      if (jsonPath[i + 1] === '"') {
        // ["key"] —— safeKey 对含特殊字符的键使用这种写法
        i += 2;
        let key = '';
        let closed = false;
        while (i < jsonPath.length) {
          const c = jsonPath[i];
          if (c === '\\') {
            const next = jsonPath[i + 1];
            // safeKey 只转义了双引号；其余反斜杠序列原样保留
            key += next === '"' || next === '\\' ? next : `\\${next ?? ''}`;
            i += 2;
            continue;
          }
          if (c === '"') {
            closed = true;
            i += 1;
            break;
          }
          key += c;
          i += 1;
        }
        if (!closed || jsonPath[i] !== ']') return null;
        i += 1;
        segments.push({ kind: 'key', key });
        continue;
      }

      const close = jsonPath.indexOf(']', i);
      if (close < 0) return null;
      const digits = jsonPath.slice(i + 1, close);
      if (!/^\d+$/.test(digits)) return null;
      segments.push({ kind: 'index', index: Number(digits) });
      i = close + 1;
      continue;
    }

    return null;
  }

  return segments;
}

/** 树节点 id → 可用于原文定位的 JSONPath（占位节点回退到父数组） */
export function resolveLocatorPath(nodeId: string): string {
  const suffix = `.${ELLIPSIS_KEY}`;
  return nodeId.endsWith(suffix) ? nodeId.slice(0, -suffix.length) : nodeId;
}

function skipWhitespace(text: string, pos: number): number {
  let i = pos;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i += 1;
    else break;
  }
  return i;
}

/** 读取 JSON 字符串字面量（pos 必须指向开引号），返回解码值与结束位置 */
function readJsonString(text: string, pos: number): { value: string; end: number } | null {
  if (text[pos] !== '"') return null;
  let i = pos + 1;
  let value = '';

  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') return { value, end: i + 1 };

    if (ch === '\\') {
      const esc = text[i + 1];
      i += 2;
      switch (esc) {
        case '"': value += '"'; break;
        case '\\': value += '\\'; break;
        case '/': value += '/'; break;
        case 'b': value += '\b'; break;
        case 'f': value += '\f'; break;
        case 'n': value += '\n'; break;
        case 'r': value += '\r'; break;
        case 't': value += '\t'; break;
        case 'u': {
          const hex = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
          value += String.fromCharCode(parseInt(hex, 16));
          i += 4;
          break;
        }
        default:
          return null;
      }
      continue;
    }

    value += ch;
    i += 1;
  }

  return null;
}

/** 跳过 pos 处的一个完整 JSON 值，返回其后的位置；无法确定时返回 -1 */
function skipJsonValue(text: string, pos: number): number {
  const start = skipWhitespace(text, pos);
  const ch = text[start];

  if (ch === '"') {
    const str = readJsonString(text, start);
    return str ? str.end : -1;
  }

  if (ch === '{' || ch === '[') {
    const open = ch;
    const close = ch === '{' ? '}' : ']';
    let depth = 0;
    let i = start;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') {
        const str = readJsonString(text, i);
        if (!str) return -1;
        i = str.end;
        continue;
      }
      if (c === open) depth += 1;
      else if (c === close) {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
    return -1;
  }

  // number / true / false / null
  let i = start;
  while (i < text.length && !',}] \t\n\r'.includes(text[i])) i += 1;
  return i > start ? i : -1;
}

/**
 * 沿路径逐段下降，返回目标位置的偏移。
 * segIndex 走到末尾时返回当前位置（即目标值的起始偏移）。
 */
function locateAt(
  text: string,
  pos: number,
  segments: PathSegment[],
  segIndex: number,
  depth: number,
): number | null {
  const start = skipWhitespace(text, pos);
  if (segIndex >= segments.length) return start < text.length ? start : null;
  if (depth > MAX_LOCATE_DEPTH) return null;

  const segment = segments[segIndex];

  if (segment.kind === 'key') {
    if (text[start] !== '{') return null;

    let i = skipWhitespace(text, start + 1);
    while (i < text.length && text[i] !== '}') {
      const keyStart = i;
      const keyToken = readJsonString(text, keyStart);
      if (!keyToken) return null;

      i = skipWhitespace(text, keyToken.end);
      if (text[i] !== ':') return null;
      const valueStart = skipWhitespace(text, i + 1);

      if (keyToken.value === segment.key) {
        // 最后一段：返回「键」的位置（键与值一般同一行，键更符合直觉）
        if (segIndex + 1 === segments.length) return keyStart;
        const found = locateAt(text, valueStart, segments, segIndex + 1, depth + 1);
        if (found !== null) return found;
      }

      const afterValue = skipJsonValue(text, valueStart);
      if (afterValue < 0) return null;
      i = skipWhitespace(text, afterValue);
      if (text[i] === ',') {
        i = skipWhitespace(text, i + 1);
        continue;
      }
      break;
    }
    return null;
  }

  if (text[start] !== '[') return null;

  let index = 0;
  let i = skipWhitespace(text, start + 1);
  while (i < text.length && text[i] !== ']') {
    const valueStart = i;
    if (index === segment.index) {
      const found = locateAt(text, valueStart, segments, segIndex + 1, depth + 1);
      if (found !== null) return found;
    }
    const afterValue = skipJsonValue(text, valueStart);
    if (afterValue < 0) return null;
    i = skipWhitespace(text, afterValue);
    index += 1;
    if (text[i] === ',') {
      i = skipWhitespace(text, i + 1);
      continue;
    }
    break;
  }

  return null;
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  let idx = text.indexOf('\n');
  while (idx >= 0 && idx < offset) {
    line += 1;
    idx = text.indexOf('\n', idx + 1);
  }
  return line;
}

function columnOf(text: string, offset: number): number {
  const prevBreak = text.lastIndexOf('\n', offset - 1);
  return offset - prevBreak;
}

/**
 * 定位 JSONPath 在原文中的位置。
 *
 * @param rawText  左侧编辑器里的 JSON 原文
 * @param jsonPath 树节点 id（`$.a[1].b`）
 */
export function locateJsonPath(rawText: string, jsonPath: string): JsonTextLocation | null {
  if (typeof rawText !== 'string' || rawText.length === 0) return null;
  if (typeof jsonPath !== 'string' || jsonPath.length === 0) return null;

  const locate = (path: string): number | null => {
    const segments = parseJsonPathSegments(path);
    if (!segments) return null;
    const offset = locateAt(rawText, 0, segments, 0, 0);
    if (offset === null || offset < 0 || offset > rawText.length) return null;
    return offset;
  };

  // 先按「字面路径」定位：只有当路径本身在原文里不存在时，
  // 才走折叠占位节点的回退（`…N more items` 回退到父数组）。
  // 不能无条件剥后缀：真实键名恰好叫 `__ellipsis__` 的节点会被错误地跳到父级。
  let offset = locate(jsonPath);
  if (offset === null) {
    const fallbackPath = resolveLocatorPath(jsonPath);
    if (fallbackPath !== jsonPath) offset = locate(fallbackPath);
  }
  if (offset === null) return null;

  return { offset, line: lineOf(rawText, offset), column: columnOf(rawText, offset) };
}