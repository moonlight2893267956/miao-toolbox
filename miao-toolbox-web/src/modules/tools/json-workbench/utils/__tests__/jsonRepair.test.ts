import { describe, it, expect } from 'vitest';
import { jsonRepair, canRepair } from '../jsonRepair';

describe('jsonRepair', () => {
  // ─── AC-1 & AC-2: 单引号 → 双引号 ──────────────────────

  it('修复单引号字符串', () => {
    const result = jsonRepair("{'name': 'test'}");
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.repaired).toBe('{"name": "test"}');
      expect(result.fixes).toHaveLength(1);
      expect(result.fixes[0].type).toBe('single-quotes');
      expect(result.fixes[0].count).toBe(2);
    }
  });

  it('修复嵌套单引号', () => {
    const result = jsonRepair("{'data': {'key': 'value'}}");
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(JSON.parse(result.repaired)).toEqual({ data: { key: 'value' } });
    }
  });

  it('单引号内含双引号时正确转义', () => {
    const result = jsonRepair("{'text': 'say \"hello\"'}");
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(JSON.parse(result.repaired)).toEqual({ text: 'say "hello"' });
    }
  });

  // ─── AC-3: 尾随逗号移除 ────────────────────────────────

  it('移除对象尾随逗号', () => {
    const result = jsonRepair('{"a": 1,}');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.repaired).toBe('{"a": 1}');
      expect(result.fixes.some((f) => f.type === 'trailing-comma')).toBe(true);
    }
  });

  it('移除数组尾随逗号', () => {
    const result = jsonRepair('[1, 2, 3,]');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.repaired).toBe('[1, 2, 3]');
    }
  });

  it('移除嵌套尾随逗号', () => {
    const result = jsonRepair('{"a": [1,], "b": {"c": 2,},}');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(JSON.parse(result.repaired)).toEqual({ a: [1], b: { c: 2 } });
    }
  });

  // ─── AC-4: 注释移除 ────────────────────────────────────

  it('移除 // 行注释', () => {
    const result = jsonRepair('{\n  "name": "test" // 这是注释\n}');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(JSON.parse(result.repaired)).toEqual({ name: 'test' });
      expect(result.fixes.some((f) => f.type === 'line-comment')).toBe(true);
    }
  });

  it('不移除字符串内的 //', () => {
    const result = jsonRepair('{"url": "https://example.com"}');
    expect('error' in result).toBe(true);
  });

  it('移除 /* */ 块注释', () => {
    const result = jsonRepair('{"a": 1 /* comment */, "b": 2}');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(JSON.parse(result.repaired)).toEqual({ a: 1, b: 2 });
      expect(result.fixes.some((f) => f.type === 'block-comment')).toBe(true);
    }
  });

  it('移除多行块注释', () => {
    const result = jsonRepair('{\n  "a": 1, /* line1\n   line2 */\n  "b": 2\n}');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(JSON.parse(result.repaired)).toEqual({ a: 1, b: 2 });
    }
  });

  // ─── 未引用的 key ──────────────────────────────────────

  it('为裸 key 加双引号', () => {
    const result = jsonRepair('{name: "test", age: 30}');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(JSON.parse(result.repaired)).toEqual({ name: 'test', age: 30 });
      expect(result.fixes.some((f) => f.type === 'unquoted-key')).toBe(true);
    }
  });

  // ─── 布尔值/null 大小写修复 ────────────────────────────

  it('修复 True/False/Null 大小写', () => {
    const result = jsonRepair('{"a": True, "b": False, "c": Null}');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(JSON.parse(result.repaired)).toEqual({ a: true, b: false, c: null });
      expect(result.fixes.some((f) => f.type === 'case-fix')).toBe(true);
    }
  });

  it('修复全大写 TRUE/FALSE/NULL', () => {
    const result = jsonRepair('{"a": TRUE, "b": FALSE, "c": NULL}');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(JSON.parse(result.repaired)).toEqual({ a: true, b: false, c: null });
    }
  });

  // ─── AC-5: 严重损坏无法修复 ────────────────────────────

  it('严重损坏返回错误', () => {
    const result = jsonRepair('{{{{{{{');
    expect('error' in result).toBe(true);
  });

  it('空输入返回错误', () => {
    const result = jsonRepair('');
    expect('error' in result).toBe(true);
  });

  it('空白输入返回错误', () => {
    const result = jsonRepair('   \n  ');
    expect('error' in result).toBe(true);
  });

  // ─── 组合修复 ──────────────────────────────────────────

  it('组合修复：单引号 + 尾随逗号', () => {
    const result = jsonRepair("{'name': 'test', 'age': 30,}");
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(JSON.parse(result.repaired)).toEqual({ name: 'test', age: 30 });
      expect(result.fixes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('组合修复：注释 + 单引号 + 尾随逗号 + 大小写', () => {
    const result = jsonRepair("{\n  'name': 'test', // name field\n  'active': True,\n}");
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(JSON.parse(result.repaired)).toEqual({ name: 'test', active: true });
    }
  });

  // ─── 无需修复 ──────────────────────────────────────────

  it('有效 JSON 返回"未检测到可修复错误"', () => {
    const result = jsonRepair('{"name": "test"}');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('未检测到');
    }
  });

  // ─── canRepair ─────────────────────────────────────────

  it('canRepair 对可修复的 JSON 返回 true', () => {
    expect(canRepair("{'name': 'test'}")).toBe(true);
    expect(canRepair('{"a": 1,}')).toBe(true);
  });

  it('canRepair 对有效 JSON 返回 false', () => {
    expect(canRepair('{"name": "test"}')).toBe(false);
  });

  it('canRepair 对严重损坏 JSON 返回 false', () => {
    expect(canRepair('{{{{{{{')).toBe(false);
  });
});
