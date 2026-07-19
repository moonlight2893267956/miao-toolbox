/**
 * 邮件原始 Header 解析（Received 链 / Auth-Results）
 */

export type HeaderCategory = 'routing' | 'auth' | 'addressing' | 'content' | 'other';

export interface HeaderField {
  name: string;
  value: string;
  category: HeaderCategory;
}

export interface ReceivedHop {
  raw: string;
  from?: string;
  by?: string;
  with?: string;
  id?: string;
  for?: string;
  /** RFC 日期字符串（若可解析） */
  date?: string;
  /** 相对下一跳的延迟秒数（若两跳均有日期） */
  delaySeconds?: number | null;
}

export interface AuthResult {
  protocol: 'spf' | 'dkim' | 'dmarc' | 'other';
  result: string;
  detail?: string;
  raw: string;
}

export interface EmailHeaderAnalysis {
  fields: HeaderField[];
  byCategory: Record<HeaderCategory, HeaderField[]>;
  received: ReceivedHop[];
  auth: AuthResult[];
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
}

const ROUTING = new Set([
  'received',
  'return-path',
  'delivered-to',
  'x-received',
  'x-originating-ip',
  'x-mailer',
  'message-id',
]);
const AUTH = new Set([
  'authentication-results',
  'received-spf',
  'dkim-signature',
  'arc-authentication-results',
  'arc-message-signature',
  'arc-seal',
  'dkim-filter',
]);
const ADDRESSING = new Set([
  'from',
  'to',
  'cc',
  'bcc',
  'reply-to',
  'sender',
  'subject',
  'date',
  'resent-from',
  'resent-to',
]);
const CONTENT = new Set([
  'content-type',
  'content-transfer-encoding',
  'mime-version',
  'content-disposition',
  'content-id',
]);

export function categorizeHeader(name: string): HeaderCategory {
  const n = name.toLowerCase();
  if (ROUTING.has(n) || n.startsWith('received')) return 'routing';
  if (AUTH.has(n) || n.includes('spf') || n.includes('dkim') || n.includes('dmarc')) return 'auth';
  if (ADDRESSING.has(n)) return 'addressing';
  if (CONTENT.has(n)) return 'content';
  return 'other';
}

/** 展开折行 Header（续行以空白开头） */
export function unfoldHeaders(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, ' ').trim();
}

/**
 * 解析为 name/value 列表（支持同名多字段，顺序保留）
 */
export function parseHeaderFields(raw: string): HeaderField[] {
  const text = unfoldHeaders(raw);
  if (!text) return [];
  const lines = text.split('\n');
  const fields: HeaderField[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // 跳过邮件体分隔后的内容
    if (trimmed === '') break;
    const colon = trimmed.indexOf(':');
    if (colon <= 0) continue;
    const name = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!/^[A-Za-z0-9-]+$/.test(name)) continue;
    fields.push({
      name,
      value,
      category: categorizeHeader(name),
    });
  }
  return fields;
}

export function parseReceivedHop(raw: string): ReceivedHop {
  const hop: ReceivedHop = { raw };
  // from ...
  const fromM = raw.match(/\bfrom\s+(\S+)/i);
  if (fromM) hop.from = fromM[1].replace(/[;]$/, '');
  const byM = raw.match(/\bby\s+(\S+)/i);
  if (byM) hop.by = byM[1].replace(/[;]$/, '');
  const withM = raw.match(/\bwith\s+(\S+)/i);
  if (withM) hop.with = withM[1].replace(/[;]$/, '');
  const idM = raw.match(/\bid\s+(\S+)/i);
  if (idM) hop.id = idM[1].replace(/[;]$/, '');
  const forM = raw.match(/\bfor\s+<([^>]+)>|\bfor\s+(\S+)/i);
  if (forM) hop.for = (forM[1] || forM[2] || '').replace(/[;]$/, '');
  // 日期通常在末尾分号后
  const dateM = raw.match(/;\s*(.+)$/);
  if (dateM) {
    const d = dateM[1].trim();
    const t = Date.parse(d);
    if (!Number.isNaN(t)) hop.date = new Date(t).toISOString();
    else hop.date = d;
  }
  return hop;
}

function parseDateMs(isoOrRaw?: string): number | null {
  if (!isoOrRaw) return null;
  const t = Date.parse(isoOrRaw);
  return Number.isNaN(t) ? null : t;
}

/**
 * Received 链：邮件头中从上到下通常是「最近 → 最早」
 * 延迟：上一跳时间 - 本跳时间（若可解析）
 */
export function buildReceivedChain(fields: HeaderField[]): ReceivedHop[] {
  const hops = fields
    .filter((f) => f.name.toLowerCase() === 'received')
    .map((f) => parseReceivedHop(f.value));

  for (let i = 0; i < hops.length - 1; i++) {
    const newer = parseDateMs(hops[i].date);
    const older = parseDateMs(hops[i + 1].date);
    if (newer != null && older != null) {
      hops[i].delaySeconds = Math.round((newer - older) / 1000);
    } else {
      hops[i].delaySeconds = null;
    }
  }
  return hops;
}

/**
 * 从 Authentication-Results / Received-SPF 提取 spf/dkim/dmarc
 */
export function extractAuthResults(fields: HeaderField[]): AuthResult[] {
  const results: AuthResult[] = [];

  for (const f of fields) {
    const name = f.name.toLowerCase();
    const v = f.value;

    if (name === 'received-spf') {
      const m = v.match(/^\s*(\w+)/);
      results.push({
        protocol: 'spf',
        result: (m?.[1] || 'unknown').toLowerCase(),
        detail: v,
        raw: `${f.name}: ${v}`,
      });
      continue;
    }

    if (name === 'authentication-results' || name === 'arc-authentication-results') {
      // spf=pass ... dkim=pass ... dmarc=pass ...
      const re = /\b(spf|dkim|dmarc)\s*=\s*([a-z0-9_-]+)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(v)) !== null) {
        const protocol = m[1].toLowerCase() as AuthResult['protocol'];
        results.push({
          protocol,
          result: m[2].toLowerCase(),
          detail: v.slice(Math.max(0, m.index - 10), m.index + 80),
          raw: `${f.name}: ${v}`,
        });
      }
    }

    if (name === 'dkim-signature') {
      const d = v.match(/\bd=([^;]+)/i)?.[1]?.trim();
      results.push({
        protocol: 'dkim',
        result: 'signed',
        detail: d ? `d=${d}` : v.slice(0, 120),
        raw: `${f.name}: ${v}`,
      });
    }
  }

  return results;
}

export function analyzeEmailHeaders(raw: string): EmailHeaderAnalysis {
  const fields = parseHeaderFields(raw);
  const byCategory: Record<HeaderCategory, HeaderField[]> = {
    routing: [],
    auth: [],
    addressing: [],
    content: [],
    other: [],
  };
  for (const f of fields) byCategory[f.category].push(f);

  const get = (n: string) =>
    fields.find((f) => f.name.toLowerCase() === n.toLowerCase())?.value;

  return {
    fields,
    byCategory,
    received: buildReceivedChain(fields),
    auth: extractAuthResults(fields),
    subject: get('Subject'),
    from: get('From'),
    to: get('To'),
    date: get('Date'),
  };
}

export function formatEmailAnalysisText(a: EmailHeaderAnalysis): string {
  const lines: string[] = [];
  if (a.subject) lines.push(`Subject: ${a.subject}`);
  if (a.from) lines.push(`From: ${a.from}`);
  if (a.to) lines.push(`To: ${a.to}`);
  if (a.date) lines.push(`Date: ${a.date}`);
  lines.push('', `字段数: ${a.fields.length}`, '', '=== Auth ===');
  if (a.auth.length === 0) lines.push('(无)');
  else for (const x of a.auth) lines.push(`${x.protocol}: ${x.result}`);
  lines.push('', '=== Received chain (new → old) ===');
  a.received.forEach((h, i) => {
    lines.push(
      `[${i + 1}] from=${h.from || '?'} by=${h.by || '?'}` +
        (h.delaySeconds != null ? ` delay=${h.delaySeconds}s` : '') +
        (h.date ? ` @ ${h.date}` : ''),
    );
  });
  lines.push('', '=== All fields ===');
  for (const f of a.fields) lines.push(`${f.name}: ${f.value}`);
  return lines.join('\n');
}

export const SAMPLE_EMAIL_HEADERS = `Return-Path: <sender@example.com>
Received: from mail.example.com (mail.example.com [203.0.113.10])
	by mx.google.com with ESMTPS id abc123
	for <user@gmail.com>;
	Mon, 18 Jul 2026 10:05:30 +0000
Received: from internal.example.com (internal.example.com [10.0.0.5])
	by mail.example.com with ESMTP id xyz789;
	Mon, 18 Jul 2026 10:05:00 +0000
Authentication-Results: mx.google.com;
       spf=pass (google.com: domain of sender@example.com designates 203.0.113.10 as permitted sender) smtp.mailfrom=sender@example.com;
       dkim=pass header.d=example.com header.s=s1;
       dmarc=pass (p=NONE sp=NONE) header.from=example.com
Received-SPF: pass (google.com: domain of sender@example.com designates 203.0.113.10 as permitted sender) client-ip=203.0.113.10;
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=example.com; s=s1;
	h=from:to:subject:date; bh=abc; b=def
From: Sender <sender@example.com>
To: User <user@gmail.com>
Subject: Test delivery
Date: Mon, 18 Jul 2026 10:04:50 +0000
Message-ID: <msg-001@example.com>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8
`;
