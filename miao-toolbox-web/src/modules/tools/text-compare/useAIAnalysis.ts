import { useCallback, useRef, useState } from 'react';
import axiosInstance from '../../../services/axiosInstance';
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
        const body = {
          mode: 'summary',
          language: diffResult.language || undefined,
          statistics: diffResult.statistics,
          hunks: diffResult.hunks,
        };

        const response = await fetch(`${axiosInstance.defaults.baseURL}${BASE}/summary`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(_getAuthHeaders()),
          },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
          credentials: 'include',
        });

        if (!response.ok) {
          onError(`请求失败: ${response.status}`);
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
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);

                if (currentEvent === 'token') {
                  const token = parsed.token || '';
                  fullContent += token;
                  setStreamContent(fullContent);
                  onToken(token);
                } else if (currentEvent === 'done') {
                  onDone(parsed.trace_id);
                } else if (currentEvent === 'error') {
                  onError(parsed.message || 'AI 分析出错');
                } else if (currentEvent === 'output') {
                  // 非 generator 的完整输出
                  fullContent = JSON.stringify(parsed, null, 2);
                  setStreamContent(fullContent);
                }
              } catch {
                // 非 JSON 数据，忽略
              }
              currentEvent = '';
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

  /** 选中解释 — 同步调用 */
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

/** 从 cookie 或 localStorage 获取认证头 */
function _getAuthHeaders(): Record<string, string> {
  // axiosInstance 拦截器会自动处理 JWT token
  // 但 fetch API 不走 axios 拦截器，需要手动获取 token
  const token = localStorage.getItem('access_token');
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}
