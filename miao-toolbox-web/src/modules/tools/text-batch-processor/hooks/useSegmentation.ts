import { useEffect, useRef, useState, useCallback } from 'react';
import { loadSegmenter, getSegStatus, getCachedCut } from '../utils/segmenter';
import type { SegStatus, CutFn } from '../utils/segmenter';

export interface UseSegmentationResult {
  segStatus: SegStatus;
  cut: CutFn | null;
  load: () => Promise<CutFn | null>;
}

/**
 * 中文分词 Hook（Story 4.2）：
 * - 首次挂载（切换至词频 Tab）触发 loadSegmenter()
 * - segStatus 驱动 UI：idle → loading → ready / failed
 * - 加载失败返回 cut=null，调用方降级为「按字」统计
 * - 模块级单例，重复挂载不重复加载
 */
export function useSegmentation(): UseSegmentationResult {
  const [segStatus, setSegStatus] = useState<SegStatus>(getSegStatus());
  // 注意：useState 的初始值如果是「函数」，React 会当作 lazy initializer 调用！
  // getCachedCut() 可能返回 cut 函数本身，必须包一层箭头函数，
  // 否则切 Tab 回来重新挂载时 React 会执行 cut(undefined) 导致崩溃。
  const [rawCut, setRawCut] = useState<CutFn | null>(() => getCachedCut());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // 已加载/已失败：直接同步（不重复加载）
    const current = getSegStatus();
    if (current === 'ready' || current === 'failed') {
      setSegStatus(current);
      // 注意：setState 传函数会被 React 当作 updater 调用！
      // 必须包一层 ()=>fn，否则 React 会执行 fn(prevState)，若 fn 是 cut 函数就会误调用
      setRawCut(() => getCachedCut());
      return;
    }
    // idle/loading：加载（loading 状态由模块管理）
    let cancelled = false;
    loadSegmenter().then((fn) => {
      if (cancelled || !mounted.current) return;
      setRawCut(() => fn);
      setSegStatus(fn ? 'ready' : 'failed');
    });
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const fn = await loadSegmenter();
    if (mounted.current) {
      setRawCut(() => fn);
      setSegStatus(fn ? 'ready' : 'failed');
    }
    return fn;
  }, []);

  // 安全包装：分词器任何异常（WASM 未就绪/HMR 失效）都返回空数组，
  // 由调用方（wordFrequency）降级为按字统计，UI 永不崩溃
  const cut = useCallback<CutFn>(
    (text) => {
      if (!rawCut) return [];
      try {
        const r = rawCut(text);
        return Array.isArray(r) ? r : [];
      } catch {
        return [];
      }
    },
    [rawCut],
  );

  return { segStatus, cut, load };
}
