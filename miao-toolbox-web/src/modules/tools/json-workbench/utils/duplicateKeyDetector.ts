/**
 * JSON 同级重复 key 检测器
 *
 * 标准 JSON.parse 对同级重复 key 只保留最后一个，前一个 key/value 会被静默丢弃，
 * 因此「同级出现 N 次」无法在 parse 之后从结果对象还原。必须在 parse 之前对原始文本
 * 做一次作用域感知的字符扫描，按对象作用域统计同级 key 出现次数，返回
 * `path -> 出现次数` 的 Map，再由扁平化层回填到对应节点。
 *
 * 返回 Map 的 key 与 parseAndFlatten 生成的节点 id 完全一致（复刻 safeKey 规则），
 * 因此可直接 O(1) 回填：node.siblingDuplicateCount = map.get(node.id) ?? 1。
 */

/**
 * 安全处理 key 中的特殊字符，与 parseAndFlatten.ts 的 safeKey 保持一致。
 * 若 key 包含 . [ ] " '，用引号包裹：`["a.b"]`。
 */
function safeKeyForPath(key: string): string {
  if (/[.[\]"']/.test(key)) {
    return `["${key.replace(/"/g, '\\"')}"]`;
  }
  return key;
}

/** 扫描状态中的一个对象/数组作用域 */
interface Scope {
  kind: 'object' | 'array';
  /** 当前作用域的根 JSONPath（扁平化节点 id），根对象为 "$" */
  path: string;
  /** 对象作用域：同级 key 出现次数累计 */
  keyCounts: Map<string, number>;
  /** 数组作用域：下一个元素索引 */
  arrayIndex: number;
}

/**
 * 扫描原始 JSON 文本，统计每个对象作用域内同级同名 key 的出现次数。
 *
 * 仅统计同一对象 `{}` 内部的重复 key；数组内元素、跨层级同名 key 不计入。
 * 正确处理字符串转义（\" \\ \/ \b \f \n \r \t \uXXXX）、字符串内的 { } [ ] 以及嵌套结构。
 *
 * @param raw 原始 JSON 文本
 * @returns path -> 同级同名 key 出现总次数（仅含出现 >1 次的 object 子节点 path）
 */
export function countSiblingKeyDuplicates(raw: string): Map<string, number> {
  const result = new Map<string, number>();
  const scopes: Scope[] = [];

  let i = 0;
  const n = raw.length;

  // 跳过前导空白后定位根值；空文本直接返回
  while (i < n && /\s/.test(raw[i])) i++;
  if (i >= n) return result;

  // 根作用域：顶层直接的 key 归属于根对象（path="$"）
  scopes.push({ kind: 'object', path: '$', keyCounts: new Map(), arrayIndex: 0 });

  let inString = false;
  let escape = false;
  let strBuffer = '';
  // 上一个非空白、非字符串内容的结构字符（{ } [ ] : , 或首个 value 起始符）
  let lastStructural = '';
  // 当前对象作用域内等待冒号确认的 key 名
  let pendingKey: string | null = null;
  // 冒号之后、进入子对象/数组之前暂存的 key，作为子作用域路径前缀
  let valueKeyForNextScope: string | null = null;

  while (i < n) {
    const ch = raw[i];

    if (inString) {
      if (escape) {
        // 转义字符（\" \\ \n 等）作为字面字符收集进 key（\uXXXX 粗略收集单个 n 不影响路径匹配）
        escape = false;
        strBuffer += ch;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        // 字符串结束
        inString = false;
        const top = scopes[scopes.length - 1];
        if (top && top.kind === 'object' && (lastStructural === '{' || lastStructural === ',')) {
          pendingKey = strBuffer;
        }
        strBuffer = '';
      } else {
        strBuffer += ch;
      }
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      escape = false;
      strBuffer = '';
      i++;
      continue;
    }

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '{' || ch === '[') {
      const parent = scopes[scopes.length - 1];
      // 计算新作用域在扁平化中的路径前缀：
      // - 父为数组：前缀 = 父路径[父当前元素索引]，并自增父的数组索引
      // - 父为对象且刚读完某 key：前缀 = 父路径.安全key（该 key 触发的子值）
      // - 其余（根对象首层、数组元素的标量值）：直接用父路径
      let childPath: string;
      if (parent.kind === 'array') {
        childPath = `${parent.path}[${parent.arrayIndex}]`;
        parent.arrayIndex++;
      } else if (parent.kind === 'object' && valueKeyForNextScope !== null) {
        childPath = `${parent.path}.${safeKeyForPath(valueKeyForNextScope)}`;
      } else {
        childPath = parent.path;
      }
      scopes.push({ kind: ch === '{' ? 'object' : 'array', path: childPath, keyCounts: new Map(), arrayIndex: 0 });
      lastStructural = ch;
      pendingKey = null;
      valueKeyForNextScope = null;
      i++;
      continue;
    }

    if (ch === '}' || ch === ']') {
      const closed = scopes.pop();
      if (closed && closed.kind === 'object') {
        for (const [k, count] of closed.keyCounts) {
          if (count > 1) {
            result.set(`${closed.path}.${safeKeyForPath(k)}`, count);
          }
        }
      }
      lastStructural = ch;
      pendingKey = null;
      valueKeyForNextScope = null;
      i++;
      continue;
    }

    if (ch === ':') {
      const top = scopes[scopes.length - 1];
      if (top && top.kind === 'object' && pendingKey !== null) {
        top.keyCounts.set(pendingKey, (top.keyCounts.get(pendingKey) ?? 0) + 1);
        valueKeyForNextScope = pendingKey;
      }
      pendingKey = null;
      lastStructural = ':';
      i++;
      continue;
    }

    if (ch === ',') {
      lastStructural = ',';
      pendingKey = null;
      i++;
      continue;
    }

    // 其余字符（true/false/null/数字/正负号等 value 起始）→ 仅推进，无嵌套作用域
    lastStructural = ch;
    i++;
  }

  return result;
}
