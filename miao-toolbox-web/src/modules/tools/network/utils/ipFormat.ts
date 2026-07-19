/**
 * IPv4 格式转换 / CIDR 计算
 */

export interface IpFormatResult {
  input: string;
  dotted?: string;
  binary?: string;
  decimal?: string;
  hex?: string;
  cidr?: {
    prefix: number;
    network: string;
    broadcast: string;
    firstHost: string;
    lastHost: string;
    hostCount: number;
    mask: string;
  };
  error?: string;
}

function ipToInt(parts: number[]): number {
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

function intToParts(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function partsToDotted(parts: number[]): string {
  return parts.join('.');
}

function partsToBinary(parts: number[]): string {
  return parts.map((p) => p.toString(2).padStart(8, '0')).join('.');
}

function partsToHex(parts: number[]): string {
  return parts.map((p) => p.toString(16).padStart(2, '0')).join('');
}

function parseIpv4(text: string): number[] | null {
  const m = text.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = [1, 2, 3, 4].map((i) => Number(m[i]));
  if (parts.some((p) => p < 0 || p > 255)) return null;
  return parts;
}

export function analyzeIp(input: string): IpFormatResult {
  const raw = input.trim();
  if (!raw) return { input: raw, error: '请输入 IPv4 或 CIDR（如 192.168.1.0/24）' };

  // CIDR
  const cidrMatch = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (cidrMatch) {
    const parts = parseIpv4(cidrMatch[1]!);
    const prefix = Number(cidrMatch[2]);
    if (!parts) return { input: raw, error: '无效的 IPv4 地址' };
    if (prefix < 0 || prefix > 32) return { input: raw, error: '前缀长度须在 0–32' };

    const ipInt = ipToInt(parts);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = (ipInt & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const hostCount = prefix >= 31 ? (prefix === 32 ? 1 : 2) : Math.max(0, broadcast - network - 1);
    const firstHost = prefix >= 31 ? network : network + 1;
    const lastHost = prefix >= 31 ? broadcast : broadcast - 1;
    const netParts = intToParts(network);

    return {
      input: raw,
      dotted: partsToDotted(parts),
      binary: partsToBinary(parts),
      decimal: String(ipInt >>> 0),
      hex: '0x' + partsToHex(parts),
      cidr: {
        prefix,
        network: partsToDotted(netParts),
        broadcast: partsToDotted(intToParts(broadcast)),
        firstHost: partsToDotted(intToParts(firstHost >>> 0)),
        lastHost: partsToDotted(intToParts(lastHost >>> 0)),
        hostCount,
        mask: partsToDotted(intToParts(mask)),
      },
    };
  }

  // 十进制
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n > 0xffffffff) return { input: raw, error: '十进制超出 IPv4 范围' };
    const parts = intToParts(n >>> 0);
    return {
      input: raw,
      dotted: partsToDotted(parts),
      binary: partsToBinary(parts),
      decimal: String(n >>> 0),
      hex: '0x' + partsToHex(parts),
    };
  }

  // hex
  if (/^(0x)?[0-9a-fA-F]{1,8}$/.test(raw)) {
    const n = parseInt(raw.replace(/^0x/i, ''), 16) >>> 0;
    const parts = intToParts(n);
    return {
      input: raw,
      dotted: partsToDotted(parts),
      binary: partsToBinary(parts),
      decimal: String(n),
      hex: '0x' + partsToHex(parts),
    };
  }

  // dotted
  const parts = parseIpv4(raw);
  if (!parts) return { input: raw, error: '无法识别，请输入 IPv4 / CIDR / 十进制 / 十六进制' };
  const ipInt = ipToInt(parts);
  return {
    input: raw,
    dotted: partsToDotted(parts),
    binary: partsToBinary(parts),
    decimal: String(ipInt >>> 0),
    hex: '0x' + partsToHex(parts),
  };
}

export function formatIpResultText(r: IpFormatResult): string {
  if (r.error) return r.error;
  const lines = [
    `点分十进制: ${r.dotted}`,
    `二进制:     ${r.binary}`,
    `十进制:     ${r.decimal}`,
    `十六进制:   ${r.hex}`,
  ];
  if (r.cidr) {
    const c = r.cidr;
    lines.push(
      '',
      `CIDR /${c.prefix}`,
      `子网掩码:   ${c.mask}`,
      `网络地址:   ${c.network}`,
      `广播地址:   ${c.broadcast}`,
      `可用主机:   ${c.firstHost} – ${c.lastHost}`,
      `主机数量:   ${c.hostCount}`,
    );
  }
  return lines.join('\n');
}
