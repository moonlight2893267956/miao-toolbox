import { useCallback, useRef } from 'react';
import type { JsonWbAction } from '../types';
import { parseAndFlatten } from '../utils/parseAndFlatten';
import { jsonRepair } from '../utils/jsonRepair';

/**
 * JSON 解析唯一入口 hook。
 *
 * 当前版本在主线程同步执行。
 * Story 2.1 加入 Web Worker（>500KB 自动切换）。
 *
 * @param dispatch useReducer 的 dispatch 函数
 */
export function useJsonParser(dispatch: React.Dispatch<JsonWbAction>) {
  // 防抖计时器
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 解析 JSON 文本并 dispatch 结果。
   * @param raw 原始 JSON 文本
   * @param expandDepth 默认展开深度（默认 1）
   */
  const parse = useCallback(
    (raw: string, expandDepth: number = 1) => {
      if (!raw.trim()) {
        dispatch({ type: 'JSON_WB_PARSE_ERROR', payload: { message: '请输入 JSON 文本' } });
        return;
      }

      const result = parseAndFlatten(raw, expandDepth);
      if ('error' in result) {
        dispatch({ type: 'JSON_WB_PARSE_ERROR', payload: result.error });
      } else {
        dispatch({
          type: 'JSON_WB_PARSE_SUCCESS',
          payload: { parsed: result.parsed, flatNodes: result.flatNodes },
        });
      }
    },
    [dispatch],
  );

  /**
   * 防抖解析（用于 Raw 编辑器输入，500ms 防抖）
   */
  const debouncedParse = useCallback(
    (raw: string, expandDepth: number = 1) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        parse(raw, expandDepth);
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
      parse(repaired);
      dispatch({ type: 'JSON_WB_SET_REPAIR_PREVIEW', payload: null });
    },
    [parse, dispatch],
  );

  return { parse, debouncedParse, repair, applyRepair };
}
