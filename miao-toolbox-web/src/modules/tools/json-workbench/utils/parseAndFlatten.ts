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

// ─── 扁平化 ────────────────────────────────────────────

/**
 * 将解析后的 JSON 对象递归扁平化为 JsonNode[]。
 *
 * @param value   当前值
 * @param path    当前 JSONPath（如 "$.data.users[3]"）
 * @param parentId 父节点 id，根节点为 null
 * @param depth   嵌套深度
 * @param expandDepth 默认展开到第几层（0 = 只展开根，1 = 展开根+第一层子节点）
 */
function flattenToJsonNodes(
  value: unknown,
  path: string,
  parentId: string | null,
  depth: number,
  expandDepth: number,
): JsonNode[] {
  const type = getJsonValueType(value);
  const nodes: JsonNode[] = [];

  // 计算子节点数量
  let childrenCount = 0;
  if (type === 'object' && value !== null) {
    childrenCount = Object.keys(value as Record<string, unknown>).length;
  } else if (type === 'array') {
    childrenCount = (value as unknown[]).length;
  }

  const isExpanded = depth <= expandDepth;

  // 当前节点
  const currentNode: JsonNode = {
    id: path,
    key: extractKeyFromPath(path),
    value,
    type,
    depth,
    parentId,
    isExpanded,
    childrenCount,
  };
  nodes.push(currentNode);

  // 递归生成所有子节点（不管是否展开，flat list 必须包含全部节点）
  if (isExpandableType(type) && childrenCount > 0) {
    if (type === 'object') {
      const obj = value as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        const childPath = `${path}.${safeKey(key)}`;
        const childNodes = flattenToJsonNodes(obj[key], childPath, path, depth + 1, expandDepth);
        nodes.push(...childNodes);
      }
    } else {
      const arr = value as unknown[];
      for (let i = 0; i < arr.length; i++) {
        const childPath = `${path}[${i}]`;
        const childNodes = flattenToJsonNodes(arr[i], childPath, path, depth + 1, expandDepth);
        nodes.push(...childNodes);
      }
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

interface ParseSuccess {
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
 * @returns 成功返回 { parsed, flatNodes }，失败返回 { error }
 */
export function parseAndFlatten(raw: string, expandDepth: number = 1): ParseResult {
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

  const flatNodes = flattenToJsonNodes(parsed, '$', null, 0, expandDepth);
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
