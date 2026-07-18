/**
 * 带 HMAC 签名的 AI SSE 流式调用 Hook。
 * 工具层只提供 endpoint + 请求体 + 结果解析；签名/读流/中止统一在此。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import axiosInstance from '../services/axiosInstance';
import { getAccessToken, getSigningKey } from '../contexts/AuthContext';

async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(data);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function buildSignedHeaders(body: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const signingKey = getSigningKey();
  if (signingKey && token) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const signature = await hmacSha256(signingKey, timestamp + nonce + body);
    headers['X-Request-Timestamp'] = timestamp;
    headers['X-Request-Nonce'] = nonce;
    headers['X-Request-Signature'] = signature;
  }

  return headers;
}

export interface UseSignedAiStreamOptions<TParams, TResult> {
  /** 相对 baseURL 的路径，如 /api/regex/ai/stream */
  endpoint: string;
  /** done 时将累积文本解析为结构化结果 */
  parseResult: (full: string, params: TParams, traceId?: string) => TResult;
}

export function useSignedAiStream<TParams, TResult>(
  options: UseSignedAiStreamOptions<TParams, TResult>,
) {
  const { endpoint, parseResult } = options;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const parseRef = useRef(parseResult);
  useEffect(() => {
    parseRef.current = parseResult;
  }, [parseResult]);

  const invoke = useCallback(
    async (params: TParams) => {
      setLoading(true);
      setStreaming(true);
      setStreamText('');
      setResult(null);
      setError(null);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const body = JSON.stringify(params);
        const headers = await buildSignedHeaders(body);
        const baseUrl = axiosInstance.defaults.baseURL || '';
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
          credentials: 'include',
        });

        if (!response.ok) {
          try {
            const errData = (await response.json()) as { message?: string };
            setError(errData.message || `请求失败: ${response.status}`);
          } catch {
            setError(`请求失败: ${response.status}`);
          }
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setError('无法读取响应流');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.slice(5).trim();
              if (!dataStr) continue;

              try {
                const parsed = JSON.parse(dataStr) as {
                  token?: string;
                  trace_id?: string;
                  message?: string;
                };
                if (currentEvent === 'token') {
                  const tok = parsed.token || '';
                  if (tok) {
                    full += tok;
                    setStreamText(full);
                  }
                } else if (currentEvent === 'done') {
                  setResult(parseRef.current(full, params, parsed.trace_id));
                } else if (currentEvent === 'error') {
                  setError(parsed.message || 'AI 助手出错');
                } else if (currentEvent === 'output') {
                  full = JSON.stringify(parsed, null, 2);
                  setStreamText(full);
                } else if (!currentEvent || currentEvent === 'message') {
                  if (parsed.token) {
                    full += parsed.token;
                    setStreamText(full);
                  }
                }
              } catch {
                if (currentEvent === 'token' && dataStr) {
                  full += dataStr;
                  setStreamText(full);
                }
              }
              currentEvent = '';
            }
          }
        }
      } catch (err: unknown) {
        const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
        if (name !== 'AbortError') {
          const message =
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message: string }).message)
              : 'AI 助手服务异常';
          setError(message || 'AI 助手服务异常');
        }
      } finally {
        setStreaming(false);
        setLoading(false);
        abortRef.current = null;
      }
    },
    [endpoint],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setLoading(false);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setStreamText('');
    setStreaming(false);
    setLoading(false);
  }, []);

  return {
    invoke,
    cancel,
    reset,
    loading,
    streaming,
    streamText,
    result,
    error,
  };
}
