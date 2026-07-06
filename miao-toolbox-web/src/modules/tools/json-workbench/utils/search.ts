/**
 * 搜索工具函数
 *
 * Story 2.4: 遍历完整 JSON 树（不受智能数组折叠影响），
 * 支持 key/value/regex 三种模式搜索。
 */
import type { SearchMode } from '../types';

/**
 * 在完整 JSON 对象树中搜索匹配的节点路径。
 * 不使用 flatNodeList（后者包含折叠省略），直接遍历原始解析对象。
 *
 * @param parsed 已解析的 JSON 对象
 * @param query  搜索关键词
 * @param mode   搜索模式（key/value/regex）
 * @returns 匹配节点的 JSONPath id 数组
 */
export function computeSearchResults(
  parsed: unknown,
  query: string,
  mode: SearchMode,
): string[] {
  const q = query.trim();
  if (!q || parsed === null || typeof parsed !== 'object') return [];

  // regex 模式：先验证正则合法性
  let regex: RegExp | null = null;
  if (mode === 'regex') {
    try { regex = new RegExp(q, 'i'); } catch { return []; }
  }

  const results: string[] = [];
  const qLower = q.toLowerCase();

  // 栈遍历完整 JSON 树（不做任何折叠，搜遍所有节点）
  const stack: Array<{ value: unknown; path: string; key: string }> = [
    { value: parsed, path: '$', key: 'root' },
  ];

  while (stack.length > 0) {
    const { value, path, key } = stack.pop()!;

    // 匹配判断
    let matched = false;
    if (mode === 'key') {
      matched = key.toLowerCase().includes(qLower);
    } else if (mode === 'value') {
      if (value !== null && value !== undefined && typeof value !== 'object') {
        matched = String(value).toLowerCase().includes(qLower);
      }
    } else if (mode === 'regex' && regex) {
      matched = regex.test(key)
        || (value !== null && value !== undefined && typeof value !== 'object' && regex.test(String(value)));
    }

    if (matched) results.push(path);

    // 推入子节点（全长遍历，不折叠）
    if (value !== null && typeof value === 'object') {
      if (Array.isArray(value)) {
        const arr = value as unknown[];
        for (let i = arr.length - 1; i >= 0; i--) {
          stack.push({ value: arr[i], path: `${path}[${i}]`, key: `[${i}]` });
        }
      } else {
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj);
        for (let i = keys.length - 1; i >= 0; i--) {
          const k = keys[i];
          stack.push({ value: obj[k], path: `${path}.${safeKey(k)}`, key: k });
        }
      }
    }
  }

  return results;
}

/** 安全转义 key 中的特殊字符（与 parseAndFlatten 保持一致） */
function safeKey(key: string): string {
  if (/[.[\]"']/.test(key)) {
    return `["${key.replace(/"/g, '\\"')}"]`;
  }
  return key;
}
