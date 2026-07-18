// Cron 历史记录持久化单测（Story 2.3 / FR-18）
// 注入内存 Storage，无需浏览器环境；覆盖去重、截断、删除、清空、容错。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  addHistoryItem,
  removeHistoryItem,
  clearHistory,
  loadHistory,
  HISTORY_MAX,
  type CronHistoryItem,
} from './cronHistory';

/** 最小内存 Storage 实现，模拟 localStorage 行为 */
class MemStorage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

const mem = () => new MemStorage();

describe('cronHistory', () => {
  let storage: MemStorage;
  beforeEach(() => {
    storage = mem();
  });

  it('addHistoryItem 应新增一条并返回倒序列表', () => {
    const list = addHistoryItem('*/15 9-17 * * 1-5', 'linux5', storage);
    expect(list).toHaveLength(1);
    expect(list[0].expression).toBe('*/15 9-17 * * 1-5');
    expect(list[0].dialect).toBe('linux5');
    expect(typeof list[0].ts).toBe('number');
    expect(typeof list[0].id).toBe('string');
  });

  it('相同 expression + dialect 重复写入应去重并置顶', () => {
    addHistoryItem('a b c d e', 'linux5', storage);
    addHistoryItem('x y z * *', 'linux5', storage);
    const list = addHistoryItem('a b c d e', 'linux5', storage);
    expect(list).toHaveLength(2);
    expect(list[0].expression).toBe('a b c d e');
    expect(list.filter((i) => i.expression === 'a b c d e')).toHaveLength(1);
  });

  it('不同 dialect 的相同表达式应视为两条', () => {
    addHistoryItem('0 9 * * 1-5', 'linux5', storage);
    const list = addHistoryItem('0 9 * * 1-5', 'spring6', storage);
    expect(list).toHaveLength(2);
  });

  it('空表达式（trim 后为空）不应写入', () => {
    const before = loadHistory(storage);
    const after = addHistoryItem('   ', 'linux5', storage);
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(0);
  });

  it('写入应自动 trim 表达式', () => {
    const list = addHistoryItem('  */5 * * * *  ', 'linux5', storage);
    expect(list[0].expression).toBe('*/5 * * * *');
  });

  it('超过 HISTORY_MAX 应截断到上限', () => {
    let list: CronHistoryItem[] = [];
    for (let i = 0; i < HISTORY_MAX + 10; i += 1) {
      list = addHistoryItem(`0 ${i} * * *`, 'linux5', storage);
    }
    expect(list).toHaveLength(HISTORY_MAX);
    // 最新写入的应排在最前
    expect(list[0].expression).toBe(`0 ${HISTORY_MAX + 9} * * *`);
  });

  it('round-trip：写入后 loadHistory 可读取', () => {
    addHistoryItem('0 0 * * *', 'linux5', storage);
    const loaded = loadHistory(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].expression).toBe('0 0 * * *');
  });

  it('removeHistoryItem 删除指定记录', () => {
    const added = addHistoryItem('0 0 * * *', 'linux5', storage);
    const id = added[0].id;
    addHistoryItem('0 12 * * *', 'linux5', storage);
    const after = removeHistoryItem(id, storage);
    expect(after).toHaveLength(1);
    expect(after[0].expression).toBe('0 12 * * *');
    // 持久化也应更新
    expect(loadHistory(storage)).toHaveLength(1);
  });

  it('clearHistory 清空全部', () => {
    addHistoryItem('0 0 * * *', 'linux5', storage);
    addHistoryItem('0 12 * * *', 'linux5', storage);
    const cleared = clearHistory(storage);
    expect(cleared).toHaveLength(0);
    expect(loadHistory(storage)).toHaveLength(0);
  });

  it('loadHistory 对损坏数据容错返回空', () => {
    storage.setItem(
      'miao.cron.history.v1',
      '{ this is not valid json',
    );
    expect(loadHistory(storage)).toEqual([]);
    storage.setItem('miao.cron.history.v1', JSON.stringify([{ foo: 'bar' }]));
    expect(loadHistory(storage)).toEqual([]);
  });
});
