/**
 * 正则 AI 增强 Hook
 *
 * 调用后端 /api/regex/ai/stream（SSE 流式），支持五种任务：
 * - generate / explain / optimize / diagnose / convert
 * 流式与签名由 useSignedAiStream 统一处理。
 */
import { useCallback } from 'react';
import { useSignedAiStream } from '../../../../hooks/useSignedAiStream';
import {
  cleanStreamText,
  pickString,
  pickSuggestions,
  tryParseJsonObject,
} from '../../../../services/aiStreamParse';

export type RegexAITask = 'generate' | 'explain' | 'optimize' | 'diagnose' | 'convert';

export interface RegexAIRequestParams {
  task: RegexAITask;
  description?: string;
  pattern?: string;
  flags?: string;
  engine?: string;
  targetEngine?: string;
  samples?: string[];
}

export interface RegexAIResult {
  task: RegexAITask | null;
  pattern: string | null;
  originalPattern: string | null;
  convertedPattern: string | null;
  diagnosis: string | null;
  engine: string | null;
  explanation: string | null;
  suggestions: string[] | null;
  model: string | null;
  traceId: string | null;
}

function parseRegexAiResult(
  full: string,
  params: RegexAIRequestParams,
  traceId?: string,
): RegexAIResult {
  const clean = cleanStreamText(full);
  const output = tryParseJsonObject(clean);

  const pattern = pickString(output, clean, 'pattern');
  const originalPattern = pickString(output, clean, 'originalPattern');
  const convertedPattern = pickString(output, clean, 'convertedPattern');
  const diagnosis = pickString(output, clean, 'diagnosis');
  const engine = pickString(output, clean, 'engine');
  let explanation = pickString(output, clean, 'explanation');
  const suggestions = pickSuggestions(output, clean);
  const model = pickString(output, clean, 'model');
  let resolvedTraceId = traceId ?? null;
  if (!resolvedTraceId && output?.trace_id) {
    resolvedTraceId = String(output.trace_id);
  }

  // 实在拿不到结构化字段时，保留原文作为兜底解释
  if (!pattern && !originalPattern && !convertedPattern && !diagnosis && !explanation) {
    explanation = clean || null;
  }

  return {
    task: params.task,
    pattern,
    originalPattern,
    convertedPattern,
    diagnosis,
    engine,
    explanation,
    suggestions,
    model,
    traceId: resolvedTraceId,
  };
}

export function useRegexAI() {
  const { invoke, cancel, reset, loading, streaming, streamText, result, error } =
    useSignedAiStream<RegexAIRequestParams, RegexAIResult>({
      endpoint: '/api/regex/ai/stream',
      parseResult: parseRegexAiResult,
    });

  const generate = useCallback(
    (description: string, engine = 'js') =>
      invoke({ task: 'generate', description, engine }),
    [invoke],
  );

  const explain = useCallback(
    (pattern: string, flags?: string, engine = 'js') =>
      invoke({ task: 'explain', pattern, flags, engine }),
    [invoke],
  );

  const optimize = useCallback(
    (pattern: string, flags?: string, engine = 'js') =>
      invoke({ task: 'optimize', pattern, flags, engine }),
    [invoke],
  );

  const diagnose = useCallback(
    (pattern: string, samples: string[], flags?: string, engine = 'js') =>
      invoke({ task: 'diagnose', pattern, samples, flags, engine }),
    [invoke],
  );

  const convert = useCallback(
    (pattern: string, targetEngine: string, flags?: string, engine?: string) =>
      invoke({ task: 'convert', pattern, targetEngine, flags, engine }),
    [invoke],
  );

  return {
    generate,
    explain,
    optimize,
    diagnose,
    convert,
    cancel,
    reset,
    loading,
    streaming,
    streamText,
    result,
    error,
  };
}
