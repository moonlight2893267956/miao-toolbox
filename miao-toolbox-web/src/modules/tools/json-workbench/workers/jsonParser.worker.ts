/**
 * JSON 解析 Web Worker
 *
 * Story 2.1: 当输入 >500KB 时自动启用，将 JSON.parse + 扁平化
 * 放到 Worker 线程执行，主线程保持可操作。
 *
 * 通过 Comlink 暴露 API，进度通过回调参数实时上报主线程。
 */
import * as Comlink from 'comlink';

// ─── 类型（与主线程 types/index.ts 一致，Worker 内独立定义避免跨模块依赖） ───

type JsonValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'array-ellipsis';

interface JsonNode {
  id: string;
  key: string;
  value: unknown;
  type: JsonValueType;
  depth: number;
  parentId: string | null;
  isExpanded: boolean;
  childrenCount: number;
  ellipsisCount?: number;
}

interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

interface ParseSuccess {
  parsed: unknown;
  flatNodes: JsonNode[];
}

interface ParseFailure {
  error: ParseError;
}

type ParseResult = ParseSuccess | ParseFailure;

// ─── 智能数组折叠常量 ──────────────────────────────────

const ARRAY_COLLAPSE_THRESHOLD = 10;
const ARRAY_PREVIEW_COUNT = 3;

// ─── 工具函数 ──────────────────────────────────────────

function getJsonValueType(value: unknown): JsonValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as JsonValueType;
}

function isExpandableType(type: JsonValueType): type is 'object' | 'array' {
  return type === 'object' || type === 'array';
}

function extractKeyFromPath(path: string): string {
  if (path === '$') return 'root';
  const arrayMatch = path.match(/\[(\d+)\]$/);
  if (arrayMatch) return `[${arrayMatch[1]}]`;
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex >= 0) return path.slice(dotIndex + 1);
  return path;
}

function safeKey(key: string): string {
  if (/[.[\]"']/.test(key)) {
    return `["${key.replace(/"/g, '\\"')}"]`;
  }
  return key;
}

// ─── 节点计数 ──────────────────────────────────────────

/**
 * 统计 JSON 树中扁平化后实际会生成的节点数（用于计算进度百分比）。
 * 与 flattenToJsonNodesWithProgress 使用相同的折叠规则，确保 total 准确。
 */
function countNodes(root: unknown, expandedArrayPaths: Set<string>, parentPath: string = '$'): number {
  let count = 0;
  const stack: Array<{ value: unknown; path: string; depth: number }> = [
    { value: root, path: parentPath, depth: 0 },
  ];

  while (stack.length > 0) {
    const { value, path, depth } = stack.pop()!;
    count++;

    if (value === null || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      const arr = value as unknown[];
      // 与 flattenToJsonNodesWithProgress 相同的折叠逻辑
      const shouldCollapse = arr.length > ARRAY_COLLAPSE_THRESHOLD && !expandedArrayPaths.has(path);
      if (shouldCollapse) {
        const previewCount = Math.min(ARRAY_PREVIEW_COUNT, arr.length);
        const ellipsisCount = arr.length - previewCount;
        if (ellipsisCount > 0) {
          count++; // ellipsis 占位节点
        }
        for (let i = previewCount - 1; i >= 0; i--) {
          stack.push({ value: arr[i], path: `${path}[${i}]`, depth: depth + 1 });
        }
      } else {
        for (let i = arr.length - 1; i >= 0; i--) {
          stack.push({ value: arr[i], path: `${path}[${i}]`, depth: depth + 1 });
        }
      }
    } else {
      const vals = Object.values(value as Record<string, unknown>);
      for (let i = vals.length - 1; i >= 0; i--) {
        stack.push({ value: vals[i], path: `${path}.${safeKey(Object.keys(value as Record<string, unknown>)[i])}`, depth: depth + 1 });
      }
    }
  }

  return count;
}

// ─── 带进度的扁平化（迭代式，避免递归栈溢出） ──────────

/**
 * 用显式栈（DFS 迭代，push/pop = O(1)）扁平化 JSON 对象为 JsonNode[]，
 * 每处理一个节点后回调 onStep。
 *
 * 替代原递归实现，根治 V8 调用栈溢出（1.3MB+ JSON 在 Worker 中爆栈）。
 * 使用 push/pop 替代 unshift/shift，避免 O(n²) 性能问题。
 */
function flattenToJsonNodesWithProgress(
  rootValue: unknown,
  rootPath: string,
  _rootParentId: string | null,
  _rootDepth: number,
  expandDepth: number,
  expandedArrayPaths: Set<string>,
  onStep: () => void,
): JsonNode[] {
  const nodes: JsonNode[] = [];
  const ellipsisPaths = new Set<string>(); // 追踪 ellipsis 占位路径，避免与真实 key "__ellipsis__" 冲突

  // 用数组模拟栈（push/pop = O(1)），实现 DFS 前序遍历
  const stack: Array<{ value: unknown; path: string; parentId: string | null; depth: number }> = [
    { value: rootValue, path: rootPath, parentId: _rootParentId, depth: _rootDepth },
  ];

  while (stack.length > 0) {
    const { value, path, parentId, depth } = stack.pop()!;

    const type = getJsonValueType(value);

    let childrenCount = 0;
    if (type === 'object' && value !== null) {
      childrenCount = Object.keys(value as Record<string, unknown>).length;
    } else if (type === 'array') {
      childrenCount = (value as unknown[]).length;
    }

    const isExpanded = depth <= expandDepth || expandedArrayPaths.has(path);

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
    onStep();

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
        // 智能数组折叠
        const shouldCollapse = arr.length > ARRAY_COLLAPSE_THRESHOLD && !expandedArrayPaths.has(path);
        if (shouldCollapse) {
          const previewCount = Math.min(ARRAY_PREVIEW_COUNT, arr.length);
          const ellipsisCount = arr.length - previewCount;

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
          for (let i = previewCount - 1; i >= 0; i--) {
            stack.push({
              value: arr[i],
              path: `${path}[${i}]`,
              parentId: path,
              depth: depth + 1,
            });
          }
        } else {
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

  // 后处理：ellipsis 占位节点
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

// ─── 主解析函数 ────────────────────────────────────────

function parseJsonInWorker(
  raw: string,
  expandDepth: number,
  expandedArrayPaths: Set<string>,
  onProgress: (pct: number) => void,
): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: { message: '请输入 JSON 文本' } };
  }

  onProgress(5);

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const message = err instanceof SyntaxError ? err.message : String(err);
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

  if (typeof parsed !== 'object' || parsed === null) {
    return { error: { message: 'JSON 顶层必须是对象 {} 或数组 []' } };
  }

  onProgress(15);

  // 计数总节点
  const total = countNodes(parsed, expandedArrayPaths);

  onProgress(20);

  // 带进度的扁平化
  let current = 0;
  let lastPct = 20;

  const flatNodes = flattenToJsonNodesWithProgress(
    parsed, '$', null, 0, expandDepth, expandedArrayPaths,
    () => {
      current++;
      const pct = 20 + Math.round((current / total) * 75);
      // 节流：只有百分比变化才回调
      if (pct > lastPct) {
        lastPct = pct;
        onProgress(pct);
      }
    },
  );

  onProgress(100);
  return { parsed, flatNodes };
}

// ─── Comlink 暴露 ──────────────────────────────────────

const workerApi = {
  parseJson(raw: string, expandDepth: number, expandedArrayPaths: Set<string>, onProgress: (pct: number) => void): ParseResult {
    return parseJsonInWorker(raw, expandDepth, expandedArrayPaths, onProgress);
  },
};

Comlink.expose(workerApi);

export type WorkerApi = typeof workerApi;
