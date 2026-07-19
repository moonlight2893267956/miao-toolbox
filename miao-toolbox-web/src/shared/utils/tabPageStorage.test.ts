import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_STATE_PREFIX,
  clearAllPageStates,
  clearPageState,
  clearPageStates,
  loadPageState,
  pageStorageKey,
  savePageState,
} from './tabPageStorage';

/** 最小内存 Storage，模拟 localStorage */
class MemStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('tabPageStorage', () => {
  let mem: MemStorage;

  beforeEach(() => {
    mem = new MemStorage();
    vi.stubGlobal('localStorage', mem);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves and loads page state by tab key', () => {
    savePageState('tools-network-url-parser', { input: 'https://a.com', error: null });
    expect(loadPageState<{ input: string }>('tools-network-url-parser')).toEqual({
      input: 'https://a.com',
      error: null,
    });
    expect(mem.getItem(pageStorageKey('tools-network-url-parser'))).toContain('https://a.com');
  });

  it('clearPageState removes only the target tab', () => {
    savePageState('a', { x: 1 });
    savePageState('b', { y: 2 });
    clearPageState('a');
    expect(loadPageState('a')).toBeNull();
    expect(loadPageState<{ y: number }>('b')).toEqual({ y: 2 });
  });

  it('clearPageStates removes multiple keys', () => {
    savePageState('a', 1);
    savePageState('b', 2);
    savePageState('c', 3);
    clearPageStates(['a', 'c']);
    expect(loadPageState('a')).toBeNull();
    expect(loadPageState('c')).toBeNull();
    expect(loadPageState('b')).toBe(2);
  });

  it('clearAllPageStates only removes miao-page prefix keys', () => {
    mem.setItem('user', 'keep-me');
    savePageState('tools-crypto', { activeTab: 'url' });
    clearAllPageStates();
    expect(mem.getItem('user')).toBe('keep-me');
    expect(mem.getItem(`${PAGE_STATE_PREFIX}tools-crypto`)).toBeNull();
  });

  it('returns null for empty tab key or invalid JSON', () => {
    expect(loadPageState('')).toBeNull();
    mem.setItem(pageStorageKey('broken'), '{not-json');
    expect(loadPageState('broken')).toBeNull();
  });
});
