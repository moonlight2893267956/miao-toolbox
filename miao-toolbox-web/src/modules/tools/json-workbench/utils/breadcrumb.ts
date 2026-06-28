/**
 * 面包屑导航工具函数
 *
 * 将 JSONPath（如 $.data.users[3].profile.name）拆分为可点击的路径段，
 * 并支持从路径段重组 JSONPath 实现跳转。
 */

/** 面包屑路径段 */
export interface BreadcrumbSegment {
  /** 显示文本，如 "root" / "data" / "[3]" */
  label: string;
  /** 对应的 JSONPath，如 "$" / "$.data" / "$.data.users[3]" */
  path: string;
}

/**
 * 将 JSONPath 拆分为面包屑路径段
 *
 * @param jsonPath 如 "$.data.users[3].profile.name" 或 "$.data["key-with-dots"]"
 * @returns 路径段数组
 *
 * 算法：正则扫描，依次匹配三种 token：
 *   .key           → object 属性（简单 key）
 *   [n]            → 数组索引
 *   ["escaped"]    → object 属性（含特殊字符的 key，safeKey 生成）
 */
export function parseJsonPathToSegments(jsonPath: string): BreadcrumbSegment[] {
  if (!jsonPath || jsonPath === '$') {
    return [{ label: 'root', path: '$' }];
  }

  const segments: BreadcrumbSegment[] = [{ label: 'root', path: '$' }];

  let currentPath = '$';
  let remaining = jsonPath.slice(1); // 去掉开头的 $

  // 匹配 .key 或 [n] 或 ["escaped"]
  const tokenRegex = /^(\.([a-zA-Z_$][a-zA-Z0-9_$]*)|\[(\d+)\]|\["((?:[^"\\]|\\.)*)"\])/;

  while (remaining.length > 0) {
    const match = remaining.match(tokenRegex);
    if (!match) break;

    if (match[2] !== undefined) {
      // .key
      currentPath += `.${match[2]}`;
      segments.push({ label: match[2], path: currentPath });
    } else if (match[3] !== undefined) {
      // [n]
      currentPath += `[${match[3]}]`;
      segments.push({ label: `[${match[3]}]`, path: currentPath });
    } else if (match[4] !== undefined) {
      // ["escaped"] — 含特殊字符的 key
      const key = match[4].replace(/\\"/g, '"');
      currentPath += `["${match[4]}"]`;
      segments.push({ label: key, path: currentPath });
    }

    remaining = remaining.slice(match[0].length);
  }

  return segments;
}

/**
 * 获取从根到目标节点的祖先路径（不包含目标节点自身）
 *
 * @returns 祖先路径列表
 */
export function getAncestorPaths(jsonPath: string): string[] {
  const segments = parseJsonPathToSegments(jsonPath);
  return segments.slice(0, -1).map((s) => s.path);
}
