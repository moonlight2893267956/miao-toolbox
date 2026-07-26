/**
 * PHP 日志提取器 — 从含 PHP 序列化数据的日志中提取 inputdata / outputdata / param / result
 *
 * 纯前端解析，无服务端交互。
 */

/* ---------- PHP unserialize ---------- */

type PhpValue = string | number | boolean | null | PhpValue[] | PhpObject;
interface PhpObject {
  [key: string]: PhpValue;
}

export function phpUnserialize(data: string): PhpValue {
  let i = 0;

  function skipWs(): void {
    while (i < data.length && /\s/.test(data[i])) i++;
  }

  function readUntil(ch: string): string {
    const start = i;
    while (i < data.length && data[i] !== ch) i++;
    return data.slice(start, i);
  }

  function parseValue(): PhpValue {
    skipWs();
    if (i >= data.length) return null;
    const type = data[i];

    if (type === 'N') { i += 2; return null; }

    if (type === 'i') {
      i += 2;
      const num = readUntil(';');
      i++;
      return parseInt(num, 10);
    }

    if (type === 'd') {
      i += 2;
      const num = readUntil(';');
      i++;
      return parseFloat(num);
    }

    if (type === 'b') {
      i += 2;
      const v = data[i];
      while (i < data.length && data[i] !== ';') i++;
      i++;
      return v === '1';
    }

    if (type === 's') {
      i += 2;
      readUntil(':');
      i++;
      if (data[i] === '"') i++;
      const start = i;
      while (i < data.length) {
        if (data[i] === '"' && data[i + 1] === ';') {
          const str = data.slice(start, i);
          i += 2;
          return str;
        }
        i++;
      }
      return data.slice(start);
    }

    if (type === 'a') {
      i += 2;
      readUntil(':');
      i++;
      while (i < data.length && data[i] !== '{') i++;
      if (data[i] === '{') i++;

      const obj: Record<string, PhpValue> = {};
      const arrKeys: number[] = [];

      for (let k = 0; k < 100_000 && i < data.length; k++) {
        skipWs();
        if (data[i] === '}') { i++; break; }
        const key = parseValue();
        skipWs();
        const val = parseValue();
        if (key === undefined) break;

        if (typeof key === 'number' && Number.isInteger(key)) {
          arrKeys.push(key);
          obj[key] = val;
        } else {
          obj[String(key)] = val;
        }
      }

      if (arrKeys.length > 0) {
        const sorted = arrKeys.slice().sort((a, b) => a - b);
        const isSeq = sorted.every((v, idx) => v === idx);
        if (isSeq) return sorted.map((k) => obj[k]);
      }
      return obj;
    }

    const start = i;
    while (i < data.length && data[i] !== ';') i++;
    i++;
    return data.slice(start, i);
  }

  try {
    return parseValue();
  } catch {
    return null;
  }
}

/* ---------- 从字符串中提取第一个完整 JSON ---------- */

function extractJSONFromString(s: string): string | null {
  if (!s) return null;
  const idxObj = s.indexOf('{');
  const idxArr = s.indexOf('[');

  if (idxObj === -1 && idxArr === -1) return null;

  let start: number;
  let openChar: string;
  let closeChar: string;

  if (idxObj === -1) { start = idxArr; openChar = '['; closeChar = ']'; }
  else if (idxArr === -1) { start = idxObj; openChar = '{'; closeChar = '}'; }
  else {
    if (idxObj < idxArr) { start = idxObj; openChar = '{'; closeChar = '}'; }
    else { start = idxArr; openChar = '['; closeChar = ']'; }
  }

  let depth = 0;
  for (let j = start; j < s.length; j++) {
    const ch = s[j];
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return s.slice(start, j + 1);
    } else if (ch === '"') {
      j++;
      while (j < s.length) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '"') break;
        j++;
      }
    }
  }
  return null;
}

/* ---------- 提取 param / result ---------- */

function extractParamOrResult(text: string, key: string): PhpValue {
  const regex = new RegExp(
    `\\[?${key}(?:\\s*from\\s*cache)?(?:\\[[^\\]]*\\])?\\]?\\s*:\\s*([\\s\\S]*)`,
    'i',
  );
  const match = regex.exec(text);
  if (!match) return null;

  let raw = match[1].trim();
  raw = raw.replace(/^\^SAFE\^/, '');

  if (/^a:\d+:/.test(raw)) {
    try { return phpUnserialize(raw); } catch { /* fallthrough */ }
  }

  const sAll = [...raw.matchAll(/s:\d+:"([\s\S]*?)";/g)];
  if (sAll.length) {
    const target = /^param$/i.test(key) ? sAll[0][1] : sAll[sAll.length - 1][1];
    try { return JSON.parse(target); } catch { /* */ }
    const inner = extractJSONFromString(target);
    if (inner) {
      try { return JSON.parse(inner); } catch { /* */ }
      try { return JSON.parse(inner.replace(/\\"/g, '"')); } catch { /* */ }
    }
    return target;
  }

  if (/^\{[\s\S]*\}$/.test(raw) || /^\[[\s\S]*\]$/.test(raw)) {
    try { return JSON.parse(raw); } catch { /* */ }
  }

  const aMatch = raw.match(/a:\d+:\{[\s\S]*\}$/);
  if (aMatch) {
    try { return phpUnserialize(aMatch[0]); } catch { /* */ }
  }

  return raw;
}

/* ---------- 主解析 ---------- */

export interface PhpLogExtractResult {
  input: PhpValue;
  output: PhpValue;
}

/**
 * 递归后处理：对每个字符串字段，如果其内容看起来像 JSON，自动再解析一次。
 * 解决 PHP 序列化嵌套 JSON 时的多余转义问题
 * （例如 `s:42:"{\"userId\":1,...}"` 反序列化出来仍是带转义的字符串）。
 *
 * 检测三种形式的"看起来像 JSON"：
 * 1. 直接以 `{...}` / `[...]` 包裹
 * 2. 以 `\"...\"` 包裹（PHP 序列化转义外层）
 * 3. 以 `\'...\'` 包裹
 */
function deepParseJSONStrings(value: PhpValue): PhpValue {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    const looksLikeJSON =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('\\"') && trimmed.endsWith('\\"')) ||
      (trimmed.startsWith("\\'") && trimmed.endsWith("\\'"));

    if (!looksLikeJSON) return value;

    // 反转义：\" → "  \\ → \
    const unescaped = trimmed
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');

    try {
      return deepParseJSONStrings(JSON.parse(unescaped));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepParseJSONStrings(v));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, PhpValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, PhpValue>)) {
      result[k] = deepParseJSONStrings(v);
    }
    return result;
  }
  return value;
}

export interface ParsePhpLogOptions {
  /** 是否把嵌套的 JSON 字符串自动解析为对象（默认 true）。关闭时原样展示字符串内容。 */
  deepParse?: boolean;
}

export function parsePhpLog(
  text: string,
  options: ParsePhpLogOptions = {},
): PhpLogExtractResult {
  const extractSerializedFor = (name: string, src: string): string | null => {
    const pattern = new RegExp(
      `s:\\d+:"${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}"`,
      'g',
    );
    const m = pattern.exec(src);
    if (!m) return null;
    let pos = m.index + m[0].length;
    while (pos < src.length && /\s/.test(src[pos])) pos++;
    if (src[pos] === 'a') {
      const braceStart = src.indexOf('{', pos);
      if (braceStart === -1) return null;
      let depth = 0;
      let idx = braceStart;
      for (; idx < src.length; idx++) {
        if (src[idx] === '{') depth++;
        else if (src[idx] === '}') {
          depth--;
          if (depth === 0) return src.slice(pos, idx + 1);
        }
      }
      return src.slice(pos);
    }
    return src.slice(pos, pos + 2000);
  };

  const inputFragment = extractSerializedFor('inputdata', text);
  const outputFragment = extractSerializedFor('outputdata', text);
  let inputParsed: PhpValue = null;
  let outputParsed: PhpValue = null;

  try { if (inputFragment) inputParsed = phpUnserialize(inputFragment); } catch { /* */ }
  try { if (outputFragment) outputParsed = phpUnserialize(outputFragment); } catch { /* */ }

  if (!inputParsed) inputParsed = extractParamOrResult(text, 'param');
  if (!outputParsed) outputParsed = extractParamOrResult(text, 'result');

  const { deepParse = true } = options;

  return {
    input: deepParse ? deepParseJSONStrings(inputParsed) : inputParsed,
    output: deepParse ? deepParseJSONStrings(outputParsed) : outputParsed,
  };
}

/* ---------- JSON 语法高亮（HTML） ---------- */

export function syntaxHighlightJSON(json: unknown): string {
  let str: string;
  if (typeof json === 'string') {
    str = json;
  } else {
    str = JSON.stringify(json, null, 2);
  }
  if (!str || str === 'null') return '<span class="ple-null">null</span>';

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d*)?([eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'ple-number';
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? 'ple-key' : 'ple-string';
        } else if (/true|false/.test(match)) {
          cls = 'ple-boolean';
        } else if (/null/.test(match)) {
          cls = 'ple-null';
        }
        return `<span class="${cls}">${match}</span>`;
      },
    );
}

/* ---------- 示例日志 ---------- */

export const SAMPLE_PHP_LOG = `[2026-07-26 10:00:01] api.request INFO param: a:2:{s:4:"name";s:5:"admin";s:8:"password";s:8:"Admin123";}
[2026-07-26 10:00:01] api.response INFO result: a:1:{s:4:"data";s:45:"{\\"userId\\":1,\\"token\\":\\"eyJhbGciOiJIUzI1NiJ9\\"}";}`;
