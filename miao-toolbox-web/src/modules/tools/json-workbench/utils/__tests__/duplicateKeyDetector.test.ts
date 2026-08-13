import { describe, it, expect } from 'vitest';
import { countSiblingKeyDuplicates } from '../duplicateKeyDetector';

describe('countSiblingKeyDuplicates', () => {
  it('无重复 key 时返回空 Map', () => {
    const raw = `{"a":1,"b":2,"c":{"d":3}}`;
    expect(countSiblingKeyDuplicates(raw).size).toBe(0);
  });

  it('检测单个对象内的重复 key', () => {
    const raw = `{"a":1,"a":2}`;
    const map = countSiblingKeyDuplicates(raw);
    expect(map.get('$.a')).toBe(2);
    expect(map.size).toBe(1);
  });

  it('同级出现三次的 key 计数正确', () => {
    const raw = `{"x":1,"x":2,"x":3}`;
    const map = countSiblingKeyDuplicates(raw);
    expect(map.get('$.x')).toBe(3);
  });

  it('嵌套对象各自独立的重复 key 路径正确', () => {
    const raw = `{"outer":{"a":1,"a":2},"inner":{"a":3,"a":4}}`;
    const map = countSiblingKeyDuplicates(raw);
    expect(map.get('$.outer.a')).toBe(2);
    expect(map.get('$.inner.a')).toBe(2);
    expect(map.size).toBe(2);
  });

  it('数组内对象的重复 key 路径带索引', () => {
    const raw = `{"arr":[{"k":1,"k":2},{"k":3,"k":4}]}`;
    const map = countSiblingKeyDuplicates(raw);
    expect(map.get('$.arr[0].k')).toBe(2);
    expect(map.get('$.arr[1].k')).toBe(2);
    expect(map.size).toBe(2);
  });

  it('不同对象内的同名 key 不计入', () => {
    const raw = `{"o1":{"a":1},"o2":{"a":2}}`;
    const map = countSiblingKeyDuplicates(raw);
    expect(map.size).toBe(0);
  });

  it('字符串值内的花括号不干扰作用域统计', () => {
    const raw = `{"a":"{not a key}","a":2}`;
    const map = countSiblingKeyDuplicates(raw);
    expect(map.get('$.a')).toBe(2);
  });

  it('含转义字符的 key 正常统计', () => {
    const raw = `{"a\\"b":1,"a\\"b":2}`;
    const map = countSiblingKeyDuplicates(raw);
    expect(map.get('$.["a\\"b"]')).toBe(2);
  });

  it('含特殊字符（点、方括号）的 key 使用引号包裹路径', () => {
    const raw = `{"a.b":1,"a.b":2}`;
    const map = countSiblingKeyDuplicates(raw);
    expect(map.get('$.["a.b"]')).toBe(2);
  });

  it('根级多个重复 key 分别计数', () => {
    const raw = `{"x":1,"x":2,"y":3,"y":4,"z":5}`;
    const map = countSiblingKeyDuplicates(raw);
    expect(map.get('$.x')).toBe(2);
    expect(map.get('$.y')).toBe(2);
    expect(map.size).toBe(2);
  });

  it('压缩单行 JSON 也能正确统计', () => {
    const raw = `{"a":1,"b":{"c":2,"c":3}}`;
    const map = countSiblingKeyDuplicates(raw);
    expect(map.get('$.b.c')).toBe(2);
  });

  it('空文本返回空 Map', () => {
    expect(countSiblingKeyDuplicates('').size).toBe(0);
    expect(countSiblingKeyDuplicates('   ').size).toBe(0);
  });

  it('数组元素之间同名 key（跨元素）不计入', () => {
    const raw = `[{"k":1},{"k":2}]`;
    expect(countSiblingKeyDuplicates(raw).size).toBe(0);
  });
});
