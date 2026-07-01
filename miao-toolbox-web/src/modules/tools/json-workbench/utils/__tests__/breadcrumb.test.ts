import { describe, it, expect } from 'vitest';
import { parseJsonPathToSegments, getAncestorPaths } from '../breadcrumb';

// ─── parseJsonPathToSegments ───────────────────────────────

describe('parseJsonPathToSegments', () => {
  it('"$" 返回单一段 root', () => {
    const segments = parseJsonPathToSegments('$');

    expect(segments).toEqual([{ label: 'root', path: '$' }]);
  });

  it('空字符串返回单一段 root', () => {
    expect(parseJsonPathToSegments('')).toEqual([{ label: 'root', path: '$' }]);
  });

  it('简单属性路径 "$.data" 拆分为 root + data', () => {
    const segments = parseJsonPathToSegments('$.data');

    expect(segments).toEqual([
      { label: 'root', path: '$' },
      { label: 'data', path: '$.data' },
    ]);
  });

  it('深层属性路径逐段展开', () => {
    const segments = parseJsonPathToSegments('$.a.b.c');

    expect(segments).toEqual([
      { label: 'root', path: '$' },
      { label: 'a', path: '$.a' },
      { label: 'b', path: '$.a.b' },
      { label: 'c', path: '$.a.b.c' },
    ]);
  });

  it('数组索引路径 "$.users[3]" 拆分为 root + users + [3]', () => {
    const segments = parseJsonPathToSegments('$.users[3]');

    expect(segments).toEqual([
      { label: 'root', path: '$' },
      { label: 'users', path: '$.users' },
      { label: '[3]', path: '$.users[3]' },
    ]);
  });

  it('混合路径 "$.data.users[3].profile.name" 完整解析', () => {
    const segments = parseJsonPathToSegments('$.data.users[3].profile.name');

    expect(segments.map((s) => s.label)).toEqual([
      'root', 'data', 'users', '[3]', 'profile', 'name',
    ]);
    // 末段 path 应等于输入
    expect(segments[segments.length - 1].path).toBe('$.data.users[3].profile.name');
  });

  it('含特殊字符的 key（$["weird.key"]）正确解析', () => {
    // parseAndFlatten 生成的特殊 key 形式
    const segments = parseJsonPathToSegments('$["weird.key"]');

    expect(segments).toEqual([
      { label: 'root', path: '$' },
      { label: 'weird.key', path: '$["weird.key"]' },
    ]);
  });

  it('JSONPath 中的 $ 字符（合法 key 首字符）按属性处理', () => {
    // 在 JSONPath 规范中，$ 和 _ 是合法属性首字符
    const segments = parseJsonPathToSegments('$.$ref');

    expect(segments).toEqual([
      { label: 'root', path: '$' },
      { label: '$ref', path: '$.$ref' },
    ]);
  });

  it('顶层数组路径 "$[0]" 拆分为 root + [0]', () => {
    const segments = parseJsonPathToSegments('$[0]');

    expect(segments).toEqual([
      { label: 'root', path: '$' },
      { label: '[0]', path: '$[0]' },
    ]);
  });
});

// ─── getAncestorPaths ──────────────────────────────────────

describe('getAncestorPaths', () => {
  it('"$" 没有祖先，返回空数组', () => {
    expect(getAncestorPaths('$')).toEqual([]);
  });

  it('"$.data" 祖先只有根', () => {
    expect(getAncestorPaths('$.data')).toEqual(['$']);
  });

  it('"$.a.b.c" 祖先为 $ → $.a → $.a.b', () => {
    expect(getAncestorPaths('$.a.b.c')).toEqual(['$', '$.a', '$.a.b']);
  });

  it('"$.users[3].name" 祖先含数组索引路径', () => {
    expect(getAncestorPaths('$.users[3].name')).toEqual([
      '$',
      '$.users',
      '$.users[3]',
    ]);
  });

  it('不含目标节点自身', () => {
    const ancestors = getAncestorPaths('$.a.b');

    expect(ancestors).not.toContain('$.a.b');
  });
});
