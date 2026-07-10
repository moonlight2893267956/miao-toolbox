import { useCallback, useRef, useEffect } from 'react';
import * as Comlink from 'comlink';
import type { JsonParseStateOptions, JsonWbAction } from '../types';
import { parseAndFlatten } from '../utils/parseAndFlatten';
import { jsonRepair } from '../utils/jsonRepair';
import type { WorkerApi } from '../workers/jsonParser.worker';

/** 启用 Web Worker 的文件大小阈值（字节） */
const WORKER_THRESHOLD = 500_000; // 500KB

/** 计算 UTF-8 字节大小（raw.length 是 UTF-16 码元数，CJK 内容会低估） */
function getByteSize(str: string): number {
  return new TextEncoder().encode(str).length;
}

/**
 * JSON 解析唯一入口 hook。
 *
 * Story 2.1: 输入 >500KB 时自动启用 Web Worker（通过 Comlink 封装），
 * 主线程保持可操作，Worker 解析期间通过进度回调实时上报。
 * 快速连续输入时通过版本号机制丢弃过期 Worker 结果。
 *
 * @param dispatch useReducer 的 dispatch 函数
 */
export function useJsonParser(dispatch: React.Dispatch<JsonWbAction>) {
  // ─── Worker 引用 ──────────────────────────────────────
  const workerRef = useRef<Worker | null>(null);
  const workerApiRef = useRef<Comlink.Remote<WorkerApi> | null>(null);
  const parseVersionRef = useRef(0);

  // 防抖计时器
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── 清理 Worker ──────────────────────────────────────

  useEffect(() => {
    return () => {
      // 组件卸载时终止 Worker，释放资源
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
        workerApiRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // ─── Worker 懒初始化 ──────────────────────────────────

  const getWorker = useCallback(async (): Promise<Comlink.Remote<WorkerApi>> => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/jsonParser.worker.ts', import.meta.url),
        { type: 'module' },
      );
      workerApiRef.current = Comlink.wrap<WorkerApi>(workerRef.current);
    }
    return workerApiRef.current!;
  }, []);

  // ─── 主解析 ──────────────────────────────────────────

  /**
   * 解析 JSON 文本并 dispatch 结果。
   *
   * - <500KB: 主线程同步解析（无额外开销）
   * - >500KB: Web Worker 后台解析 + 进度上报
   */
  const parse = useCallback(
    async (
      raw: string,
      expandDepth: number = 1,
      expandedArrayPaths: Set<string> = new Set(),
      options: JsonParseStateOptions = {},
    ) => {
      // 递增版本号，用于丢弃过期结果
      parseVersionRef.current++;
      const currentVersion = parseVersionRef.current;

      if (!raw.trim()) {
        dispatch({ type: 'JSON_WB_PARSE_ERROR', payload: { message: '请输入 JSON 文本' } });
        dispatch({ type: 'JSON_WB_SET_LARGE_FILE', payload: false });
        dispatch({ type: 'JSON_WB_SET_PARSE_PROGRESS', payload: 0 });
        return;
      }

      const isLarge = getByteSize(raw) > WORKER_THRESHOLD;

      // ── 大文件：Web Worker ───────────────────────────
      if (isLarge) {
        dispatch({ type: 'JSON_WB_SET_LARGE_FILE', payload: true });
        dispatch({ type: 'JSON_WB_SET_PARSE_PROGRESS', payload: 0 });

        try {
          const api = await getWorker();

          const result = await api.parseJson(
            raw,
            expandDepth,
            expandedArrayPaths,
            Comlink.proxy((pct: number) => {
              // 检查版本号，丢弃过期进度
              if (currentVersion !== parseVersionRef.current) return;
              dispatch({ type: 'JSON_WB_SET_PARSE_PROGRESS', payload: pct });
            }),
          );

          // 丢弃过期结果
          if (currentVersion !== parseVersionRef.current) return;

          if ('error' in result) {
            dispatch({ type: 'JSON_WB_PARSE_ERROR', payload: result.error });
          } else {
            dispatch({
              type: 'JSON_WB_PARSE_SUCCESS',
              payload: {
                parsed: result.parsed,
                flatNodes: result.flatNodes,
                preserveExpandedIds: options.preserveExpandedIds,
              },
            });
          }
          // 双重保险：显式重置进度和大文件标志，确保即使在 React 批量更新
          // 边界情况下，parseSuccess 之后进度条和文件标志也一定归零。
          dispatch({ type: 'JSON_WB_SET_PARSE_PROGRESS', payload: 0 });
          dispatch({ type: 'JSON_WB_SET_LARGE_FILE', payload: false });
        } catch (err) {
          if (currentVersion !== parseVersionRef.current) return;
          dispatch({
            type: 'JSON_WB_PARSE_ERROR',
            payload: {
              message: err instanceof Error ? `Worker 解析失败: ${err.message}` : 'Worker 解析失败',
            },
          });
          dispatch({ type: 'JSON_WB_SET_PARSE_PROGRESS', payload: 0 });
          dispatch({ type: 'JSON_WB_SET_LARGE_FILE', payload: false });
        }
        return;
      }

      // ── 小文件：主线程同步 ───────────────────────────
      dispatch({ type: 'JSON_WB_SET_LARGE_FILE', payload: false });
      dispatch({ type: 'JSON_WB_SET_PARSE_PROGRESS', payload: 0 });

      const result = parseAndFlatten(raw, expandDepth, expandedArrayPaths);
      if ('error' in result) {
        dispatch({ type: 'JSON_WB_PARSE_ERROR', payload: result.error });
      } else {
        dispatch({
          type: 'JSON_WB_PARSE_SUCCESS',
          payload: {
            parsed: result.parsed,
            flatNodes: result.flatNodes,
            preserveExpandedIds: options.preserveExpandedIds,
          },
        });
      }
    },
    [dispatch, getWorker],
  );

  /**
   * 防抖解析（用于 Raw 编辑器输入，500ms 防抖）
   */
  const debouncedParse = useCallback(
    (
      raw: string,
      expandDepth: number = 1,
      expandedArrayPaths: Set<string> = new Set(),
      options: JsonParseStateOptions = {},
    ) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        parse(raw, expandDepth, expandedArrayPaths, options).catch(() => {
          // parse 内部已通过 try/catch dispatch 错误，此处仅防止 unhandled rejection
        });
        timerRef.current = null;
      }, 500);
    },
    [parse],
  );

  /**
   * 尝试容错修复 JSON 文本。
   * 修复成功后设置预览，用户确认后应用。
   */
  const repair = useCallback(
    (raw: string) => {
      const result = jsonRepair(raw);
      if ('error' in result) {
        dispatch({ type: 'JSON_WB_REPAIR_FAIL', payload: result.error });
      } else {
        dispatch({ type: 'JSON_WB_SET_REPAIR_PREVIEW', payload: result });
      }
    },
    [dispatch],
  );

  /**
   * 应用修复结果：更新 rawJson 并重新解析。
   */
  const applyRepair = useCallback(
    (repaired: string) => {
      dispatch({ type: 'JSON_WB_SET_RAW', payload: repaired });
      parse(repaired).catch(() => {});
      dispatch({ type: 'JSON_WB_SET_REPAIR_PREVIEW', payload: null });
    },
    [parse, dispatch],
  );

  return { parse, debouncedParse, repair, applyRepair };
}
