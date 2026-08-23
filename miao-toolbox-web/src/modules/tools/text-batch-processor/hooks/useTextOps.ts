import { useEffect, useRef } from 'react';
import type { TextOpsMatch } from '../textOpsWorker';

const DEBOUNCE_MS = 300;
const TIMEOUT_MS = 1000;
export const TIMEOUT_PREFIX = '__TIMEOUT__';

export type TextOpsMode = 'extract' | 'replace';

export interface TextOpsResult {
  ok: boolean;
  matches: TextOpsMatch[];
  replacedText: string;
  error: string | null;
  timedOut: boolean;
}

interface TextOpsParams {
  pattern: string;
  flags: string;
  testText: string;
  replaceText: string;
  mode: TextOpsMode;
  onResult: (result: TextOpsResult) => void;
}

/**
 * 正则引擎 Hook（Story 3.1，复制 regex-tester useMatchEngine 模式）：
 * - 输入变化 debounce 300ms 再执行，避免高频输入频繁重算
 * - 匹配在 Web Worker 中执行，主线程 1s 竞速：超时 terminate worker + 警告，浏览器不卡死
 * - reqId 机制：过期请求忽略
 * - 空 pattern 不启动 Worker，直接返回空结果
 */
export function useTextOps({ pattern, flags, testText, replaceText, mode, onResult }: TextOpsParams) {
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!pattern) {
      onResultRef.current({
        ok: true,
        matches: [],
        replacedText: mode === 'replace' ? testText : '',
        error: null,
        timedOut: false,
      });
      return;
    }

    const reqId = ++reqIdRef.current;

    const debounce = setTimeout(() => {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL('../textOpsWorker.ts', import.meta.url), {
          type: 'module',
        });
      }
      const worker = workerRef.current;

      worker.onmessage = (e: MessageEvent) => {
        if (reqId !== reqIdRef.current) return; // 过期请求忽略
        if (timerRef.current) clearTimeout(timerRef.current);
        const data = e.data as { ok: boolean; matches?: TextOpsMatch[]; replacedText?: string; error?: string };
        if (data.ok) {
          onResultRef.current({
            ok: true,
            matches: data.matches ?? [],
            replacedText: data.replacedText ?? (mode === 'replace' ? testText : ''),
            error: null,
            timedOut: false,
          });
        } else {
          onResultRef.current({
            ok: false,
            matches: [],
            replacedText: mode === 'replace' ? testText : '',
            error: data.error ?? '正则错误',
            timedOut: false,
          });
        }
      };

      // 1s 超时防护（ReDoS）
      timerRef.current = setTimeout(() => {
        if (reqId !== reqIdRef.current) return;
        worker.terminate();
        workerRef.current = null;
        onResultRef.current({
          ok: false,
          matches: [],
          replacedText: mode === 'replace' ? testText : '',
          error: '正则可能存在灾难性回溯，请优化',
          timedOut: true,
        });
      }, TIMEOUT_MS);

      worker.postMessage({ pattern, flags, testText, replaceText, mode });
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounce);
  }, [pattern, flags, testText, replaceText, mode]);

  // 卸载清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);
}
