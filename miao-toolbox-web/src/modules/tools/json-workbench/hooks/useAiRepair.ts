/**
 * AI 修复 hook
 *
 * Story 3.2: 调用后端 /api/json-workbench/ai-repair，
 * 返回修复后的 JSON 文本供 diff 预览。
 */
import { useState, useCallback } from 'react';
import axiosInstance from '../../../../services/axiosInstance';

interface AiRepairResult {
  repaired: string;
}

export function useAiRepair() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const repair = useCallback(async (jsonText: string) => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await axiosInstance.post<AiRepairResult>(
        '/api/json-workbench/ai-repair',
        { jsonText },
        { timeout: 300000 }, // AI 修复大 JSON 可能较慢，放宽到 5 分钟
      );
      setResult(res.data.repaired);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'AI 修复失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return { repair, reset, loading, result, error };
}
