/**
 * URL 解析与 query 编辑后重组
 */

export interface QueryParam {
  key: string;
  value: string;
}

export interface UrlParts {
  href: string;
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  host: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
  params: QueryParam[];
}

export interface ParseUrlResult {
  ok: true;
  parts: UrlParts;
}

export interface ParseUrlError {
  ok: false;
  error: string;
}

export type ParseUrlOutcome = ParseUrlResult | ParseUrlError;

/** 去掉首尾空白与常见包裹引号 */
export function normalizeUrlInput(raw: string): string {
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * 尝试解析 URL；无协议时补 https://
 */
export function parseUrl(raw: string): ParseUrlOutcome {
  const input = normalizeUrlInput(raw);
  if (!input) {
    return { ok: false, error: '请输入 URL' };
  }

  const candidates = [input];
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(input)) {
    candidates.push(`https://${input}`);
    candidates.push(`http://${input}`);
  }

  let lastErr = '无效的 URL';
  for (const c of candidates) {
    try {
      const u = new URL(c);
      return { ok: true, parts: urlToParts(u) };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : '无效的 URL';
    }
  }
  return { ok: false, error: lastErr };
}

export function urlToParts(u: URL): UrlParts {
  const params: QueryParam[] = [];
  u.searchParams.forEach((value, key) => {
    params.push({ key, value });
  });
  return {
    href: u.href,
    protocol: u.protocol.replace(/:$/, ''),
    username: u.username,
    password: u.password,
    hostname: u.hostname,
    port: u.port,
    host: u.host,
    pathname: u.pathname || '/',
    search: u.search,
    hash: u.hash.replace(/^#/, ''),
    origin: u.origin,
    params,
  };
}

export function paramsToSearch(params: QueryParam[]): string {
  const sp = new URLSearchParams();
  for (const { key, value } of params) {
    if (!key && !value) continue;
    // 允许空 key？跳过无 key 的行
    if (!key) continue;
    sp.append(key, value);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * 用各字段 + params 重组 URL
 */
export function buildUrl(parts: {
  protocol: string;
  username?: string;
  password?: string;
  hostname: string;
  port?: string;
  pathname?: string;
  params?: QueryParam[];
  hash?: string;
}): string {
  const protocol = (parts.protocol || 'https').replace(/:$/, '');
  const host = parts.hostname.trim();
  if (!host) {
    throw new Error('主机名不能为空');
  }
  let auth = '';
  if (parts.username) {
    auth = encodeURIComponent(parts.username);
    if (parts.password) auth += `:${encodeURIComponent(parts.password)}`;
    auth += '@';
  }
  const port = parts.port?.trim() ? `:${parts.port.trim()}` : '';
  let path = parts.pathname?.trim() || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  const search = paramsToSearch(parts.params ?? []);
  const hash = parts.hash?.trim() ? `#${parts.hash.replace(/^#/, '')}` : '';
  return `${protocol}://${auth}${host}${port}${path}${search}${hash}`;
}

/** 从当前 parts 字段实时重组（编辑用） */
export function reassembleFromParts(parts: UrlParts): string {
  return buildUrl({
    protocol: parts.protocol,
    username: parts.username,
    password: parts.password,
    hostname: parts.hostname,
    port: parts.port,
    pathname: parts.pathname,
    params: parts.params,
    hash: parts.hash,
  });
}

export function formatUrlPartsText(parts: UrlParts): string {
  const lines = [
    `URL:      ${parts.href}`,
    `protocol: ${parts.protocol}`,
    `host:     ${parts.host}`,
    `hostname: ${parts.hostname}`,
    `port:     ${parts.port || '(default)'}`,
    `path:     ${parts.pathname}`,
    `query:    ${parts.search || '(none)'}`,
    `hash:     ${parts.hash ? `#${parts.hash}` : '(none)'}`,
    `origin:   ${parts.origin}`,
  ];
  if (parts.username) lines.push(`username: ${parts.username}`);
  if (parts.password) lines.push(`password: ***`);
  if (parts.params.length) {
    lines.push('', 'query params:');
    for (const p of parts.params) {
      lines.push(`  ${p.key}=${p.value}`);
    }
  }
  return lines.join('\n');
}
