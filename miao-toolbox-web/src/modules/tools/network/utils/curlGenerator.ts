/**
 * Curl 命令生成器 / 解析器（纯前端）
 * Body 类型对齐常见工具：无 / JSON / Form(urlencoded) / Raw
 * 输出：curl / wget / httpie
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type CurlOutputFormat = 'curl' | 'wget' | 'httpie';
/** 无 body / JSON / 表单 urlencoded / 原始文本 */
export type CurlBodyType = 'none' | 'json' | 'form' | 'raw';

export interface HeaderPair {
  key: string;
  value: string;
}

export interface FormField {
  key: string;
  value: string;
}

export interface CurlFormState {
  method: HttpMethod;
  url: string;
  headers: HeaderPair[];
  bodyType: CurlBodyType;
  /** json / raw 模式下的 body 文本 */
  body: string;
  /** form 模式下的键值对 */
  formFields: FormField[];
  /** raw 模式可选 Content-Type（留空则不自动加） */
  rawContentType: string;
  followRedirects: boolean;
  insecure: boolean;
  includeHeaders: boolean;
  compressed: boolean;
  userAgent: string;
}

export type ParseCurlResult =
  | { ok: true; state: Partial<CurlFormState> }
  | { ok: false; error: string };

const DEFAULT_STATE: CurlFormState = {
  method: 'GET',
  url: '',
  headers: [],
  bodyType: 'none',
  body: '',
  formFields: [],
  rawContentType: 'text/plain',
  followRedirects: false,
  insecure: false,
  includeHeaders: false,
  compressed: false,
  userAgent: '',
};

export function defaultCurlState(overrides?: Partial<CurlFormState>): CurlFormState {
  const headers = overrides?.headers
    ? overrides.headers.map((h) => ({ ...h }))
    : [];
  const formFields = overrides?.formFields
    ? overrides.formFields.map((f) => ({ ...f }))
    : [];
  return {
    ...DEFAULT_STATE,
    ...overrides,
    headers,
    formFields,
  };
}

/**
 * 兼容 Tab 持久化的旧状态（缺 bodyType / formFields / rawContentType 等）。
 * 生成命令与 UI 渲染前务必调用，避免 undefined.trim 崩溃。
 */
export function normalizeCurlState(input?: Partial<CurlFormState> | null): CurlFormState {
  const o = input && typeof input === 'object' ? input : {};
  let bodyType = o.bodyType;
  if (bodyType !== 'none' && bodyType !== 'json' && bodyType !== 'form' && bodyType !== 'raw') {
    // 旧版只有 body 字符串：有内容则按 json/raw 推断
    const body = typeof o.body === 'string' ? o.body : '';
    bodyType = body.trim() ? (looksLikeJson(body) ? 'json' : 'raw') : 'none';
  }
  return defaultCurlState({
    ...o,
    method: o.method || 'GET',
    url: typeof o.url === 'string' ? o.url : '',
    body: typeof o.body === 'string' ? o.body : '',
    bodyType,
    rawContentType:
      typeof o.rawContentType === 'string' && o.rawContentType
        ? o.rawContentType
        : DEFAULT_STATE.rawContentType,
    formFields: Array.isArray(o.formFields) ? o.formFields : [],
    headers: Array.isArray(o.headers) ? o.headers : [],
    userAgent: typeof o.userAgent === 'string' ? o.userAgent : '',
    followRedirects: Boolean(o.followRedirects),
    insecure: Boolean(o.insecure),
    includeHeaders: Boolean(o.includeHeaders),
    compressed: Boolean(o.compressed),
  });
}

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function hasHeader(headers: HeaderPair[], name: string): boolean {
  const n = name.toLowerCase();
  return headers.some((h) => h.key.trim().toLowerCase() === n && h.value.trim() !== '');
}

function getHeader(headers: HeaderPair[], name: string): string | null {
  const n = name.toLowerCase();
  const h = headers.find((x) => x.key.trim().toLowerCase() === n && x.value.trim() !== '');
  return h ? h.value.trim() : null;
}

export function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

/** 将 form fields 编码为 application/x-www-form-urlencoded 字符串 */
export function encodeFormBody(fields: FormField[]): string {
  return fields
    .filter((f) => f.key.trim() !== '')
    .map((f) => `${encodeURIComponent(f.key.trim())}=${encodeURIComponent(f.value)}`)
    .join('&');
}

export interface ResolvedBody {
  /** 是否有 body */
  hasBody: boolean;
  /** 最终 payload 字符串（json/raw 单段；form 已 urlencode） */
  payload: string;
  /** form 字段（仅 form 模式，便于 curl 多次 -d） */
  formFields: FormField[];
  /** 应自动附加的 Content-Type，null 表示不附加（已有或无 body） */
  autoContentType: string | null;
  bodyType: CurlBodyType;
}

/** 根据 bodyType 解析实际 body 与 Content-Type */
export function resolveBody(state: CurlFormState): ResolvedBody {
  const s = normalizeCurlState(state);
  const method = s.method || 'GET';
  if (method === 'GET' || method === 'HEAD' || s.bodyType === 'none') {
    return {
      hasBody: false,
      payload: '',
      formFields: [],
      autoContentType: null,
      bodyType: 'none',
    };
  }

  const hasCt = hasHeader(s.headers ?? [], 'Content-Type');

  if (s.bodyType === 'json') {
    const payload = s.body ?? '';
    if (!payload.trim()) {
      return { hasBody: false, payload: '', formFields: [], autoContentType: null, bodyType: 'json' };
    }
    return {
      hasBody: true,
      payload,
      formFields: [],
      autoContentType: hasCt ? null : 'application/json',
      bodyType: 'json',
    };
  }

  if (s.bodyType === 'form') {
    const fields = (s.formFields ?? []).filter((f) => (f?.key ?? '').trim() !== '');
    if (fields.length === 0) {
      return { hasBody: false, payload: '', formFields: [], autoContentType: null, bodyType: 'form' };
    }
    return {
      hasBody: true,
      payload: encodeFormBody(fields),
      formFields: fields,
      autoContentType: hasCt ? null : 'application/x-www-form-urlencoded',
      bodyType: 'form',
    };
  }

  // raw
  const payload = s.body ?? '';
  if (!payload.trim()) {
    return { hasBody: false, payload: '', formFields: [], autoContentType: null, bodyType: 'raw' };
  }
  const ct = (s.rawContentType ?? '').trim();
  return {
    hasBody: true,
    payload,
    formFields: [],
    autoContentType: hasCt || !ct ? null : ct,
    bodyType: 'raw',
  };
}

/** 生成 curl 命令 */
export function generateCurl(state: CurlFormState): string {
  const stateN = normalizeCurlState(state);
  const parts: string[] = ['curl'];
  const method = stateN.method || 'GET';
  const url = (stateN.url ?? '').trim();
  const body = resolveBody(stateN);

  if (method !== 'GET') {
    parts.push('-X', method);
  }
  if (stateN.followRedirects) parts.push('-L');
  if (stateN.insecure) parts.push('-k');
  if (stateN.includeHeaders) parts.push('-i');
  if (stateN.compressed) parts.push('--compressed');
  if ((stateN.userAgent ?? '').trim()) {
    parts.push('-A', shellSingleQuote(stateN.userAgent.trim()));
  }

  for (const h of stateN.headers ?? []) {
    const k = (h?.key ?? '').trim();
    if (!k) continue;
    parts.push('-H', shellSingleQuote(`${k}: ${h.value ?? ''}`));
  }

  if (body.autoContentType) {
    parts.push('-H', shellSingleQuote(`Content-Type: ${body.autoContentType}`));
  }

  if (body.hasBody) {
    if (body.bodyType === 'form' && body.formFields.length > 0) {
      // 多次 -d，curl 会按 form-urlencoded 拼接（更贴近浏览器表单调试习惯）
      for (const f of body.formFields) {
        parts.push('-d', shellSingleQuote(`${(f.key ?? '').trim()}=${f.value ?? ''}`));
      }
    } else {
      parts.push('-d', shellSingleQuote(body.payload));
    }
  }

  if (url) {
    parts.push(shellSingleQuote(url));
  }

  return parts.join(' ');
}

/** 生成 wget 命令 */
export function generateWget(state: CurlFormState): string {
  const stateN = normalizeCurlState(state);
  const parts: string[] = ['wget'];
  const method = stateN.method || 'GET';
  const url = (stateN.url ?? '').trim();
  const body = resolveBody(stateN);

  if (method !== 'GET') {
    parts.push(`--method=${method}`);
  }
  if (stateN.insecure) parts.push('--no-check-certificate');
  if ((stateN.userAgent ?? '').trim()) {
    parts.push(`--user-agent=${shellSingleQuote(stateN.userAgent.trim())}`);
  }
  for (const h of stateN.headers ?? []) {
    const k = (h?.key ?? '').trim();
    if (!k) continue;
    parts.push(`--header=${shellSingleQuote(`${k}: ${h.value ?? ''}`)}`);
  }
  if (body.autoContentType) {
    parts.push(`--header=${shellSingleQuote(`Content-Type: ${body.autoContentType}`)}`);
  }
  if (body.hasBody) {
    parts.push(`--body-data=${shellSingleQuote(body.payload)}`);
  }
  if (url) parts.push(shellSingleQuote(url));
  parts.push('-O', '-');
  return parts.join(' ');
}

/** 生成 httpie 命令 */
export function generateHttpie(state: CurlFormState): string {
  const stateN = normalizeCurlState(state);
  const method = (stateN.method || 'GET').toLowerCase();
  const url = (stateN.url ?? '').trim();
  const parts: string[] = ['http', method];
  if (url) parts.push(url);

  for (const h of stateN.headers ?? []) {
    const k = (h?.key ?? '').trim();
    if (!k) continue;
    parts.push(`${k}:${h.value ?? ''}`);
  }

  const body = resolveBody(stateN);
  if (body.autoContentType) {
    parts.push(`Content-Type:${body.autoContentType}`);
  }

  if (body.hasBody) {
    if (body.bodyType === 'json') {
      try {
        const obj = JSON.parse(body.payload) as unknown;
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            if (v !== null && typeof v === 'object') {
              parts.push(`${k}:=${JSON.stringify(v)}`);
            } else {
              parts.push(`${k}=${String(v)}`);
            }
          }
        } else {
          parts.push(`--raw=${shellSingleQuote(body.payload)}`);
        }
      } catch {
        parts.push(`--raw=${shellSingleQuote(body.payload)}`);
      }
    } else if (body.bodyType === 'form') {
      for (const f of body.formFields) {
        parts.push(`${(f.key ?? '').trim()}=${f.value ?? ''}`);
      }
    } else {
      parts.push(`--raw=${shellSingleQuote(body.payload)}`);
    }
  }

  if (stateN.followRedirects) parts.push('--follow');
  if (stateN.insecure) parts.push('--verify=no');
  return parts.join(' ');
}

export function generateCommand(state: CurlFormState, format: CurlOutputFormat): string {
  const stateN = normalizeCurlState(state);
  switch (format) {
    case 'wget':
      return generateWget(stateN);
    case 'httpie':
      return generateHttpie(stateN);
    default:
      return generateCurl(stateN);
  }
}

/** 简易 shell token 拆分（支持单/双引号） */
function tokenizeShell(input: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let i = 0;
  let quote: "'" | '"' | null = null;
  while (i < input.length) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (ch === '\\' && quote === '"' && i + 1 < input.length) {
        cur += input[i + 1];
        i += 2;
        continue;
      } else {
        cur += ch;
      }
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
      i += 1;
      continue;
    }
    if (ch === '\\' && i + 1 < input.length) {
      cur += input[i + 1];
      i += 2;
      continue;
    }
    cur += ch;
    i += 1;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function parseFormBody(body: string): FormField[] {
  if (!body.includes('=') || looksLikeJson(body)) return [];
  const fields: FormField[] = [];
  for (const part of body.split('&')) {
    if (!part) continue;
    const idx = part.indexOf('=');
    if (idx < 0) {
      fields.push({ key: decodeURIComponentSafe(part), value: '' });
    } else {
      fields.push({
        key: decodeURIComponentSafe(part.slice(0, idx)),
        value: decodeURIComponentSafe(part.slice(idx + 1)),
      });
    }
  }
  return fields;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/**
 * 根据 Content-Type 与 body 内容推断 bodyType
 */
export function inferBodyType(
  body: string,
  contentType: string | null,
  multiData: boolean,
): CurlBodyType {
  if (!body.trim() && !multiData) return 'none';
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('application/json') || looksLikeJson(body)) return 'json';
  if (
    ct.includes('application/x-www-form-urlencoded') ||
    multiData ||
    (body.includes('=') && !looksLikeJson(body) && !body.includes('{') && body.includes('&'))
  ) {
    return 'form';
  }
  if (ct.includes('application/x-www-form-urlencoded') || (body.includes('=') && !looksLikeJson(body))) {
    // 单键值 form
    if (!looksLikeJson(body) && body.includes('=')) return 'form';
  }
  if (body.includes('=') && !looksLikeJson(body) && !body.trim().startsWith('<')) {
    // key=value 单段也按 form
    const fields = parseFormBody(body);
    if (fields.length >= 1 && fields.every((f) => f.key.length > 0)) return 'form';
  }
  if (looksLikeJson(body)) return 'json';
  return body.trim() ? 'raw' : 'none';
}

/**
 * 反向解析 curl 命令为表单状态
 */
export function parseCurlCommand(raw: string): ParseCurlResult {
  const text = raw.trim().replace(/\\\r?\n/g, ' ');
  if (!text) return { ok: false, error: '请粘贴 curl 命令' };

  const tokens = tokenizeShell(text);
  if (tokens.length === 0) return { ok: false, error: '无法解析命令' };

  let start = 0;
  if (tokens[0].toLowerCase() === 'curl') start = 1;

  const state = defaultCurlState({ method: 'GET' });
  const headers: HeaderPair[] = [];
  const dataParts: string[] = [];
  let methodSet = false;
  let url = '';

  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => {
      i += 1;
      return tokens[i];
    };

    if (t === '-X' || t === '--request') {
      const m = (next() || 'GET').toUpperCase() as HttpMethod;
      state.method = m;
      methodSet = true;
      continue;
    }
    if (t.startsWith('-X') && t.length > 2) {
      state.method = t.slice(2).toUpperCase() as HttpMethod;
      methodSet = true;
      continue;
    }
    if (t === '-H' || t === '--header') {
      const hv = next() || '';
      const idx = hv.indexOf(':');
      if (idx > 0) {
        headers.push({ key: hv.slice(0, idx).trim(), value: hv.slice(idx + 1).trim() });
      } else if (hv) {
        headers.push({ key: hv, value: '' });
      }
      continue;
    }
    if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-ascii' || t === '--data-urlencode') {
      dataParts.push(next() || '');
      if (!methodSet) {
        state.method = 'POST';
        methodSet = true;
      }
      continue;
    }
    if (
      t.startsWith('--data=') ||
      t.startsWith('--data-raw=') ||
      t.startsWith('--data-binary=') ||
      t.startsWith('--data-urlencode=')
    ) {
      dataParts.push(t.slice(t.indexOf('=') + 1));
      if (!methodSet) {
        state.method = 'POST';
        methodSet = true;
      }
      continue;
    }
    if (t === '-L' || t === '--location') {
      state.followRedirects = true;
      continue;
    }
    if (t === '-k' || t === '--insecure') {
      state.insecure = true;
      continue;
    }
    if (t === '-i' || t === '--include') {
      state.includeHeaders = true;
      continue;
    }
    if (t === '--compressed') {
      state.compressed = true;
      continue;
    }
    if (t === '-A' || t === '--user-agent') {
      state.userAgent = next() || '';
      continue;
    }
    if (t.startsWith('-A') && t.length > 2) {
      state.userAgent = t.slice(2);
      continue;
    }
    if (t.startsWith('-')) {
      continue;
    }
    if (!url) url = t;
  }

  state.url = url;
  state.headers = headers;

  const ct = getHeader(headers, 'Content-Type');
  // 去掉自动添加的 Content-Type 避免表单里重复（可选：保留用户原始）
  // 保留 headers 原样，bodyType 推断用

  if (dataParts.length === 0) {
    state.bodyType = 'none';
    state.body = '';
    state.formFields = [];
  } else if (dataParts.length > 1) {
    // 多次 -d → form
    state.bodyType = 'form';
    state.formFields = dataParts.flatMap((p) => {
      const fields = parseFormBody(p);
      return fields.length > 0 ? fields : [{ key: p, value: '' }];
    });
    state.body = encodeFormBody(state.formFields);
  } else {
    const body = dataParts[0];
    const multi = false;
    const bodyType = inferBodyType(body, ct, multi);
    state.bodyType = bodyType;
    if (bodyType === 'form') {
      state.formFields = parseFormBody(body);
      state.body = body;
    } else {
      state.body = body;
      state.formFields = [];
      if (bodyType === 'raw' && ct) {
        state.rawContentType = ct;
      }
    }
  }

  if (!url && dataParts.length === 0 && headers.length === 0) {
    return { ok: false, error: '未识别到有效的 curl 参数' };
  }
  return { ok: true, state };
}
