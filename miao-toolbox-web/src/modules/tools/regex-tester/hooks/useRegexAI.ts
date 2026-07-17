/**
 * 正则 AI 增强 Hook
 *
 * 调用后端 /api/regex/ai/stream（SSE 流式），支持三种任务：
 * - generate（自然语言生成正则）
 * - explain（解释正则）
 * - optimize（优化建议）
 *
 * 流式采用 fetch + ReadableStream 解析 SSE（与 text-compare 的 useAIAnalysis 一致），
 * 因为 miao-ai 把整个 output JSON 作为 token 逐段吐出，done 事件仅含 trace_id，
 * 故前端累积 token 片段得到完整 JSON，在 done 时解析为结构化结果。
 */
import { useCallback, useRef, useState } from 'react';
import axiosInstance from '../../../../services/axiosInstance';
import { getAccessToken, getSigningKey } from '../../../../contexts/AuthContext';

/** AI 任务类型 */
export type RegexAITask = 'generate' | 'explain' | 'optimize';

/** AI 请求参数 */
export interface RegexAIRequestParams {
  task: RegexAITask;
  description?: string;
  pattern?: string;
  flags?: string;
  engine?: string;
}

/** AI 响应 */
export interface RegexAIResult {
  task: RegexAITask | null;
  pattern: string | null;
  explanation: string | null;
  suggestions: string[] | null;
  model: string | null;
  traceId: string | null;
}

/**
 * HMAC-SHA256 签名（与 axiosInstance 拦截器逻辑一致，fetch 需手动签名）
 */
async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(data);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
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

export function useRegexAI() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegexAIResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  /** 流式过程中累积的完整输出文本（即 agent 返回的 output JSON 拼回） */
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const finalize = useCallback((full: string, task: RegexAITask, traceId?: string) => {
    // 兜底字段抽取：从可能不完整的 JSON 文本中尽量拿到结构化字段
    const extractStringField = (text: string, key: string): string | null => {
      const m = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      if (!m) return null;
      return m[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\t/g, '\t');
    };

    const extractSuggestions = (text: string): string[] | null => {
      const m = text.match(/"suggestions"\s*:\s*\[([\s\S]*?)\]/);
      if (!m) return null;
      const items: string[] = [];
      const itemRe = /"((?:[^"\\]|\\.)*)"/g;
      let im: RegExpExecArray | null;
      while ((im = itemRe.exec(m[1])) !== null) {
        items.push(
          im[1]
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\'),
        );
      }
      return items.length > 0 ? items : null;
    };

    // 清洗：去除末尾可能的省略号/光标残留
    let clean = full.trim();
    if (clean.endsWith('...')) clean = clean.slice(0, -3).trim();

    let pattern: string | null = null;
    let explanation: string | null = null;
    let suggestions: string[] | null = null;
    let model: string | null = null;
    let resolvedTraceId: string | null = traceId ?? null;

    // 优先尝试完整 JSON 解析
    try {
      const output = JSON.parse(clean) as Record<string, unknown>;
      pattern = (output.pattern as string) ?? null;
      explanation = (output.explanation as string) ?? null;
      if (Array.isArray(output.suggestions)) {
        const suggs = (output.suggestions as unknown[]).map(String);
        if (suggs.length > 0) suggestions = suggs;
      }
      model = (output.model as string) ?? null;
      if (!resolvedTraceId && output.trace_id) {
        resolvedTraceId = output.trace_id as string;
      }
    } catch {
      // JSON 解析失败时回退到正则抽取（应对末尾光标残留/截断等）
      pattern = extractStringField(clean, 'pattern');
      explanation = extractStringField(clean, 'explanation');
      suggestions = extractSuggestions(clean);
    }

    // 实在拿不到结构化字段时，保留原文（已截断省略号）作为兜底解释
    if (!pattern && !explanation) {
      explanation = clean || null;
    }

    setResult({
      task,
      pattern,
      explanation,
      suggestions,
      model,
      traceId: resolvedTraceId,
    });
  }, []);

  const streamInvoke = useCallback(
    async (params: RegexAIRequestParams) => {
      setLoading(true);
      setStreaming(true);
      setStreamText('');
      setResult(null);
      setError(null);

      // 中止可能仍在进行的上一次流式请求，避免事件交错
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const body = JSON.stringify(params);
        const headers = await buildSignedHeaders(body);
        const baseUrl = axiosInstance.defaults.baseURL || '';
        const response = await fetch(`${baseUrl}/api/regex/ai/stream`, {
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
                const parsed = JSON.parse(dataStr);
                if (currentEvent === 'token') {
                  const tok = parsed.token || '';
                  if (tok) {
                    full += tok;
                    setStreamText(full);
                  }
                } else if (currentEvent === 'done') {
                  finalize(full, params.task, parsed.trace_id);
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
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setError(err?.message || 'AI 助手服务异常');
        }
      } finally {
        setStreaming(false);
        setLoading(false);
        abortRef.current = null;
      }
    },
    [finalize],
  );

  /** 自然语言生成正则 */
  const generate = useCallback(
    (description: string, engine?: string) => streamInvoke({ task: 'generate', description, engine }),
    [streamInvoke],
  );

  /** 解释正则 */
  const explain = useCallback(
    (pattern: string, flags?: string, engine?: string) =>
      streamInvoke({ task: 'explain', pattern, flags, engine }),
    [streamInvoke],
  );

  /** 优化正则 */
  const optimize = useCallback(
    (pattern: string, flags?: string, engine?: string) =>
      streamInvoke({ task: 'optimize', pattern, flags, engine }),
    [streamInvoke],
  );

  /** 取消流式请求 */
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
    generate,
    explain,
    optimize,
    cancel,
    reset,
    loading,
    streaming,
    streamText,
    result,
    error,
  };
}
