import { describe, it, expect } from 'vitest';
import {
  parseAndFlatten,
  getAllDescendantIds,
  getVisibleNodes,
  syncExpandedState,
} from '../parseAndFlatten';

// ─── 辅助函数 ──────────────────────────────────────────────

/**
 * 解析测试用的 JSON 文本为 { parsed, flatNodes }
 * - 失败时让用例直接 fail，给出清晰错误信息
 */
function parseOk(raw: string, expandDepth = 1) {
  const result = parseAndFlatten(raw, expandDepth);
  if ('error' in result) {
    throw new Error(`parseAndFlatten 失败: ${result.error.message}`);
  }
  return result;
}

// ─── TC-1: 正常解析（主线程路径 / 小文件） ──────────────────

describe('parseAndFlatten — 正常解析', () => {
  it('解析简单对象返回正确的扁平节点列表', () => {
    const result = parseOk('{"name": "test", "age": 30}');

    expect(result.parsed).toEqual({ name: 'test', age: 30 });
    // 根 + 2 个属性 = 3 节点
    expect(result.flatNodes).toHaveLength(3);
  });

  it('根节点 id 为 "$"、key 为 "root"、parentId 为 null', () => {
    const { flatNodes } = parseOk('{"a": 1}');
    const root = flatNodes[0];

    expect(root.id).toBe('$');
    expect(root.key).toBe('root');
    expect(root.parentId).toBeNull();
    expect(root.depth).toBe(0);
    expect(root.type).toBe('object');
  });

  it('解析嵌套对象：父子 id 形成 JSONPath 链', () => {
    const { flatNodes } = parseOk('{"user": {"name": "alice"}}');

    // $.user.name 应该是叶子节点
    const nameNode = flatNodes.find((n) => n.id === '$.user.name');
    expect(nameNode).toBeDefined();
    expect(nameNode?.value).toBe('alice');
    expect(nameNode?.type).toBe('string');
    expect(nameNode?.parentId).toBe('$.user');
  });

  it('解析数组：使用 [N] 作为 id 后缀', () => {
    const { flatNodes } = parseOk('[10, 20, 30]');

    expect(flatNodes.map((n) => n.id)).toEqual(['$', '$[0]', '$[1]', '$[2]']);
    expect(flatNodes[1].key).toBe('[0]');
    expect(flatNodes[1].value).toBe(10);
  });

  it('扁平列表包含所有节点（无论是否展开）', () => {
    const { flatNodes } = parseOk(
      '{"a": {"b": {"c": {"d": "deep"}}}}',
      1, // 只展开 1 层
    );

    // 5 层（根 + a + b + c + d）应全部出现在 flat list 中
    expect(flatNodes).toHaveLength(5);
    expect(flatNodes.some((n) => n.id === '$.a.b.c.d')).toBe(true);
  });

  it('expandDepth 控制 isExpanded：根和第一层展开，更深层折叠', () => {
    const { flatNodes } = parseOk(
      '{"a": {"b": {"c": 1}}}',
      1,
    );

    const root = flatNodes.find((n) => n.id === '$')!;
    const a = flatNodes.find((n) => n.id === '$.a')!;
    const b = flatNodes.find((n) => n.id === '$.a.b')!;

    expect(root.isExpanded).toBe(true);
    expect(a.isExpanded).toBe(true);
    expect(b.isExpanded).toBe(false);
  });

  it('expandDepth=0 只展开根节点', () => {
    const { flatNodes } = parseOk('{"a": {"b": 1}}', 0);

    expect(flatNodes[0].isExpanded).toBe(true);  // 根
    expect(flatNodes[1].isExpanded).toBe(false); // a
  });

  it('childrenCount 正确反映子节点数量', () => {
    const { flatNodes } = parseOk('{"users": [{"id": 1}, {"id": 2}, {"id": 3}]}');

    const root = flatNodes.find((n) => n.id === '$')!;
    const users = flatNodes.find((n) => n.id === '$.users')!;

    expect(root.childrenCount).toBe(1);    // 1 个 key
    expect(users.childrenCount).toBe(3);   // 3 个元素
  });

  it('包含特殊字符的 key 用 ["escaped"] 形式', () => {
    // 注：parseAndFlatten 实际生成的形式是 "$.[\"weird.key\"]"
    // （前缀 "." + safeKey），这是 Story 1.2 的实现细节。
    const { flatNodes } = parseOk('{"weird.key": 1, "weird[0]": 2}');

    const ids = flatNodes.map((n) => n.id);
    expect(ids).toContain('$.["weird.key"]');
    expect(ids).toContain('$.["weird[0]"]');
  });

  it('支持 null / boolean / number 多种值类型', () => {
    const { flatNodes } = parseOk(
      '{"a": null, "b": true, "c": false, "d": 0, "e": -1.5, "f": ""}',
    );

    const types = flatNodes
      .filter((n) => n.parentId !== null) // 排除根
      .map((n) => n.type);

    expect(types).toEqual(['null', 'boolean', 'boolean', 'number', 'number', 'string']);
  });
});

// ─── TC-9: 解析错误处理 ────────────────────────────────────

describe('parseAndFlatten — 错误处理', () => {
  it('语法错误返回 { error } 而非抛异常', () => {
    const result = parseAndFlatten('{"a": }');

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.message).toBeTruthy();
    }
  });

  it('顶层不是对象/数组返回明确错误', () => {
    const result = parseAndFlatten('"just a string"');

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.message).toBe('JSON 顶层必须是对象 {} 或数组 []');
    }
  });

  it('数字作为顶层返回明确错误', () => {
    const result = parseAndFlatten('42');

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.message).toContain('顶层');
    }
  });

  it('错误信息尝试提取行/列', () => {
    const raw = '{\n  "a": 1,\n  "b": @\n}';
    const result = parseAndFlatten(raw);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      // V8 错误信息通常包含 line/column；不强求类型但应被填充
      expect(result.error.message).toBeTruthy();
    }
  });

  it('错误信息去除 "JSON.parse: " 前缀（更友好）', () => {
    const result = parseAndFlatten('{ broken }');

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.message.startsWith('JSON.parse:')).toBe(false);
    }
  });
});

// ─── TC-10: 空输入处理 ──────────────────────────────────────

describe('parseAndFlatten — 空输入', () => {
  it('空字符串返回错误', () => {
    const result = parseAndFlatten('');

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.message).toBe('请输入 JSON 文本');
    }
  });

  it('仅空白返回错误（trim 后判定为空）', () => {
    expect('error' in parseAndFlatten('   ')).toBe(true);
    expect('error' in parseAndFlatten('\n\n  \t')).toBe(true);
  });

  it('首尾空白不影响正常解析', () => {
    const result = parseAndFlatten('  \n  {"a": 1}  \n  ');

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.parsed).toEqual({ a: 1 });
    }
  });
});

// ─── getAllDescendantIds: 展开/折叠前置 ───────────────────

describe('getAllDescendantIds', () => {
  it('返回指定节点的所有后代 id', () => {
    const { flatNodes } = parseOk(
      '{"a": {"b": 1, "c": {"d": 2}}}',
      0, // 不展开，便于观察
    );

    const descendantIds = getAllDescendantIds(flatNodes, '$.a');

    expect(descendantIds).toEqual(['$.a.b', '$.a.c', '$.a.c.d']);
  });

  it('叶子节点返回空数组', () => {
    const { flatNodes } = parseOk('{"a": 1}');
    const descendantIds = getAllDescendantIds(flatNodes, '$.a');

    expect(descendantIds).toEqual([]);
  });

  it('不存在的 id 返回空数组', () => {
    const { flatNodes } = parseOk('{"a": 1}');

    expect(getAllDescendantIds(flatNodes, '$.nonexistent')).toEqual([]);
  });

  it('数组节点正确返回所有元素的后代', () => {
    const { flatNodes } = parseOk('[{"x": 1}, {"x": 2}, {"x": 3}]');
    const descendantIds = getAllDescendantIds(flatNodes, '$');

    // 根是数组，后代是 $[0], $[0].x, $[1], $[1].x, $[2], $[2].x
    expect(descendantIds).toEqual([
      '$[0]', '$[0].x',
      '$[1]', '$[1].x',
      '$[2]', '$[2].x',
    ]);
  });
});

// ─── getVisibleNodes: 树形视图渲染前置 ─────────────────────

describe('getVisibleNodes', () => {
  it('getVisibleNodes 依赖 expandedIds 而非 flatNode.isExpanded', () => {
    // 注：getVisibleNodes 不读 flatNode.isExpanded，只看 expandedIds 集合。
    // expandDepth 只影响 flatNode.isExpanded 的初值。
    const { flatNodes } = parseOk('{"a": {"b": 1}, "c": 2}', 1);
    // 显式把 $ 和 $.a 都放进 expandedIds，才能让 $.a.b 可见
    const visible = getVisibleNodes(flatNodes, new Set(['$', '$.a']));

    const visibleIds = visible.map((n) => n.id);
    expect(visibleIds).toEqual(['$', '$.a', '$.a.b', '$.c']);
  });

  it('折叠 $.a 后 $.a.b 不再可见', () => {
    const { flatNodes } = parseOk('{"a": {"b": 1}}', 1);
    // expandedIds 为空集 → 没有节点被标记为展开
    const visible = getVisibleNodes(flatNodes, new Set());

    // 根可见，$.a 可见（虽然默认 isExpanded=true，但 getVisibleNodes 不依赖 flatNode.isExpanded）
    // 实际上：根 parentId=null 总是可见；$.a parentId=$ 可见且 $ 在 expandedIds? 这里没有
    // 所以只有根可见
    expect(visible.map((n) => n.id)).toEqual(['$']);
  });

  it('展开 $.a 后 $.a.b 可见', () => {
    const { flatNodes } = parseOk('{"a": {"b": 1}}', 0);
    // expandDepth=0 → 默认只有根展开
    const visible = getVisibleNodes(flatNodes, new Set(['$', '$.a']));

    expect(visible.map((n) => n.id)).toEqual(['$', '$.a', '$.a.b']);
  });

  it('空 flatNodeList 返回空', () => {
    expect(getVisibleNodes([], new Set())).toEqual([]);
  });
});

// ─── syncExpandedState: 展开/折叠状态同步 ─────────────────

describe('syncExpandedState', () => {
  it('根据 expandedIds 重新生成 isExpanded 标记', () => {
    const { flatNodes } = parseOk('{"a": {"b": 1}}', 0);
    // flatNodes 中只有根 isExpanded=true

    const synced = syncExpandedState(flatNodes, new Set(['$', '$.a']));

    expect(synced.find((n) => n.id === '$')!.isExpanded).toBe(true);
    expect(synced.find((n) => n.id === '$.a')!.isExpanded).toBe(true);
    expect(synced.find((n) => n.id === '$.a.b')!.isExpanded).toBe(false);
  });

  it('折叠根后所有节点 isExpanded=false', () => {
    const { flatNodes } = parseOk('{"a": 1}', 1);
    const synced = syncExpandedState(flatNodes, new Set());

    expect(synced.every((n) => !n.isExpanded)).toBe(true);
  });

  it('不修改原数组（返回新数组）', () => {
    const { flatNodes } = parseOk('{"a": 1}', 1);
    const originalExpanded = flatNodes[0].isExpanded;

    syncExpandedState(flatNodes, new Set());

    expect(flatNodes[0].isExpanded).toBe(originalExpanded);
  });
});

// ─── 性能/规模测试（基线） ────────────────────────────────

describe('parseAndFlatten — 性能基线', () => {
  it('1 万节点的扁平化在 <500ms 内完成（基线参考，非硬性 AC）', () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < 10_000; i++) {
      data[`key_${i}`] = { id: i, name: `item_${i}`, tags: ['a', 'b'] };
    }
    const raw = JSON.stringify(data);

    const start = performance.now();
    const result = parseAndFlatten(raw, 1);
    const elapsed = performance.now() - start;

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.flatNodes.length).toBeGreaterThan(20_000);
    }
    // 基线参考：CI 环境可能较慢，故只断言上限
    expect(elapsed).toBeLessThan(500);
  });
});
