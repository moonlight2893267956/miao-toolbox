/**
 * CIDR / 子网计算器（纯前端）
 * IPv4 完整：网络/广播/掩码/主机范围/子网划分
 * IPv6 基础：规范化前缀、网络地址、地址总数说明
 */

export interface IPv4CidrInfo {
  version: 4;
  input: string;
  cidr: string;
  network: string;
  broadcast: string;
  netmask: string;
  wildcard: string;
  prefix: number;
  hostBits: number;
  totalAddresses: number;
  usableHosts: number;
  firstHost: string | null;
  lastHost: string | null;
}

export interface IPv6CidrInfo {
  version: 6;
  input: string;
  cidr: string;
  network: string;
  prefix: number;
  hostBits: number;
  /** 主机位数过多时用科学计数式字符串 */
  totalAddresses: string;
}

export type CidrInfo = IPv4CidrInfo | IPv6CidrInfo;

export interface SubnetSplit {
  index: number;
  cidr: string;
  network: string;
  broadcast: string;
  firstHost: string | null;
  lastHost: string | null;
  usableHosts: number;
}

export type ParseCidrResult =
  | { ok: true; info: CidrInfo }
  | { ok: false; error: string };

function ipToLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = ((n << 8) >>> 0) + v;
  }
  return n >>> 0;
}

function longToIp(n: number): string {
  const x = n >>> 0;
  return [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255].join('.');
}

function prefixToMask(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff >>> 0;
  return ((0xffffffff << (32 - prefix)) >>> 0);
}

/** 解析 IPv4 或 IPv6 CIDR */
export function parseCidr(input: string): ParseCidrResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: '请输入 CIDR，例如 10.0.0.0/24' };

  if (raw.includes(':')) {
    return parseIPv6Cidr(raw);
  }
  return parseIPv4Cidr(raw);
}

function parseIPv4Cidr(raw: string): ParseCidrResult {
  let ipPart = raw;
  let prefix = 32;
  if (raw.includes('/')) {
    const [a, b] = raw.split('/');
    ipPart = a.trim();
    if (!/^\d+$/.test(b.trim())) return { ok: false, error: '前缀长度无效' };
    prefix = Number(b.trim());
    if (prefix < 0 || prefix > 32) return { ok: false, error: 'IPv4 前缀须在 0–32' };
  }
  const ipLong = ipToLong(ipPart);
  if (ipLong === null) return { ok: false, error: '无效的 IPv4 地址' };

  const mask = prefixToMask(prefix);
  const network = (ipLong & mask) >>> 0;
  const wildcard = (~mask) >>> 0;
  const broadcast = (network | wildcard) >>> 0;
  const hostBits = 32 - prefix;
  const total = hostBits >= 31 ? 2 ** hostBits : 1 << hostBits;
  const usable = prefix >= 31 ? (prefix === 32 ? 1 : 2) : total - 2;
  const firstHost = prefix >= 31 ? (prefix === 32 ? network : network) : (network + 1) >>> 0;
  const lastHost = prefix >= 31 ? (prefix === 32 ? network : broadcast) : (broadcast - 1) >>> 0;

  const info: IPv4CidrInfo = {
    version: 4,
    input: raw,
    cidr: `${longToIp(network)}/${prefix}`,
    network: longToIp(network),
    broadcast: longToIp(broadcast),
    netmask: longToIp(mask),
    wildcard: longToIp(wildcard),
    prefix,
    hostBits,
    totalAddresses: total,
    usableHosts: usable,
    firstHost: prefix === 32 ? longToIp(network) : longToIp(firstHost),
    lastHost: prefix === 32 ? longToIp(network) : longToIp(lastHost),
  };
  if (prefix === 31) {
    info.firstHost = longToIp(network);
    info.lastHost = longToIp(broadcast);
  }
  return { ok: true, info };
}

/** 将 IPv6 展开为 8 组 4 位 hex */
function expandIPv6(ip: string): string[] | null {
  let s = ip.trim().toLowerCase();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  if (s.includes('.')) return null; // 不支持 v4-mapped 简写混写细节
  const halves = s.split('::');
  if (halves.length > 2) return null;
  let head = halves[0] ? halves[0].split(':') : [];
  let tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];
  if (halves.length === 1) {
    head = s.split(':');
    tail = [];
  }
  head = head.filter((x) => x.length > 0);
  tail = tail.filter((x) => x.length > 0);
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  if (halves.length === 1 && missing !== 0) return null;
  const mid = Array(halves.length === 2 ? missing : 0).fill('0');
  const groups = [...head, ...mid, ...tail];
  if (groups.length !== 8) return null;
  const out: string[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(g.padStart(4, '0'));
  }
  return out;
}

function parseIPv6Cidr(raw: string): ParseCidrResult {
  let ipPart = raw;
  let prefix = 128;
  if (raw.includes('/')) {
    const idx = raw.lastIndexOf('/');
    ipPart = raw.slice(0, idx).trim();
    const p = raw.slice(idx + 1).trim();
    if (!/^\d+$/.test(p)) return { ok: false, error: '前缀长度无效' };
    prefix = Number(p);
    if (prefix < 0 || prefix > 128) return { ok: false, error: 'IPv6 前缀须在 0–128' };
  }
  const groups = expandIPv6(ipPart);
  if (!groups) return { ok: false, error: '无效的 IPv6 地址' };

  // 按前缀清零主机位
  const bits: number[] = [];
  for (const g of groups) {
    const v = parseInt(g, 16);
    for (let i = 15; i >= 0; i--) bits.push((v >> i) & 1);
  }
  for (let i = prefix; i < 128; i++) bits[i] = 0;
  const netGroups: string[] = [];
  for (let g = 0; g < 8; g++) {
    let v = 0;
    for (let i = 0; i < 16; i++) v = (v << 1) | bits[g * 16 + i];
    netGroups.push(v.toString(16).padStart(4, '0'));
  }
  const network = compressIPv6(netGroups);
  const hostBits = 128 - prefix;
  const totalAddresses =
    hostBits <= 53 ? String(2 ** hostBits) : `2^${hostBits}`;

  return {
    ok: true,
    info: {
      version: 6,
      input: raw,
      cidr: `${network}/${prefix}`,
      network,
      prefix,
      hostBits,
      totalAddresses,
    },
  };
}

function compressIPv6(groups: string[]): string {
  // 找最长 0 段压缩
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i <= 8; i++) {
    if (i < 8 && groups[i] === '0000') {
      if (curStart < 0) curStart = i;
      curLen += 1;
    } else {
      if (curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
      curStart = -1;
      curLen = 0;
    }
  }
  if (bestLen < 2) {
    return groups.map((g) => g.replace(/^0+/, '') || '0').join(':');
  }
  const head = groups.slice(0, bestStart).map((g) => g.replace(/^0+/, '') || '0');
  const tail = groups.slice(bestStart + bestLen).map((g) => g.replace(/^0+/, '') || '0');
  return `${head.join(':')}::${tail.join(':')}`;
}

/**
 * 将 IPv4 网络再划分为 newPrefix 的子网列表
 * @param maxCount 最多返回条数，防止爆炸
 */
export function splitIPv4Subnets(
  info: IPv4CidrInfo,
  newPrefix: number,
  maxCount = 256,
): { ok: true; subnets: SubnetSplit[] } | { ok: false; error: string } {
  if (newPrefix < info.prefix || newPrefix > 32) {
    return { ok: false, error: `新前缀须在 ${info.prefix}–32 之间` };
  }
  if (newPrefix === info.prefix) {
    const one = parseIPv4Cidr(info.cidr);
    if (!one.ok || one.info.version !== 4) return { ok: false, error: '划分失败' };
    const s = one.info;
    return {
      ok: true,
      subnets: [
        {
          index: 0,
          cidr: s.cidr,
          network: s.network,
          broadcast: s.broadcast,
          firstHost: s.firstHost,
          lastHost: s.lastHost,
          usableHosts: s.usableHosts,
        },
      ],
    };
  }
  const count = 2 ** (newPrefix - info.prefix);
  const step = 2 ** (32 - newPrefix);
  const base = ipToLong(info.network)!;
  const limit = Math.min(count, maxCount);
  const subnets: SubnetSplit[] = [];
  for (let i = 0; i < limit; i++) {
    const net = (base + i * step) >>> 0;
    const r = parseIPv4Cidr(`${longToIp(net)}/${newPrefix}`);
    if (!r.ok || r.info.version !== 4) continue;
    const s = r.info;
    subnets.push({
      index: i,
      cidr: s.cidr,
      network: s.network,
      broadcast: s.broadcast,
      firstHost: s.firstHost,
      lastHost: s.lastHost,
      usableHosts: s.usableHosts,
    });
  }
  return { ok: true, subnets };
}

export function formatCidrText(info: CidrInfo): string {
  if (info.version === 6) {
    return [
      `CIDR: ${info.cidr}`,
      `网络地址: ${info.network}`,
      `前缀: /${info.prefix}`,
      `主机位: ${info.hostBits}`,
      `地址总数: ${info.totalAddresses}`,
    ].join('\n');
  }
  return [
    `CIDR: ${info.cidr}`,
    `网络地址: ${info.network}`,
    `广播地址: ${info.broadcast}`,
    `子网掩码: ${info.netmask}`,
    `通配掩码: ${info.wildcard}`,
    `前缀: /${info.prefix}`,
    `主机位: ${info.hostBits}`,
    `地址总数: ${info.totalAddresses}`,
    `可用主机: ${info.usableHosts}`,
    `首主机: ${info.firstHost ?? '—'}`,
    `末主机: ${info.lastHost ?? '—'}`,
    info.firstHost && info.lastHost
      ? `可用范围: ${info.firstHost} – ${info.lastHost}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}
