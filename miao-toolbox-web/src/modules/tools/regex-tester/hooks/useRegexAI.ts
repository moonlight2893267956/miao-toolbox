/**
 * 正则 AI 增强 Hook
 *
 * Epic 3 (FR-6/7/8): 调用后端 /api/regex/ai，
 * 支持三种任务：generate（自然语言生成正则）、explain（解释正则）、optimize（优化建议）。
 */
import { useState, useCallback } from 'react';
import axiosInstance from '../../../../services/axiosInstance';

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
  task: RegexAITask;
  pattern: string | null;
  explanation: string | null;
  suggestions: string[] | null;
  model: string | null;
  traceId: string | null;
}

export function useRegexAI() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegexAIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invoke = useCallback(async (params: RegexAIRequestParams) => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await axiosInstance.post<{ data: RegexAIResult }>(
        '/api/regex/ai',
        params,
        { timeout: 120000 }, // AI 生成可能较慢，2 分钟超时
      );
      setResult(res.data.data);
      return res.data.data;
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'AI 服务请求失败';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /** 自然语言生成正则 */
  const generate = useCallback(
    async (description: string, engine?: string) => {
      return invoke({ task: 'generate', description, engine });
    },
    [invoke],
  );

  /** 解释正则 */
  const explain = useCallback(
    async (pattern: string, flags?: string, engine?: string) => {
      return invoke({ task: 'explain', pattern, flags, engine });
    },
    [invoke],
  );

  /** 优化正则 */
  const optimize = useCallback(
    async (pattern: string, flags?: string, engine?: string) => {
      return invoke({ task: 'optimize', pattern, flags, engine });
    },
    [invoke],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    invoke,
    generate,
    explain,
    optimize,
    reset,
    loading,
    result,
    error,
  };
}
