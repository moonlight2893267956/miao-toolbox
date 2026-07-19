/**
 * Cookie 解析 — 支持 document.cookie / Set-Cookie 属性串 / 多行
 *
 * 判别要点：
 * - document.cookie：分号分隔的多对 name=value（如百度控制台复制的长串）
 * - Set-Cookie：首段 name=value，后续为 Domain/Path/HttpOnly 等标准属性
 * - 切勿用「文本里是否出现 domain 子串」判断，会把 bce-login-domain-account 误判成属性
 */

export interface CookieAttributes {
  name: string;
  value: string;
  Domain?: string;
  Path?: string;
  Expires?: string;
  'Max-Age'?: string;
  SameSite?: string;
  HttpOnly?: boolean;
  Secure?: boolean;
  Partitioned?: boolean;
  /** 未识别的额外属性 key=value 或 flag */
  extra?: Record<string, string | boolean>;
}

const BOOL_FLAGS = new Set(['httponly', 'secure', 'partitioned']);
/** 仅当 attr 名「完全等于」这些时才视为 Set-Cookie 属性 */
const SET_COOKIE_ATTR_NAMES = new Set([
  'domain',
  'path',
  'expires',
  'max-age',
  'samesite',
  'httponly',
  'secure',
  'partitioned',
]);

function stripWrappingQuotes(s: string): string {
  let t = s.trim();
  // 去掉整段被引号包住的情况（从 DevTools / 日志粘贴时常见）
  if (
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2) ||
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2)
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function unquoteValue(v: string): string {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * 按 `;` 切分，尊重双引号内的分号（极少见但合法）
 */
export function splitCookieSegments(input: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let inDquote = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      inDquote = !inDquote;
      buf += ch;
      continue;
    }
    if (ch === ';' && !inDquote) {
      const t = buf.trim();
      if (t) parts.push(t);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const last = buf.trim();
  if (last) parts.push(last);
  return parts;
}

function isNameValuePair(segment: string): boolean {
  const eq = segment.indexOf('=');
  if (eq <= 0) return false;
  const name = segment.slice(0, eq).trim();
  // cookie-name 不允许空白
  return name.length > 0 && !/\s/.test(name);
}

/** 该段是否为标准 Set-Cookie 属性（名必须完全匹配，非子串） */
export function isSetCookieAttributeSegment(segment: string): boolean {
  const t = segment.trim();
  if (!t) return false;
  const eq = t.indexOf('=');
  if (eq === -1) {
    return BOOL_FLAGS.has(t.toLowerCase());
  }
  const attrName = t.slice(0, eq).trim().toLowerCase();
  return SET_COOKIE_ATTR_NAMES.has(attrName);
}

/**
 * 后续段是否整体像 Set-Cookie 属性列表
 * （避免把 document.cookie 里的第二个 name=value 当成 Domain）
 */
function restLooksLikeSetCookieAttributes(rest: string[]): boolean {
  if (rest.length === 0) return true;
  const known = rest.filter(isSetCookieAttributeSegment).length;
  // 全部是标准属性，或至少一半是且存在标准属性
  return known === rest.length || (known >= 1 && known * 2 >= rest.length);
}

/**
 * 解析单条「name=value; Attr=...; Flag」
 */
export function parseOneCookie(raw: string): CookieAttributes | null {
  let line = stripWrappingQuotes(raw);
  if (!line) return null;

  line = line.replace(/^set-cookie:\s*/i, '');

  const parts = splitCookieSegments(line);
  if (parts.length === 0) return null;

  const nv = parts[0];
  const eq = nv.indexOf('=');
  if (eq <= 0) return null;

  const name = nv.slice(0, eq).trim();
  const value = unquoteValue(nv.slice(eq + 1));
  if (!name) return null;

  const cookie: CookieAttributes = { name, value };
  const extra: Record<string, string | boolean> = {};

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const aeq = p.indexOf('=');
    if (aeq === -1) {
      const flag = p.trim();
      const key = flag.toLowerCase();
      if (key === 'httponly') cookie.HttpOnly = true;
      else if (key === 'secure') cookie.Secure = true;
      else if (key === 'partitioned') cookie.Partitioned = true;
      else if (flag) extra[flag] = true;
      continue;
    }
    const attrName = p.slice(0, aeq).trim();
    const attrVal = unquoteValue(p.slice(aeq + 1));
    const lower = attrName.toLowerCase();
    if (lower === 'domain') cookie.Domain = attrVal;
    else if (lower === 'path') cookie.Path = attrVal;
    else if (lower === 'expires') cookie.Expires = attrVal;
    else if (lower === 'max-age') cookie['Max-Age'] = attrVal;
    else if (lower === 'samesite') cookie.SameSite = attrVal;
    else if (BOOL_FLAGS.has(lower)) {
      if (lower === 'httponly') cookie.HttpOnly = true;
      else if (lower === 'secure') cookie.Secure = true;
      else if (lower === 'partitioned') cookie.Partitioned = true;
    } else {
      extra[attrName] = attrVal;
    }
  }

  if (Object.keys(extra).length) cookie.extra = extra;
  return cookie;
}

function parseDocumentCookieList(text: string): CookieAttributes[] {
  return splitCookieSegments(text.replace(/\r?\n/g, ';'))
    .filter(isNameValuePair)
    .map((p) => {
      const eq = p.indexOf('=');
      return {
        name: p.slice(0, eq).trim(),
        value: unquoteValue(p.slice(eq + 1)),
      } satisfies CookieAttributes;
    })
    .filter((c) => c.name.length > 0);
}

/**
 * 解析用户输入：多行 Set-Cookie 或 document.cookie 或单条属性串
 */
export function parseCookies(input: string): CookieAttributes[] {
  const text = stripWrappingQuotes(input);
  if (!text) return [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 多行：每行一条完整 Set-Cookie / 带属性的 cookie
  if (lines.length > 1) {
    const joined = lines.join('; ');
    // 若行内含标准属性，优先按行解析
    const anyLineHasAttrs = lines.some((line) => {
      const segs = splitCookieSegments(line.replace(/^set-cookie:\s*/i, ''));
      return segs.length > 1 && restLooksLikeSetCookieAttributes(segs.slice(1));
    });
    if (anyLineHasAttrs || lines.some((l) => /^set-cookie:/i.test(l))) {
      const perLine = lines
        .map(parseOneCookie)
        .filter((c): c is CookieAttributes => c != null);
      if (perLine.length > 0) return perLine;
    }
    // 否则整段当 document.cookie（粘贴时被自动换行）
    const doc = parseDocumentCookieList(joined);
    if (doc.length > 1) return doc;
  }

  // 单行 / 合并后：分号分段判别
  const segments = splitCookieSegments(text.replace(/\r?\n/g, ';').replace(/^set-cookie:\s*/i, ''));
  if (segments.length === 0) return [];

  if (segments.length === 1) {
    const one = parseOneCookie(segments[0]);
    return one ? [one] : [];
  }

  // 首段必须是 name=value
  if (!isNameValuePair(segments[0])) {
    return parseDocumentCookieList(text);
  }

  const rest = segments.slice(1);
  if (restLooksLikeSetCookieAttributes(rest)) {
    const one = parseOneCookie(text);
    return one ? [one] : [];
  }

  // 多对 name=value → document.cookie
  return parseDocumentCookieList(text);
}

export function formatCookiesText(cookies: CookieAttributes[]): string {
  if (cookies.length === 0) return '未解析到 Cookie';
  return cookies
    .map((c, i) => {
      const lines = [
        `[${i + 1}] ${c.name}=${c.value}`,
        c.Domain != null ? `  Domain: ${c.Domain}` : null,
        c.Path != null ? `  Path: ${c.Path}` : null,
        c.Expires != null ? `  Expires: ${c.Expires}` : null,
        c['Max-Age'] != null ? `  Max-Age: ${c['Max-Age']}` : null,
        c.SameSite != null ? `  SameSite: ${c.SameSite}` : null,
        c.HttpOnly != null ? `  HttpOnly: ${c.HttpOnly ? 'true' : 'false'}` : null,
        c.Secure != null ? `  Secure: ${c.Secure ? 'true' : 'false'}` : null,
        c.Partitioned ? `  Partitioned: true` : null,
      ].filter(Boolean);
      if (c.extra) {
        for (const [k, v] of Object.entries(c.extra)) {
          lines.push(`  ${k}: ${String(v)}`);
        }
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

export function cookiesToJson(cookies: CookieAttributes[]): string {
  return JSON.stringify(cookies, null, 2);
}
