/**
 * 码表加载门控 Hook
 *
 * 状态机：idle → loading → ready | failed
 *
 * - chars chunk 在进入练习/复习/查码 Tab 时按需加载
 * - phrases 按**词组长度分成 3 个独立 chunk**，可分别加载：
 *   二字词 90KB / 三字词 32KB / 四字及以上 28KB（gzip 预算见构建脚本）。
 *   二字词练习只需拉 90KB，而不是把 150KB 全拉下来。
 * - 学习 Tab（字根图/教程/速查卡）不依赖码表，不受影响
 * - 加载失败显示错误卡 + 重试按钮
 *
 * 实现要点：
 * - 幂等判据放在 ref 中（不读 state），因此 load/retry 回调 identity 稳定
 * - 不在 setState updater 内做副作用（StrictMode 会双调用 updater）
 */

import { useState, useCallback, useRef } from 'react';
import { buildCharMap, buildPhraseMap, type CharMap, type PhraseMap } from './code';

export type DataStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** 词组长度分档：4plus = 4 字及以上 */
export type PhraseBucket = '2' | '3' | '4plus';

export const PHRASE_BUCKETS: PhraseBucket[] = ['2', '3', '4plus'];

/** 练习模式选定的词组长度 → 需要加载的 chunk */
export function bucketsForPhraseLength(length: 2 | 3 | 4 | 'multi'): PhraseBucket[] {
  if (length === 'multi') return [...PHRASE_BUCKETS];
  if (length === 2) return ['2'];
  if (length === 3) return ['3'];
  return ['4plus'];
}

export interface WubiDataState {
  chars: CharMap | null;
  charsStatus: DataStatus;
  charsError: string | null;
  /** 已加载的词组桶（按需填充） */
  phrases: Partial<Record<PhraseBucket, PhraseMap>>;
  phraseStatus: Record<PhraseBucket, DataStatus>;
  phraseError: Partial<Record<PhraseBucket, string | null>>;
}

const INITIAL_PHRASE_STATUS: Record<PhraseBucket, DataStatus> = {
  '2': 'idle',
  '3': 'idle',
  '4plus': 'idle',
};

const INITIAL_STATE: WubiDataState = {
  chars: null,
  charsStatus: 'idle',
  charsError: null,
  phrases: {},
  phraseStatus: { ...INITIAL_PHRASE_STATUS },
  phraseError: {},
};

interface CharsJson {
  entries: [string, string, number, string?][];
}

interface PhrasesJson {
  entries: [string, string][];
}

/**
 * 加载指定桶的 chunk。
 * Vite 需要**静态可分析**的动态 import 才能拆出 chunk，
 * 因此这里用 switch 写死三条 import，不能用模板字符串拼路径。
 */
const PHRASE_IMPORTERS: Record<PhraseBucket, () => Promise<PhrasesJson>> = {
  '2': () => import('../../data/generated/phrases-2.json').then((m) => m.default as unknown as PhrasesJson),
  '3': () => import('../../data/generated/phrases-3.json').then((m) => m.default as unknown as PhrasesJson),
  '4plus': () => import('../../data/generated/phrases-4plus.json').then((m) => m.default as unknown as PhrasesJson),
};

/** 便于消费方一次性拿到某组桶的合并结果 */
export interface PhraseData {
  /** 全部桶就绪时为合并后的映射，否则 null */
  map: PhraseMap | null;
  status: DataStatus;
  error: string | null;
}

export function useWubiData() {
  const [state, setState] = useState<WubiDataState>(INITIAL_STATE);

  // 幂等判据（ref，避免依赖 state 导致回调 identity 变化）
  const charsStatusRef = useRef<DataStatus>('idle');
  const phraseStatusRef = useRef<Record<PhraseBucket, DataStatus>>({ ...INITIAL_PHRASE_STATUS });

  // ── 单字码表 ──
  const loadChars = useCallback(() => {
    const st = charsStatusRef.current;
    if (st === 'ready' || st === 'loading') return;

    charsStatusRef.current = 'loading';
    setState((s) => ({ ...s, charsStatus: 'loading', charsError: null }));

    import('../../data/generated/chars.json')
      .then((mod) => {
        const data = mod.default as unknown as CharsJson;
        const charMap = buildCharMap(data.entries ?? []);
        charsStatusRef.current = 'ready';
        setState((s) => ({ ...s, chars: charMap, charsStatus: 'ready', charsError: null }));
      })
      .catch((err) => {
        charsStatusRef.current = 'failed';
        setState((s) => ({
          ...s,
          chars: null,
          charsStatus: 'failed',
          charsError: err?.message ?? '码表加载失败',
        }));
      });
  }, []); // identity 稳定

  const retryChars = useCallback(() => {
    charsStatusRef.current = 'idle';
    setState((s) => ({ ...s, charsStatus: 'idle', charsError: null }));
    loadChars();
  }, [loadChars]);

  // ── 词组码表（按桶）──
  const loadBucket = useCallback((bucket: PhraseBucket) => {
    const st = phraseStatusRef.current[bucket];
    if (st === 'ready' || st === 'loading') return;

    phraseStatusRef.current[bucket] = 'loading';
    setState((s) => ({
      ...s,
      phraseStatus: { ...s.phraseStatus, [bucket]: 'loading' },
      phraseError: { ...s.phraseError, [bucket]: null },
    }));

    PHRASE_IMPORTERS[bucket]()
      .then((data) => {
        const phraseMap = buildPhraseMap(data.entries ?? []);
        phraseStatusRef.current[bucket] = 'ready';
        setState((s) => ({
          ...s,
          phrases: { ...s.phrases, [bucket]: phraseMap },
          phraseStatus: { ...s.phraseStatus, [bucket]: 'ready' },
          phraseError: { ...s.phraseError, [bucket]: null },
        }));
      })
      .catch((err) => {
        phraseStatusRef.current[bucket] = 'failed';
        setState((s) => ({
          ...s,
          phraseStatus: { ...s.phraseStatus, [bucket]: 'failed' },
          phraseError: { ...s.phraseError, [bucket]: err?.message ?? '词组码表加载失败' },
        }));
      });
  }, []); // identity 稳定

  /** 加载一个或多个桶 */
  const loadPhrases = useCallback((buckets: PhraseBucket | PhraseBucket[]) => {
    const list = Array.isArray(buckets) ? buckets : [buckets];
    for (const b of list) loadBucket(b);
  }, [loadBucket]);

  const retryPhrases = useCallback((buckets: PhraseBucket | PhraseBucket[]) => {
    const list = Array.isArray(buckets) ? buckets : [buckets];
    for (const b of list) phraseStatusRef.current[b] = 'idle';
    setState((s) => {
      const nextStatus = { ...s.phraseStatus };
      const nextError = { ...s.phraseError };
      for (const b of list) {
        nextStatus[b] = 'idle';
        nextError[b] = null;
      }
      return { ...s, phraseStatus: nextStatus, phraseError: nextError };
    });
    for (const b of list) loadBucket(b);
  }, [loadBucket]);

  /*
   * 合并结果的缓存。
   *
   * !! 必须保证 map 的引用稳定 !!
   * 若每次调用都 `new Map(...)`，`phraseData.map` 每渲染一次就是新对象，
   * 会连带让下游 `buildSource` 的 useCallback 失效，
   * 进而让「码表就绪后自动启动」的 effect 每次渲染都重跑。
   *
   * 命中条件：桶组合相同 + 各桶的 PhraseMap 实例都没换（重试会换实例）。
   */
  const mergeCacheRef = useRef<{
    key: string;
    sources: (PhraseMap | undefined)[];
    merged: PhraseMap;
  } | null>(null);

  /** 取某组桶的合并结果（未全就绪时 map 为 null，但 status 会如实反映） */
  const phraseDataFor = useCallback((buckets: PhraseBucket | PhraseBucket[]): PhraseData => {
    const list = Array.isArray(buckets) ? buckets : [buckets];

    let status: DataStatus = 'ready';
    let error: string | null = null;

    for (const b of list) {
      const st = state.phraseStatus[b];
      if (st === 'failed') {
        status = 'failed';
        error = error ?? state.phraseError[b] ?? '词组码表加载失败';
      } else if (st === 'loading') {
        if (status !== 'failed') status = 'loading';
      } else if (st === 'idle') {
        if (status !== 'failed' && status !== 'loading') status = 'idle';
      }
    }

    const sources = list.map((b) => state.phrases[b]);
    if (sources.some((m) => m == null)) return { map: null, status, error };

    const key = list.join('+');
    const cache = mergeCacheRef.current;
    const hit = cache != null
      && cache.key === key
      && cache.sources.length === sources.length
      && cache.sources.every((m, i) => m === sources[i]);

    if (hit) return { map: cache!.merged, status, error };

    const merged = new Map(sources.flatMap((m) => Array.from(m!.entries())));
    mergeCacheRef.current = { key, sources: [...sources], merged };
    return { map: merged, status, error };
  }, [state.phraseStatus, state.phraseError, state.phrases]);

  return {
    state,
    loadChars,
    retryChars,
    loadPhrases,
    retryPhrases,
    phraseDataFor,
    /** chars 是否可用 */
    charsReady: state.charsStatus === 'ready' && state.chars !== null,
  };
}
