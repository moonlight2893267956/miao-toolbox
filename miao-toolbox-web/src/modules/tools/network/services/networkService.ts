import axiosInstance from '../../../../services/axiosInstance';
import { getAccessToken, getSigningKey } from '../../../../contexts/AuthContext';
import type { NetworkToolMeta } from '../types';

interface ApiEnvelope<T> {
  code: string;
  data: T;
  message?: string;
}

/**
 * 拉取全部网络工具元数据（GET /api/network/tools）。
 */
export async function listNetworkTools(): Promise<NetworkToolMeta[]> {
  const response = await axiosInstance.get<ApiEnvelope<NetworkToolMeta[]>>('/api/network/tools');
  return response.data.data ?? [];
}

// ── TCP Ping ──

export interface TcpPingProbe {
  seq: number;
  success: boolean;
  latencyMs?: number | null;
  errorCode?: string | null;
  message?: string | null;
}

export interface TcpPingResult {
  host: string;
  port: number;
  resolvedIp?: string | null;
  count: number;
  successCount: number;
  failCount: number;
  avgLatencyMs?: number | null;
  probes: TcpPingProbe[];
}

export interface TcpPingParams {
  host: string;
  port?: number;
  count?: number;
}

export async function tcpPing(params: TcpPingParams): Promise<TcpPingResult> {
  const response = await axiosInstance.post<ApiEnvelope<TcpPingResult>>(
    '/api/network/inspector/tcp-ping',
    {
      host: params.host,
      port: params.port ?? 443,
      count: params.count ?? 4,
    },
    { timeout: 120_000 },
  );
  return response.data.data;
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SSE 连续 TCP Ping（最多 count 次，默认 30）。
 * onProbe / onSummary / onDone / onError 回调。
 * 返回 abort 函数。
 */
export function tcpPingStream(
  params: TcpPingParams,
  handlers: {
    onProbe?: (p: TcpPingProbe) => void;
    onSummary?: (s: TcpPingResult) => void;
    onDone?: () => void;
    onError?: (msg: string) => void;
  },
): () => void {
  const controller = new AbortController();
  const bodyObj = {
    host: params.host,
    port: params.port ?? 443,
    count: params.count ?? 30,
  };
  const body = JSON.stringify(bodyObj);

  void (async () => {
    try {
      const token = getAccessToken();
      const signingKey = getSigningKey();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (signingKey && token) {
        const timestamp = Date.now().toString();
        const nonce = crypto.randomUUID();
        headers['X-Request-Timestamp'] = timestamp;
        headers['X-Request-Nonce'] = nonce;
        headers['X-Request-Signature'] = await hmacSha256Hex(
          signingKey,
          timestamp + nonce + body,
        );
      }

      const res = await fetch('/api/network/inspector/tcp-ping/stream', {
        method: 'POST',
        headers,
        body,
        credentials: 'include',
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        handlers.onError?.(`请求失败 HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventName = 'message';
      let dataLines: string[] = [];

      const flush = () => {
        if (!dataLines.length) return;
        const data = dataLines.join('\n');
        dataLines = [];
        const name = eventName;
        eventName = 'message';
        try {
          if (name === 'probe') handlers.onProbe?.(JSON.parse(data) as TcpPingProbe);
          else if (name === 'summary') handlers.onSummary?.(JSON.parse(data) as TcpPingResult);
          else if (name === 'done') handlers.onDone?.();
          else if (name === 'error') {
            const o = JSON.parse(data) as { message?: string };
            handlers.onError?.(o.message || '流式探测失败');
          }
        } catch {
          /* ignore parse */
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';
        for (const line of parts) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          } else if (line === '') {
            flush();
          }
        }
      }
      flush();
      handlers.onDone?.();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      handlers.onError?.(e instanceof Error ? e.message : '流式探测中断');
    }
  })();

  return () => controller.abort();
}

// ── DNS 查询 ──

export interface DnsRecordResult {
  name: string;
  type: string;
  ttl: number;
  value: string;
}

export interface DnsQueryResult {
  domain: string;
  queryTypes: string[];
  dnsServer: string;
  records: DnsRecordResult[];
  total: number;
}

export interface DnsQueryParams {
  domain: string;
  types?: string[];
  dnsServer?: string;
  timeoutMs?: number;
}

export async function dnsQuery(params: DnsQueryParams): Promise<DnsQueryResult> {
  const response = await axiosInstance.post<ApiEnvelope<DnsQueryResult>>(
    '/api/network/inspector/dns-query',
    {
      domain: params.domain,
      types: params.types,
      dnsServer: params.dnsServer,
      timeoutMs: params.timeoutMs,
    },
    { timeout: 35_000 },
  );
  return response.data.data;
}

// ── WHOIS 查询 ──

export interface WhoisFieldResult {
  key: string;
  value: string;
}

export interface WhoisQueryResult {
  target: string;
  queryType: 'DOMAIN' | 'IP';
  whoisServer: string;
  fields: WhoisFieldResult[];
  raw: string;
  found: boolean;
}

export interface WhoisQueryParams {
  target: string;
  whoisServer?: string;
  timeoutMs?: number;
}

export async function whoisQuery(params: WhoisQueryParams): Promise<WhoisQueryResult> {
  const response = await axiosInstance.post<ApiEnvelope<WhoisQueryResult>>(
    '/api/network/inspector/whois',
    {
      target: params.target,
      whoisServer: params.whoisServer,
      timeoutMs: params.timeoutMs,
    },
    { timeout: 60_000 },
  );
  return response.data.data;
}

// ── SSL/TLS 证书分析 ──

export interface SslCertificateField {
  key: string;
  value: string;
}

export interface SslCertificateInfo {
  index: number;
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  daysRemaining: number;
  expired: boolean;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
  publicKeySize: number;
  san: string[];
  fields: SslCertificateField[];
}

export interface SslAnalyzerResult {
  host: string;
  port: number;
  resolvedIp: string;
  protocol: string;
  cipherSuite: string;
  peerVerified: boolean;
  certificateError: string | null;
  chain: SslCertificateInfo[];
  handshakeTimeMs: number;
  success: boolean;
  errorMessage: string | null;
}

export interface SslAnalyzerParams {
  host: string;
  port?: number;
  timeoutMs?: number;
}

export async function sslAnalyze(params: SslAnalyzerParams): Promise<SslAnalyzerResult> {
  const response = await axiosInstance.post<ApiEnvelope<SslAnalyzerResult>>(
    '/api/network/inspector/ssl-analyzer',
    {
      host: params.host,
      port: params.port,
      timeoutMs: params.timeoutMs,
    },
    { timeout: 60_000 },
  );
  return response.data.data;
}

// ── HTTP Header 分析 ──

export interface HttpHeaderField {
  key: string;
  value: string;
}

export interface HttpHeaderAnalyzerResult {
  url: string;
  statusCode: number;
  statusText: string;
  finalUrl: string;
  elapsedMs: number;
  categories: Record<string, HttpHeaderField[]>;
  missingSecurityHeaders: string[];
  success: boolean;
  errorMessage: string | null;
}

export interface HttpHeaderAnalyzerParams {
  url: string;
  timeoutMs?: number;
}

export async function httpHeaderAnalyze(
  params: HttpHeaderAnalyzerParams,
): Promise<HttpHeaderAnalyzerResult> {
  const response = await axiosInstance.post<ApiEnvelope<HttpHeaderAnalyzerResult>>(
    '/api/network/inspector/http-header',
    {
      url: params.url,
      timeoutMs: params.timeoutMs,
    },
    { timeout: 60_000 },
  );
  return response.data.data;
}

// ── IP 信誉检查 ──

export interface IpReputationReport {
  reportedAt: string | null;
  comment: string | null;
  categories: number[];
}

export interface IpReputationResult {
  ip: string;
  abuseConfidenceScore: number;
  totalReports: number;
  lastReportedAt: string | null;
  isPublic: boolean;
  isWhitelisted: boolean;
  domain: string | null;
  usageType: string | null;
  countryCode: string | null;
  isp: string | null;
  reports: IpReputationReport[];
  configured: boolean;
  success: boolean;
  message: string | null;
}

export interface IpReputationParams {
  ip: string;
  maxAgeInDays?: number;
}

export async function ipReputation(params: IpReputationParams): Promise<IpReputationResult> {
  const response = await axiosInstance.post<ApiEnvelope<IpReputationResult>>(
    '/api/network/inspector/ip-reputation',
    {
      ip: params.ip,
      maxAgeInDays: params.maxAgeInDays,
    },
    { timeout: 60_000 },
  );
  return response.data.data;
}

// ── HTTP 请求构建器 ──

export interface HttpRequestHeaderItem {
  name: string;
  value: string;
}

export interface HttpRequestBuilderResult {
  statusCode: number;
  statusText: string;
  finalUrl: string;
  headers: HttpRequestHeaderItem[];
  body: string | null;
  bodyBytes: number;
  truncated: boolean;
  elapsedMs: number;
  success: boolean;
  errorMessage: string | null;
}

export interface HttpRequestBuilderParams {
  url: string;
  method?: string;
  headers?: HttpRequestHeaderItem[];
  bodyType?: string;
  body?: string;
  timeoutMs?: number;
}

export async function httpRequestBuilder(
  params: HttpRequestBuilderParams,
): Promise<HttpRequestBuilderResult> {
  const response = await axiosInstance.post<ApiEnvelope<HttpRequestBuilderResult>>(
    '/api/network/inspector/http-request-builder',
    {
      url: params.url,
      method: params.method,
      headers: params.headers,
      bodyType: params.bodyType,
      body: params.body,
      timeoutMs: params.timeoutMs,
    },
    { timeout: 60_000 },
  );
  return response.data.data;
}

// ── Webhook 接收器 ──

export interface WebhookCreateResponse {
  hookId: string;
  url: string;
  expiresAt: number;
}

export interface WebhookCustomResponse {
  statusCode: number;
  body: string | null;
  headers?: Record<string, string>;
}

export interface WebhookInfo {
  hookId: string;
  createdAt: number;
  expiresAt: number;
  requestCount: number;
  customResponse: WebhookCustomResponse | null;
}

export interface WebhookHistoryItem {
  id: string;
  receivedAt: number;
  method: string;
  sourceIp: string;
  path: string;
  queryParams: Record<string, string>;
  headers: Record<string, string>;
  body: string | null;
  sizeBytes: number;
  /** 端点本次实际返回的 HTTP 状态码（旧数据可能缺失） */
  responseStatusCode?: number;
  /** 端点本次实际返回的响应头（旧数据可能缺失） */
  responseHeaders?: Record<string, string>;
  /** 端点本次实际返回的响应体（旧数据可能缺失） */
  responseBody?: string | null;
}

/** 创建临时 Webhook 端点（TTL 24h），返回 hookId 与可公开访问的 URL。 */
export async function createWebhook(): Promise<WebhookCreateResponse> {
  const response = await axiosInstance.post<ApiEnvelope<WebhookCreateResponse>>(
    '/api/network/webhook/create',
    {},
    { timeout: 30_000 },
  );
  return response.data.data;
}

/** 读取端点信息（剩余时间、已接收数量、自定义响应）。 */
export async function getWebhookInfo(hookId: string): Promise<WebhookInfo> {
  const response = await axiosInstance.get<ApiEnvelope<WebhookInfo>>(
    `/api/network/webhook/${hookId}`,
    { timeout: 30_000 },
  );
  return response.data.data;
}

/** 读取最近请求历史（最新在前）。 */
export async function getWebhookHistory(hookId: string): Promise<WebhookHistoryItem[]> {
  const response = await axiosInstance.get<ApiEnvelope<WebhookHistoryItem[]>>(
    `/api/network/webhook/${hookId}/history`,
    { timeout: 30_000 },
  );
  return response.data.data ?? [];
}

/** 保存/清除自定义响应（statusCode<=0 视为清除）。 */
export async function saveWebhookResponse(
  hookId: string,
  data: WebhookCustomResponse,
): Promise<void> {
  await axiosInstance.put<ApiEnvelope<void>>(
    `/api/network/webhook/${hookId}/response`,
    data,
    { timeout: 30_000 },
  );
}

/** 删除端点及其历史。 */
export async function deleteWebhook(hookId: string): Promise<void> {
  await axiosInstance.delete<ApiEnvelope<void>>(
    `/api/network/webhook/${hookId}`,
    { timeout: 30_000 },
  );
}

/**
 * SSE 实时订阅 Webhook 请求推送。返回 abort 函数。
 *
 * <p>该端点已整体豁免网关签名/防重放校验；此处仍带登录 token 与签名 header（无害）。
 * 连接因服务端 30min 超时或网络中断而关闭后，会自动重连（除非调用方主动 abort）。
 */
export function subscribeWebhook(
  hookId: string,
  handlers: {
    onRequest?: (item: WebhookHistoryItem) => void;
    onError?: (msg: string) => void;
  },
): () => void {
  const controller = new AbortController();
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (stopped) return;
    void (async () => {
      try {
        const token = getAccessToken();
        const signingKey = getSigningKey();
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (signingKey && token) {
          const timestamp = Date.now().toString();
          const nonce = crypto.randomUUID();
          const data = timestamp + nonce;
          headers['X-Request-Timestamp'] = timestamp;
          headers['X-Request-Nonce'] = nonce;
          headers['X-Request-Signature'] = await hmacSha256Hex(signingKey, data);
        }

        const res = await fetch(`/api/network/webhook/${hookId}/stream`, {
          method: 'GET',
          headers,
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          handlers.onError?.(`订阅失败 HTTP ${res.status}`);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let eventName = 'message';
        let dataLines: string[] = [];

        const flush = () => {
          if (!dataLines.length) return;
          const data = dataLines.join('\n');
          dataLines = [];
          const name = eventName;
          eventName = 'message';
          try {
            if (name === 'request') handlers.onRequest?.(JSON.parse(data) as WebhookHistoryItem);
            else if (name === 'error') {
              const o = JSON.parse(data) as { message?: string };
              handlers.onError?.(o.message || '订阅出错');
            }
          } catch {
            /* ignore parse */
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() ?? '';
          for (const line of parts) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            else if (line === '') flush();
          }
        }
        flush();
        if (!stopped) reconnectTimer = setTimeout(connect, 1000);
      } catch (e) {
        if ((e as Error).name === 'AbortError' || stopped) return;
        handlers.onError?.(e instanceof Error ? e.message : '订阅中断');
        reconnectTimer = setTimeout(connect, 2000);
      }
    })();
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    controller.abort();
  };
}
