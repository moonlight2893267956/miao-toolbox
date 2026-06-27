import { useCallback, useRef, useState } from 'react';
import axiosInstance from '../../../services/axiosInstance';
import { getAccessToken, getSigningKey } from '../../../contexts/AuthContext';
import type { DiffResult, DiffHunk, DiffStatistics } from './types';

const BASE = '/api/diff/ai';

/** AI 分析模式 */
export type AIAnalysisMode = 'summary' | 'explain_selection';

/** AI 分析结果（结构化） */
export interface AIAnalysisSummary {
  summary: string;
  impact: string;
  details: Array<{
    hunk_index: number;
    type: string;
    explanation: string;
  }>;
}

/** AI 解释结果（结构化） */
export interface AIAnalysisExplanation {
  explanation: string;
  impact: string;
  suggestion: string;
}

/** AI 分析响应 */
export interface AIAnalysisResponse {
  mode: AIAnalysisMode;
  analysis: AIAnalysisSummary | AIAnalysisExplanation | string;
  model: string;
  traceId?: string;
  error?: string;
}

/** SSE 事件数据 */
export interface SSETokenEvent {
  token: string;
}

export interface SSEDoneEvent {
  trace_id: string;
  latency_ms: number;
}

export interface SSEErrorEvent {
  message: string;
}

/**
 * HMAC-SHA256 签名（与 axiosInstance 拦截器逻辑一致）
 */
async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(data);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 构建带 HMAC 签名的请求头（fetch API 不走 axios 拦截器，需手动签名）
 */
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

/**
 * AI 分析 API Hook
 *
 * - analyzeSummary: SSE 流式全局摘要（逐 token 输出）
 * - analyzeExplain: 同步选中解释
 */
export const useAIAnalysis = () => {
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  /** 全局摘要 — SSE 流式调用 */
  const analyzeSummary = useCallback(
    async (
      diffResult: DiffResult,
      onToken: (token: string) => void,
      onDone: (traceId?: string) => void,
      onError: (message: string) => void,
    ) => {
      setStreaming(true);
      setStreamContent('');
      abortRef.current = new AbortController();

      try {
        const body = JSON.stringify({
          mode: 'summary',
          language: diffResult.language || undefined,
          statistics: diffResult.statistics,
          hunks: diffResult.hunks,
        });

        // 手动计算 HMAC 签名（fetch 不走 axios 拦截器）
        const headers = await buildSignedHeaders(body);

        const baseUrl = axiosInstance.defaults.baseURL || '';
        const url = `${baseUrl}${BASE}/summary`;

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: abortRef.current.signal,
          credentials: 'include',
        });

        if (!response.ok) {
          // 尝试解析错误体
          try {
            const errData = await response.json();
            onError(errData.message || `请求失败: ${response.status}`);
          } catch {
            onError(`请求失败: ${response.status}`);
          }
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          onError('无法读取响应流');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE 协议：事件由空行分隔
          // Spring Boot SseEmitter 输出格式：
          //   event:token\n
          //   data:{"token":"xxx"}\n
          //   \n
          const lines = buffer.split('\n');
          // 保留最后一行（可能不完整）
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            const trimmedLine = line.trim();

            if (trimmedLine.startsWith('event:')) {
              // event:token 或 event: token
              currentEvent = trimmedLine.slice(6).trim();
            } else if (trimmedLine.startsWith('data:')) {
              // data:{"token":"xxx"} 或 data: {"token":"xxx"}
              const dataStr = trimmedLine.slice(5).trim();
              if (!dataStr) continue;

              try {
                const parsed = JSON.parse(dataStr);

                if (currentEvent === 'token') {
                  const token = parsed.token || '';
                  if (token) {
                    fullContent += token;
                    setStreamContent(fullContent);
                    onToken(token);
                  }
                } else if (currentEvent === 'done') {
                  onDone(parsed.trace_id);
                } else if (currentEvent === 'error') {
                  onError(parsed.message || 'AI 分析出错');
                } else if (currentEvent === 'output') {
                  // 非 generator 的完整输出
                  fullContent = JSON.stringify(parsed, null, 2);
                  setStreamContent(fullContent);
                } else if (!currentEvent || currentEvent === 'message') {
                  // 默认事件：可能是 token
                  if (parsed.token) {
                    fullContent += parsed.token;
                    setStreamContent(fullContent);
                    onToken(parsed.token);
                  }
                }
              } catch {
                // 非 JSON 数据，作为纯文本处理
                if (currentEvent === 'token' && dataStr) {
                  fullContent += dataStr;
                  setStreamContent(fullContent);
                  onToken(dataStr);
                }
              }
              currentEvent = '';
            }
            // 空行和注释行（:）被忽略 — 这是事件分隔符
          }
        }

        // 处理 buffer 中可能残留的最后一批数据
        if (buffer.trim()) {
          const remainingLines = buffer.split('\n');
          let lastEvent = '';
          for (const line of remainingLines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              lastEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.slice(5).trim();
              if (dataStr && lastEvent === 'done') {
                try {
                  const parsed = JSON.parse(dataStr);
                  onDone(parsed.trace_id);
                } catch { /* ignore */ }
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // 用户取消
        } else {
          onError(err.message || 'AI 分析服务异常');
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [],
  );

  /** 取消流式请求 */
  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  /** 选中解释 — 同步调用（走 axios，自动签名） */
  const analyzeExplain = useCallback(
    async (
      selectedHunks: DiffHunk[],
      language?: string | null,
      contextBefore?: string,
      contextAfter?: string,
    ): Promise<AIAnalysisResponse> => {
      const body = {
        mode: 'explain_selection',
        language: language || undefined,
        selectedHunks,
        contextBefore,
        contextAfter,
      };

      const res = await axiosInstance.post(`${BASE}/explain`, body);
      return res.data.data as AIAnalysisResponse;
    },
    [],
  );

  return {
    analyzeSummary,
    analyzeExplain,
    cancelStream,
    streaming,
    streamContent,
  };
};
