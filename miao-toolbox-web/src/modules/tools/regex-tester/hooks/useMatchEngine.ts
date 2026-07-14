import { useEffect, useRef } from 'react';
import type { Dispatch } from 'react';
import type { RegexAction, RegexEngine, MatchResult, MatchDetail } from '../types';

const DEBOUNCE_MS = 300;
const TIMEOUT_MS = 1000;
const TIMEOUT_PREFIX = '__TIMEOUT__';

interface WorkerResponse {
  ok: boolean;
  matches?: MatchResult[];
  details?: MatchDetail[];
  replacedText?: string;
  error?: string;
}

/**
 * 核心匹配引擎（FR-1 / NFR-2）：
 * - 输入变化后 debounce 300ms 再执行，避免高频输入频繁重算（AC3 不闪烁）
 * - 匹配在 Web Worker 中执行，主线程用 1s 竞速：超时则 terminate worker 并显示警告，浏览器不卡死（AC5）
 * - 仅 JS 引擎实际执行匹配；非 JS 引擎本 story 仍用 JS 引擎高亮（架构 Frontend Boundary）
 */
export function useMatchEngine(
  pattern: string,
  flags: string,
  testText: string,
  replaceText: string,
  engine: RegexEngine,
  dispatch: Dispatch<RegexAction>,
) {
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    // 空正则：直接清空匹配，不启动 worker（替换即原文本，AC3 退化场景）
    if (!pattern) {
      dispatch({ type: 'REGEX_MATCH_SUCCESS', payload: { matches: [], matchDetails: [], replacedText: testText } });
      return;
    }

    const reqId = ++reqIdRef.current;

    const debounce = setTimeout(() => {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL('../matchWorker.ts', import.meta.url), {
          type: 'module',
        });
      }
      const worker = workerRef.current;

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        if (reqId !== reqIdRef.current) return; // 过期请求忽略
        if (timerRef.current) clearTimeout(timerRef.current);
        const data = e.data;
        if (data.ok) {
          const all = data.matches ?? [];
          const allDetails = data.details ?? [];
          // 非全局时仅取首个匹配用于计数与高亮（regex101 语义）
          const used = flags.includes('g') ? all : all.slice(0, 1);
          const usedDetails = flags.includes('g') ? allDetails : allDetails.slice(0, 1);
          dispatch({
            type: 'REGEX_MATCH_SUCCESS',
            payload: { matches: used, matchDetails: usedDetails, replacedText: data.replacedText ?? testText },
          });
        } else {
          dispatch({ type: 'REGEX_MATCH_ERROR', payload: data.error ?? '正则错误' });
        }
      };

      // 1s 超时防护（ReDoS）
      timerRef.current = setTimeout(() => {
        if (reqId !== reqIdRef.current) return;
        worker.terminate();
        workerRef.current = null;
        dispatch({
          type: 'REGEX_MATCH_ERROR',
          payload: `${TIMEOUT_PREFIX}正则可能存在灾难性回溯，请优化`,
        });
      }, TIMEOUT_MS);

      worker.postMessage({ pattern, flags, testText, replaceText });
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounce);
  }, [pattern, flags, testText, replaceText, engine, dispatch]);

  // 卸载清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);
}
