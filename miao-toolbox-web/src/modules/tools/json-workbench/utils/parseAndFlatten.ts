/**
 * JSON 解析 + 扁平化核心函数
 *
 * 这是生成 flatNodeList 的唯一入口。
 * Web Worker 版本在 worker 线程调用同样的函数。
 * 不处理容错修复（那是 Story 1.6 的 jsonRepair.ts）。
 */

import type { JsonNode, JsonValueType, ParseError } from '../types';

// ─── 类型守卫 ──────────────────────────────────────────

function getJsonValueType(value: unknown): JsonValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as JsonValueType;
}

function isExpandableType(type: JsonValueType): type is 'object' | 'array' {
  return type === 'object' || type === 'array';
}

// ─── 智能数组折叠常量 ──────────────────────────────────

/** 超过此数量的数组默认折叠（只显示前 N 个元素） */
export const ARRAY_COLLAPSE_THRESHOLD = 10;
/** 折叠时显示前 N 个元素 */
export const ARRAY_PREVIEW_COUNT = 3;

// ─── 扁平化（迭代式，避免递归栈溢出） ──────────────────

/**
 * 用显式栈（BFS 迭代）将解析后的 JSON 对象扁平化为 JsonNode[]。
 *
 * 替代原递归实现，根治 V8 调用栈溢出（1.3MB+ JSON 在 Worker 中爆栈）。
 * 支持智能数组折叠：超过 ARRAY_COLLAPSE_THRESHOLD 的数组默认只展开前
 * ARRAY_PREVIEW_COUNT 个元素，末尾插入 array-ellipsis 占位节点。
 *
 * @param rootValue   根值
 * @param rootPath    根 JSONPath（"$"）
 * @param rootParentId 根节点父 id（null）
 * @param rootDepth   根深度（0）
 * @param expandDepth 默认展开到第几层（0 = 只展开根，1 = 展开根+第一层子节点）
 * @param expandedArrayPaths 已展开的大数组路径集合（点击"展开全部"时传入）
 */
function flattenToJsonNodes(
  rootValue: unknown,
  rootPath: string,
  rootParentId: string | null,
  rootDepth: number,
  expandDepth: number,
  expandedArrayPaths: Set<string> = new Set(),
): JsonNode[] {
  const nodes: JsonNode[] = [];
  const ellipsisPaths = new Set<string>(); // 追踪 ellipsis 占位路径，避免与真实 key "__ellipsis__" 冲突

  // 用数组模拟栈（push/pop = O(1)），实现 DFS 前序遍历
  // 反向推入子节点保证处理顺序与原递归版一致
  const stack: Array<{ value: unknown; path: string; parentId: string | null; depth: number }> = [
    { value: rootValue, path: rootPath, parentId: rootParentId, depth: rootDepth },
  ];

  while (stack.length > 0) {
    const { value, path, parentId, depth } = stack.pop()!;

    const type = getJsonValueType(value);

    // 计算子节点数量
    let childrenCount = 0;
    if (type === 'object' && value !== null) {
      childrenCount = Object.keys(value as Record<string, unknown>).length;
    } else if (type === 'array') {
      childrenCount = (value as unknown[]).length;
    }

    const isExpanded = depth <= expandDepth || expandedArrayPaths.has(path);

    // 当前节点
    nodes.push({
      id: path,
      key: extractKeyFromPath(path),
      value,
      type,
      depth,
      parentId,
      isExpanded,
      childrenCount,
    });

    // 将子节点推入栈（反向推入保证 pop 时顺序正确：object 按 key 顺序，array 按索引顺序）
    if (isExpandableType(type) && childrenCount > 0) {
      if (type === 'object') {
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj);
        for (let i = keys.length - 1; i >= 0; i--) {
          const key = keys[i];
          stack.push({
            value: obj[key],
            path: `${path}.${safeKey(key)}`,
            parentId: path,
            depth: depth + 1,
          });
        }
      } else {
        const arr = value as unknown[];
        // 智能数组折叠：大数组且未被用户展开时，只生成前 N 个子节点 + ellipsis 占位
        const shouldCollapse = arr.length > ARRAY_COLLAPSE_THRESHOLD && !expandedArrayPaths.has(path);
        if (shouldCollapse) {
          const previewCount = Math.min(ARRAY_PREVIEW_COUNT, arr.length);
          const ellipsisCount = arr.length - previewCount;

          // 先推入 ellipsis 占位节点（最后显示，所以最先推入栈）
          if (ellipsisCount > 0) {
            const ellipsisPath = `${path}.__ellipsis__`;
            ellipsisPaths.add(ellipsisPath);
            stack.push({
              value: ellipsisCount,
              path: ellipsisPath,
              parentId: path,
              depth: depth + 1,
            });
          }
          // 推入前 N 个元素（反向推入保证顺序）
          for (let i = previewCount - 1; i >= 0; i--) {
            stack.push({
              value: arr[i],
              path: `${path}[${i}]`,
              parentId: path,
              depth: depth + 1,
            });
          }
        } else {
          // 正常推入所有元素
          for (let i = arr.length - 1; i >= 0; i--) {
            stack.push({
              value: arr[i],
              path: `${path}[${i}]`,
              parentId: path,
              depth: depth + 1,
            });
          }
        }
      }
    }
  }

  // 后处理：将 ellipsis 占位节点的 value 转为正确的 type 和 ellipsisCount
  for (const node of nodes) {
    if (ellipsisPaths.has(node.id)) {
      node.type = 'array-ellipsis';
      node.ellipsisCount = node.value as number;
      node.value = undefined;
      node.isExpanded = false;
      node.childrenCount = 0;
    }
  }

  return nodes;
}

/**
 * 从 JSONPath 中提取显示用的 key。
 * "$" → "root"
 * "$.data" → "data"
 * "$.users[3]" → "[3]"
 * "$.data.name" → "name"
 */
function extractKeyFromPath(path: string): string {
  if (path === '$') return 'root';
  // 匹配数组索引 [N]
  const arrayMatch = path.match(/\[(\d+)\]$/);
  if (arrayMatch) return `[${arrayMatch[1]}]`;
  // 匹配普通属性 .key
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex >= 0) return path.slice(dotIndex + 1);
  return path;
}

/**
 * 安全处理 key 中的特殊字符。
 * 如果 key 包含 . 或 [ 或 ]，用引号包裹。
 */
function safeKey(key: string): string {
  if (/[.\[\]"']/.test(key)) {
    return `["${key.replace(/"/g, '\\"')}"]`;
  }
  return key;
}

// ─── 主函数 ────────────────────────────────────────────

export interface ParseSuccess {
  parsed: unknown;
  flatNodes: JsonNode[];
}

interface ParseFailure {
  error: ParseError;
}

type ParseResult = ParseSuccess | ParseFailure;

/**
 * 解析 JSON 文本并扁平化为节点列表。
 *
 * @param raw 原始 JSON 文本
 * @param expandDepth 默认展开到第几层（默认 1，即展开根+第一层子节点）
 * @param expandedArrayPaths 已展开的大数组路径集合（点击"展开全部"时传入）
 * @returns 成功返回 { parsed, flatNodes }，失败返回 { error }
 */
export function parseAndFlatten(raw: string, expandDepth: number = 1, expandedArrayPaths?: Set<string>): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: { message: '请输入 JSON 文本' } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const message = err instanceof SyntaxError ? err.message : String(err);
    // 尝试从错误信息中提取行/列
    const posMatch = message.match(/position\s+(\d+)/i);
    let line: number | undefined;
    let column: number | undefined;
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const beforeError = trimmed.slice(0, pos);
      line = (beforeError.match(/\n/g) || []).length + 1;
      column = pos - beforeError.lastIndexOf('\n');
    }
    return {
      error: {
        message: message.replace(/^JSON\.parse:\s*/i, ''),
        line,
        column,
      },
    };
  }

  // 确保顶层是 object 或 array
  if (typeof parsed !== 'object' || parsed === null) {
    return {
      error: { message: 'JSON 顶层必须是对象 {} 或数组 []' },
    };
  }

  const flatNodes = flattenToJsonNodes(parsed, '$', null, 0, expandDepth, expandedArrayPaths);
  return { parsed, flatNodes };
}

/**
 * 计算某个节点展开后应该显示的子节点 id 列表。
 * 用于 EXPAND_ALL 操作。
 */
export function getAllDescendantIds(nodes: JsonNode[], nodeId: string): string[] {
  const ids: string[] = [];
  const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
  if (nodeIndex < 0) return ids;

  const node = nodes[nodeIndex];

  // 从当前节点的下一个开始，找到所有深度更大的连续节点
  for (let i = nodeIndex + 1; i < nodes.length; i++) {
    if (nodes[i].depth <= node.depth) break;
    ids.push(nodes[i].id);
  }

  return ids;
}

/**
 * 根据 expandedIds 过滤出可见节点。
 * 一个节点可见 = 自身存在 + 所有祖先节点都已展开。
 */
export function getVisibleNodes(nodes: JsonNode[], expandedIds: Set<string>): JsonNode[] {
  const visible: JsonNode[] = [];
  const visibleParentIds = new Set<string>();

  for (const node of nodes) {
    if (node.parentId === null) {
      visible.push(node);
      visibleParentIds.add(node.id);
      continue;
    }
    // 父节点可见 + 父节点已展开 → 当前节点可见
    if (visibleParentIds.has(node.parentId) && expandedIds.has(node.parentId)) {
      visible.push(node);
      visibleParentIds.add(node.id);
    }
  }

  return visible;
}

/**
 * 展开/折叠节点后，重新生成 flatNodeList 中的 isExpanded 标记。
 * 注意：flat list 的顺序不变，只是 isExpanded 属性需要同步。
 */
export function syncExpandedState(nodes: JsonNode[], expandedIds: Set<string>): JsonNode[] {
  return nodes.map((node) => ({
    ...node,
    isExpanded: expandedIds.has(node.id),
  }));
}

/**
 * 在解析后的 JSON 对象中，按 JSONPath 设置值。
 * 用于树视图编辑后同步更新对象。
 *
 * @param obj   解析后的 JSON 对象
 * @param path  目标 JSONPath（如 "$.data.users[3].name"）
 * @param value 新值
 * @returns 修改后的新对象，失败返回 null
 */
export function setValueAtPath(obj: unknown, path: string, value: unknown): unknown | null {
  if (path === '$') {
    if (typeof value === 'object' && value !== null) return value;
    return null;
  }

  // 深拷贝根对象
  const root = JSON.parse(JSON.stringify(obj));
  const segments = parsePathSegments(path);
  let current: any = root;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof seg === 'number') {
      if (!Array.isArray(current) || seg >= current.length) return null;
      current = current[seg];
    } else {
      if (current === null || typeof current !== 'object') return null;
      current = current[seg];
    }
  }

  // 设置最后一个段的值
  const lastSeg = segments[segments.length - 1];
  if (typeof lastSeg === 'number') {
    if (!Array.isArray(current) || lastSeg >= current.length) return null;
    current[lastSeg] = value;
  } else {
    if (current === null || typeof current !== 'object') return null;
    current[lastSeg] = value;
  }

  return root;
}

/** 解析 JSONPath 为段数组: "$.data.users[3].name" → ["data", "users", 3, "name"] */
function parsePathSegments(path: string): Array<string | number> {
  // 去掉开头的 $\. 或 $
  const inner = path.startsWith('$.') ? path.slice(2) : path;
  const segments: Array<string | number> = [];
  const re = /(?:\\.|\[(\d+)\]|\["([^"]*)"\]|([^.[\]]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    if (m[1] !== undefined) {
      segments.push(parseInt(m[1], 10));
    } else if (m[2] !== undefined) {
      segments.push(m[2]);
    } else if (m[3] !== undefined) {
      segments.push(m[3]);
    }
  }
  return segments;
}

/**
 * 在解析后的 JSON 对象中，按 JSONPath 重命名键名（保持键顺序）。
 * 用于树视图 key 编辑后同步更新对象。
 *
 * @param obj     解析后的 JSON 对象
 * @param path    目标节点的 JSONPath（如 "$.data.users[3].name"）
 * @param newKey  新键名
 * @returns 修改后的新对象；失败（路径不存在/数组索引/重复键/相同键）返回 null
 */
export function renameKeyAtPath(obj: unknown, path: string, newKey: string): unknown | null {
  if (path === '$') return null; // 根节点无键名，不可重命名

  const root = JSON.parse(JSON.stringify(obj));
  const segments = parsePathSegments(path);
  const lastSeg = segments[segments.length - 1];

  // 数组索引不可重命名
  if (typeof lastSeg === 'number') return null;

  let current: any = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof seg === 'number') {
      if (!Array.isArray(current) || seg >= current.length) return null;
      current = current[seg];
    } else {
      if (current === null || typeof current !== 'object') return null;
      current = current[seg];
    }
  }

  // 父级必须是对象
  if (current === null || typeof current !== 'object' || Array.isArray(current)) return null;

  const oldKey = lastSeg as string;
  if (!(oldKey in current)) return null;
  if (oldKey === newKey) return null; // 无变化
  if (newKey in current) return null; // 重复键，拒绝

  // 保序重建：把 oldKey 位置替换为 newKey
  const rebuilt: Record<string, unknown> = {};
  for (const k of Object.keys(current)) {
    if (k === oldKey) {
      rebuilt[newKey] = current[oldKey];
    } else {
      rebuilt[k] = current[k];
    }
  }
  Object.keys(current).forEach((k) => delete current[k]);
  Object.assign(current, rebuilt);

  return root;
}
