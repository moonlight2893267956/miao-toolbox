import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadSegmenter,
  getSegStatus,
  getCachedCut,
  resetSegmenter,
} from './segmenter';
import type { SegmenterModule, CutFn } from './segmenter';

const mockCut: CutFn = (text: string) => {
  if (text === '我喜欢编程') return ['我', '喜欢', '编程'];
  return text.split('');
};

function mockImporter(ok: boolean, withInit = true): () => Promise<SegmenterModule> {
  return async () => {
    const mod: SegmenterModule = { cut: mockCut };
    if (withInit) mod.default = async () => undefined;
    if (!ok) throw new Error('network error');
    return mod;
  };
}

describe('loadSegmenter', () => {
  beforeEach(() => {
    resetSegmenter();
    vi.restoreAllMocks();
  });

  // AC：加载成功 → ready + cut 可用
  it('加载成功返回 cut 函数，状态 ready', async () => {
    const cut = await loadSegmenter(mockImporter(true));
    expect(cut).toBe(mockCut);
    expect(getSegStatus()).toBe('ready');
    expect(getCachedCut()).toBe(mockCut);
    expect(cut!('我喜欢编程')).toEqual(['我', '喜欢', '编程']);
  });

  // AC：加载失败 → failed + 返回 null（降级）
  it('加载失败返回 null，状态 failed', async () => {
    const cut = await loadSegmenter(mockImporter(false));
    expect(cut).toBeNull();
    expect(getSegStatus()).toBe('failed');
    expect(getCachedCut()).toBeNull();
  });

  // AC：幂等——已加载后不再重复调用 importer
  it('加载成功后重复调用不重新加载', async () => {
    const importer = vi.fn(mockImporter(true));
    const a = await loadSegmenter(importer);
    const b = await loadSegmenter(importer);
    expect(a).toBe(mockCut);
    expect(b).toBe(mockCut);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  // AC：加载失败后重复调用会重试（inFlight 清空）
  it('失败后可重试', async () => {
    let fail = true;
    const importer = async () => {
      if (fail) throw new Error('down');
      return mockImporter(true)();
    };
    const first = await loadSegmenter(importer);
    expect(first).toBeNull();
    fail = false;
    const second = await loadSegmenter(importer);
    expect(second).toBe(mockCut);
    expect(getSegStatus()).toBe('ready');
  });

  // 并发调用共享同一次加载
  it('并发调用共享同一 inFlight', async () => {
    const importer = vi.fn(mockImporter(true));
    const [a, b] = await Promise.all([loadSegmenter(importer), loadSegmenter(importer)]);
    expect(a).toBe(mockCut);
    expect(b).toBe(mockCut);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  // 模块未导出 cut 视为失败
  it('模块缺少 cut 视为失败', async () => {
    const importer = async () => ({});
    const cut = await loadSegmenter(importer);
    expect(cut).toBeNull();
    expect(getSegStatus()).toBe('failed');
  });
});
