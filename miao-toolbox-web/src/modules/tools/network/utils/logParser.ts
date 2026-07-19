/**
 * 日志解析：Nginx / Apache / JSON Lines / 级别行 / 自定义正则
 *
 * 自定义正则语义：
 * 1. 作为「筛选」：只保留 raw 能 match 的行
 * 2. 若正则带捕获组，额外把组写入 fields
 * 3. 字段结构仍优先用自动识别的 nginx/apache/jsonl（不会因为正则未整行匹配就丢掉自动解析）
 */

export type LogFormat = 'nginx' | 'apache' | 'jsonl' | 'level' | 'custom' | 'raw';

export interface ParsedLogLine {
  index: number;
  raw: string;
  format: LogFormat;
  level?: string;
  /** 结构化字段 */
  fields: Record<string, string>;
  /** 是否命中自定义正则 */
  customMatched?: boolean;
}

export interface LogParseOptions {
  /** 关键词（不区分大小写） */
  keyword?: string;
  /** 级别过滤：error|warn|info|debug|... 空=全部 */
  level?: string;
  /** 自定义正则：筛选行；可含命名组 (?<name>...) 或编号组 */
  customRegex?: string;
}

export interface LogParseResult {
  detected: LogFormat;
  /** 是否启用了自定义正则筛选 */
  customFilter: boolean;
  lines: ParsedLogLine[];
  total: number;
  matched: number;
  error?: string;
  /** 正则已编译但 0 行命中时的提示 */
  hint?: string;
}

const NGINX_COMBINED =
  /^(?<ip>\S+) \S+ \S+ \[(?<time>[^\]]+)\] "(?<method>\S+) (?<path>\S+) (?<proto>[^"]+)" (?<status>\d{3}) (?<size>\S+) "(?<ref>[^"]*)" "(?<ua>[^"]*)"/;

const APACHE_COMMON =
  /^(?<ip>\S+) \S+ \S+ \[(?<time>[^\]]+)\] "(?<method>\S+) (?<path>\S+) (?<proto>[^"]+)" (?<status>\d{3}) (?<size>\S+)/;

const LEVEL_RE = /\b(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL|CRITICAL)\b/i;

function detectLineFormat(line: string): LogFormat {
  const t = line.trim();
  if (!t) return 'raw';
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      JSON.parse(t);
      return 'jsonl';
    } catch {
      /* */
    }
  }
  if (NGINX_COMBINED.test(t)) return 'nginx';
  if (APACHE_COMMON.test(t)) return 'apache';
  if (LEVEL_RE.test(t)) return 'level';
  return 'raw';
}

function majorityFormat(formats: LogFormat[]): LogFormat {
  const counts = new Map<LogFormat, number>();
  for (const f of formats) {
    if (f === 'raw') continue;
    counts.set(f, (counts.get(f) || 0) + 1);
  }
  let best: LogFormat = 'raw';
  let n = 0;
  for (const [f, c] of counts) {
    if (c > n) {
      best = f;
      n = c;
    }
  }
  return best;
}

function matchToFields(m: RegExpMatchArray): Record<string, string> {
  const fields: Record<string, string> = {};
  if (m.groups) {
    for (const [k, v] of Object.entries(m.groups)) {
      if (v != null) fields[k] = v;
    }
  }
  // 编号捕获组（无命名时）
  if (Object.keys(fields).length === 0) {
    for (let i = 1; i < m.length; i++) {
      if (m[i] != null) fields[`g${i}`] = m[i];
    }
  }
  return fields;
}

/** 自动识别解析单行（不含自定义正则） */
function parseAutoLine(raw: string, index: number, prefer: LogFormat): ParsedLogLine {
  const line = raw;
  const t = line.trimEnd();
  const fmt = prefer !== 'raw' ? prefer : detectLineFormat(t);

  if (fmt === 'jsonl' || (t.startsWith('{') && t.endsWith('}'))) {
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) {
        fields[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
      const level =
        fields.level || fields.severity || fields.severity_name || fields.Severity;
      return { index, raw: line, format: 'jsonl', level, fields };
    } catch {
      /* fallthrough */
    }
  }

  if (fmt === 'nginx' || NGINX_COMBINED.test(t)) {
    const m = t.match(NGINX_COMBINED);
    if (m) {
      const fields = matchToFields(m);
      const status = Number(fields.status);
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      return { index, raw: line, format: 'nginx', level, fields };
    }
  }

  if (fmt === 'apache' || APACHE_COMMON.test(t)) {
    const m = t.match(APACHE_COMMON);
    if (m) {
      const fields = matchToFields(m);
      const status = Number(fields.status);
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      return { index, raw: line, format: 'apache', level, fields };
    }
  }

  const lm = t.match(LEVEL_RE);
  if (lm) {
    return {
      index,
      raw: line,
      format: 'level',
      level: lm[1].toLowerCase(),
      fields: { message: t, level: lm[1] },
    };
  }

  return { index, raw: line, format: 'raw', fields: { message: t } };
}

function levelMatch(lineLevel: string | undefined, filter: string): boolean {
  if (!filter) return true;
  if (!lineLevel) return false;
  const f = filter.toLowerCase();
  const l = lineLevel.toLowerCase();
  if (f === 'warn') return l === 'warn' || l === 'warning';
  return l.includes(f) || f.includes(l);
}

export function parseLogs(raw: string, options: LogParseOptions = {}): LogParseResult {
  const text = raw.replace(/\r\n/g, '\n');
  if (!text.trim()) {
    return { detected: 'raw', customFilter: false, lines: [], total: 0, matched: 0 };
  }

  let customRe: RegExp | undefined;
  const customPattern = options.customRegex?.trim() || '';
  if (customPattern) {
    try {
      customRe = new RegExp(customPattern);
    } catch (e) {
      return {
        detected: 'raw',
        customFilter: true,
        lines: [],
        total: 0,
        matched: 0,
        error: `自定义正则无效：${e instanceof Error ? e.message : 'error'}`,
      };
    }
  }

  const rawLines = text.split('\n');
  const nonEmptyIdx = rawLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim().length > 0);

  const sampleFormats = nonEmptyIdx.slice(0, 30).map(({ line }) => detectLineFormat(line));
  const detected = majorityFormat(sampleFormats);

  // 先自动解析全部非空行
  let parsed = nonEmptyIdx.map(({ line, index }) => parseAutoLine(line, index, detected));
  const total = parsed.length;

  // 自定义正则：筛选 + 可选捕获组
  let customFilter = false;
  let hint: string | undefined;
  if (customRe) {
    customFilter = true;
    const kept: ParsedLogLine[] = [];
    for (const row of parsed) {
      const m = row.raw.match(customRe);
      if (!m) continue;
      const extra = matchToFields(m);
      kept.push({
        ...row,
        customMatched: true,
        // 有捕获组则合并进 fields；无捕获组则仅作筛选，保留 nginx 等结构
        fields: Object.keys(extra).length > 0 ? { ...row.fields, ...extra } : row.fields,
      });
    }
    parsed = kept;
    if (kept.length === 0) {
      hint =
        `正则 /${customPattern}/ 未匹配任何行。` +
        `提示：日志是整行文本，^POST$ 只会匹配内容恰好为「POST」的行；` +
        `筛选 POST 请求可试：POST 或 "POST `;
    }
  }

  const keyword = options.keyword?.trim().toLowerCase() || '';
  const level = options.level?.trim() || '';

  const lines = parsed.filter((l) => {
    if (level && !levelMatch(l.level, level)) return false;
    if (keyword && !l.raw.toLowerCase().includes(keyword)) return false;
    return true;
  });

  return {
    detected,
    customFilter,
    lines,
    total,
    matched: lines.length,
    hint,
  };
}

export function formatLogResultText(r: LogParseResult): string {
  const lines = [
    `格式: ${r.detected}${r.customFilter ? ' · 正则筛选' : ''}`,
    `总行: ${r.total} · 匹配: ${r.matched}`,
    r.error ? `错误: ${r.error}` : null,
    r.hint ? `提示: ${r.hint}` : null,
    '',
    ...r.lines.map((l) => {
      const keys = Object.keys(l.fields);
      if (keys.length && l.format !== 'raw' && l.format !== 'level') {
        return `[${l.format}] ${keys.map((k) => `${k}=${l.fields[k]}`).join(' ')}`;
      }
      return l.raw;
    }),
  ].filter((x) => x != null) as string[];
  return lines.join('\n');
}

export const SAMPLE_NGINX_LOG = `192.168.1.10 - - [18/Jul/2026:10:00:01 +0000] "GET /api/health HTTP/1.1" 200 15 "-" "curl/8.0"
192.168.1.11 - - [18/Jul/2026:10:00:02 +0000] "POST /api/login HTTP/1.1" 401 32 "https://app.example.com" "Mozilla/5.0"
10.0.0.5 - - [18/Jul/2026:10:00:03 +0000] "GET /static/app.js HTTP/1.1" 200 1024 "-" "Mozilla/5.0"
10.0.0.5 - - [18/Jul/2026:10:00:04 +0000] "GET /api/users HTTP/1.1" 500 48 "-" "Mozilla/5.0"
`;
