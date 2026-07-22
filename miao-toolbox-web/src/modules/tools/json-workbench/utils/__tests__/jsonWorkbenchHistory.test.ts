import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadHistory,
  captureSnapshot,
  deleteSnapshot,
  clearHistory,
  type JsonSnapshot,
} from '../jsonWorkbenchHistory';

// 内存版 Storage，模拟浏览器 localStorage，便于断言持久化内容
class MemStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const storage = new MemStorage();

function captureMany(specs: Array<[string, string]>): JsonSnapshot[] {
  let list: JsonSnapshot[] = [];
  for (const [raw, label] of specs) {
    list = captureSnapshot(raw, label, storage);
  }
  return list;
}

describe('jsonWorkbenchHistory', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('空历史返回空数组', () => {
    expect(loadHistory(storage)).toEqual([]);
  });

  it('captureSnapshot 写入并置顶返回', () => {
    captureSnapshot('{}', '格式化', storage);
    const list = captureSnapshot('{"a":1}', '压缩', storage);
    expect(list.length).toBe(2);
    expect(list[0].rawJson).toBe('{"a":1}');
    expect(list[0].label).toBe('压缩');
    expect(list[0].charCount).toBe('{"a":1}'.length);
    expect(typeof list[0].id).toBe('string');
    expect(typeof list[0].createdAt).toBe('number');
  });

  it('与上一条内容相同则去重跳过', () => {
    captureSnapshot('{"a":1}', '格式化', storage);
    const list = captureSnapshot('{"a":1}', '压缩', storage);
    expect(list.length).toBe(1);
    expect(list[0].label).toBe('格式化');
  });

  it('超过上限 30 条时丢弃最旧', () => {
    const list = captureMany(
      Array.from({ length: 32 }, (_, i) => [`{"n":${i}}`, `op${i}`] as [string, string]),
    );
    expect(list.length).toBe(30);
    expect(list[0].rawJson).toBe('{"n":31}'); // 最新
    expect(list[29].rawJson).toBe('{"n":2}'); // 最旧保留的是 n:2（0、1 被丢弃）
  });

  it('空串/空白不记录', () => {
    const list = captureSnapshot('   ', '格式化', storage);
    expect(list).toEqual([]);
  });

  it('deleteSnapshot 按 id 删除', () => {
    const [first] = captureSnapshot('{"a":1}', '格式化', storage);
    captureSnapshot('{"b":2}', '压缩', storage);
    const list = deleteSnapshot(first.id, storage);
    expect(list.length).toBe(1);
    expect(list[0].rawJson).toBe('{"b":2}');
  });

  it('clearHistory 清空全部', () => {
    captureSnapshot('{"a":1}', '格式化', storage);
    const list = clearHistory(storage);
    expect(list).toEqual([]);
    expect(loadHistory(storage)).toEqual([]);
  });

  it('存储非法 JSON 时 loadHistory 容错返回空', () => {
    storage.setItem('miao-json-wb-history', 'not-a-valid-json');
    expect(loadHistory(storage)).toEqual([]);
  });
});
