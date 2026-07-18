/**
 * Cron AI 增强 Hook
 *
 * 调用后端 /api/cron/ai/stream（SSE 流式），支持五种任务：
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
import type { CronDialect } from '../types';

export type CronAITask = 'generate' | 'explain' | 'optimize' | 'diagnose' | 'convert';

export interface CronAIRequestParams {
  task: CronAITask;
  description?: string;
  expression?: string;
  dialect?: CronDialect;
  targetDialect?: CronDialect;
  phenomenon?: string;
  conversation?: { role: string; content: string }[];
}

export interface CronAIResult {
  task: CronAITask | null;
  expression: string | null;
  dialect: CronDialect | null;
  originalExpression: string | null;
  convertedExpression: string | null;
  /** 优化后的 Cron 表达式（optimize 任务，部分 Agent 用此字段名而非 expression） */
  optimizedExpression: string | null;
  explanation: string | null;
  suggestions: string[] | null;
  diagnosis: string | null;
  model: string | null;
  traceId: string | null;
}

function parseCronAiResult(
  full: string,
  params: CronAIRequestParams,
  traceId?: string,
): CronAIResult {
  const clean = cleanStreamText(full);
  const output = tryParseJsonObject(clean);

  const expression = pickString(output, clean, 'expression');
  let dialect: CronDialect | null = null;
  if (output?.dialect === 'linux5' || output?.dialect === 'spring6') {
    dialect = output.dialect;
  }
  const originalExpression = pickString(output, clean, 'originalExpression');
  const convertedExpression = pickString(output, clean, 'convertedExpression');
  const optimizedExpression = pickString(output, clean, 'optimizedExpression');
  const explanation = pickString(output, clean, 'explanation');
  const diagnosis = pickString(output, clean, 'diagnosis');
  const suggestions = pickSuggestions(output, clean);
  const model = pickString(output, clean, 'model');
  let resolvedTraceId = traceId ?? null;
  if (!resolvedTraceId && output?.trace_id) {
    resolvedTraceId = String(output.trace_id);
  }

  return {
    task: params.task,
    expression,
    dialect,
    originalExpression,
    convertedExpression,
    optimizedExpression,
    explanation,
    suggestions,
    diagnosis,
    model,
    traceId: resolvedTraceId,
  };
}

export function useCronAI() {
  const { invoke, cancel, reset, loading, streaming, streamText, result, error } =
    useSignedAiStream<CronAIRequestParams, CronAIResult>({
      endpoint: '/api/cron/ai/stream',
      parseResult: parseCronAiResult,
    });

  const generate = useCallback(
    (description: string, dialect?: CronDialect) =>
      invoke({ task: 'generate', description, dialect }),
    [invoke],
  );

  const explain = useCallback(
    (expression: string, dialect?: CronDialect) =>
      invoke({ task: 'explain', expression, dialect }),
    [invoke],
  );

  const optimize = useCallback(
    (expression: string, dialect?: CronDialect) =>
      invoke({ task: 'optimize', expression, dialect }),
    [invoke],
  );

  const diagnose = useCallback(
    (
      expression: string,
      phenomenon: string,
      dialect?: CronDialect,
      conversation?: { role: string; content: string }[],
    ) => invoke({ task: 'diagnose', expression, phenomenon, dialect, conversation }),
    [invoke],
  );

  const convert = useCallback(
    (expression: string, targetDialect: CronDialect, dialect?: CronDialect) =>
      invoke({ task: 'convert', expression, targetDialect, dialect }),
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
