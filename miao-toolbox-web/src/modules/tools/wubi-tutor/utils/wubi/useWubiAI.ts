/**
 * 五笔 AI 解释 Hook。
 *
 * 调用后端 `/api/wubi/ai/explain`（**同步**）→ 后端经 `MiaoAiClient` 转发到
 * miao-ai 的 `wubi-explainer` agent。密钥不出后端：浏览器只跟自家 `/api` 说话。
 *
 * ── 为什么不用 useSignedAiStream（SSE）──
 *
 * 那个 Hook 给正则 / Cron 用：它们的回答是**长文本**，逐 token 推出来体验更好。
 * 而拆字解释要给出**结构化断言**（每一位的 key 与字根）交给前端逐条校验，
 * 流式只会让用户先看到半截 JSON。没有增量价值，就不引入流式的复杂度 ——
 * 与 json-workbench 的 ai-repair 同一形态。
 *
 * 接口形状刻意与 SSE 版保持一致（含 `streaming` / `streamText`）：
 * `SplitDemo` 因此一行都不用改 —— 少一处「因为换实现而顺手改坏的 UI」。
 *
 * !! AI 是可选增强，不是依赖 !!
 * 调用失败、超时、或**后校验不过**（见 aiExplain.ts），UI 都退回现有的确定性视图
 * （逐位候选字根 + notes）。练习本身永远不因为 AI 不可用而中断。
 */

import { useState, useCallback } from 'react';
import axiosInstance from '../../../../../services/axiosInstance';
import {
  buildExplainContext,
  parseWubiExplainResult,
  type WubiExplainResult,
} from './aiExplain';
import type { SplitResult } from './splitter';
import type { KeyError } from './session';

/**
 * 前端的等待上限。
 *
 * agent 内部最多两次尝试、每次模型超时 70s（见 agent.py），后端 read-timeout 也在
 * 这个量级 —— 前端给少了会在 agent 还在算的时候先断，用户看到的是「AI 不可用」，
 * 而实际上答案马上就好。这与 ai-repair 放宽到 5 分钟是同一个理由。
 */
const REQUEST_TIMEOUT_MS = 180_000;

export function useWubiAI() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WubiExplainResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * 解释某个字为什么这么拆。
   *
   * @param split   拆字算法的结果（候选字根由此进入上下文，模型的发挥空间被限制在里面）
   * @param mistake 用户这次的错误（可选）：带上它，解释才能点名具体的易混字根
   */
  const explainSplit = useCallback(async (split: SplitResult, mistake?: KeyError) => {
    setLoading(true);
    setResult(null);
    setError(null);

    const params = buildExplainContext(split, mistake);

    try {
      const res = await axiosInstance.post<Record<string, unknown>>(
        '/api/wubi/ai/explain',
        params,
        { timeout: REQUEST_TIMEOUT_MS },
      );

      /*
       * 复用流式版的解析器：它已经处理了「payload 被包在 output 层里」与
       * 「形状不对就返回 null」两种情况，且顺手做后校验。
       * 走同步反而少一层协议，把同一个解析器用两次是零成本的。
       */
      setResult(parseWubiExplainResult(JSON.stringify(res.data ?? {}), params));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error
        || (err as { message?: string })?.message
        || 'AI 解释失败';
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

  return {
    explainSplit,
    reset,
    loading,
    result,
    error,
    // 同步实现没有流式；保留这两个字段只为让 SplitDemo 的既有 JSX 不用改
    streaming: false,
    streamText: '',
  };
}
