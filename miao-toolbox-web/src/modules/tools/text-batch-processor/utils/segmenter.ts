/**
 * 中文分词器（Story 4.2）：jieba-wasm 懒加载 + 缓存 + 失败降级
 *
 * - 首次调用 loadSegmenter() 才动态 import('jieba-wasm')（Vite 拆分为独立 chunk）
 * - 模块级单例：加载成功后不再重复加载
 * - 失败返回 null，调用方降级为「按字」切分
 */

export type SegStatus = 'idle' | 'loading' | 'ready' | 'failed';

export type CutFn = (text: string) => string[];

export interface SegmenterModule {
  default?: (initInput?: unknown) => Promise<unknown>;
  cut?: CutFn;
}

let status: SegStatus = 'idle';
let cachedCut: CutFn | null = null;
let inFlight: Promise<CutFn | null> | null = null;

/** 当前分词状态（单例） */
export function getSegStatus(): SegStatus {
  return status;
}

/** 已缓存的分词函数（ready 时可用） */
export function getCachedCut(): CutFn | null {
  return cachedCut;
}

/** 重置单例状态（仅测试用） */
export function resetSegmenter(): void {
  status = 'idle';
  cachedCut = null;
  inFlight = null;
}

/**
 * 加载分词器（惰性、幂等）。
 * @param importer 注入的动态 import，默认 jieba-wasm（测试时可 mock）
 * @returns cut 函数；失败返回 null
 */
export function loadSegmenter(
  importer: () => Promise<SegmenterModule> = () => import('jieba-wasm') as unknown as Promise<SegmenterModule>,
): Promise<CutFn | null> {
  if (cachedCut) return Promise.resolve(cachedCut);
  if (inFlight) return inFlight;

  status = 'loading';
  inFlight = (async () => {
    try {
      const mod = await importer();
      // web 版需先初始化 WASM
      if (typeof mod.default === 'function') {
        await mod.default();
      }
      if (typeof mod.cut !== 'function') {
        throw new Error('jieba-wasm 未导出 cut');
      }
      // 试调用验证 WASM 真正就绪（避免 HMR/时序导致 cut 闭包引用未初始化的内存）
      const probe = mod.cut('测试');
      if (!Array.isArray(probe) || probe.length === 0) {
        throw new Error('jieba-wasm 初始化未完成');
      }
      cachedCut = mod.cut;
      status = 'ready';
      return cachedCut;
    } catch {
      status = 'failed';
      cachedCut = null;
      inFlight = null;
      return null;
    }
  })();

  return inFlight;
}
