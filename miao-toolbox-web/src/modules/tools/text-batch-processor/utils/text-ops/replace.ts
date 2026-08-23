/**
 * 替换纯函数（Story 3.4）
 * - replacePlainText：普通文本模式查找替换（纯字符串，不走 Worker，无 ReDoS 风险）
 * - 正则模式替换由 textOpsWorker 的 replace 模式处理（String.replace 派生，支持 $1/${name}）
 */

export interface PlainReplaceOptions {
  /** 忽略大小写 */
  ignoreCase?: boolean;
  /** 全局替换（false 时仅替换首个） */
  global?: boolean;
}

export interface PlainReplaceResult {
  resultText: string;
  count: number;
}

/**
 * 普通文本查找替换：
 * - global=true 用 split/join 全量替换
 * - global=false 仅替换首个
 * - ignoreCase=true 用不区分大小写的方式匹配（但不替换原大小写差异，保持原文本替换为 replace 串）
 */
export function replacePlainText(
  input: string,
  find: string,
  replace: string,
  options: PlainReplaceOptions = {},
): PlainReplaceResult {
  if (typeof input !== 'string' || input === '') {
    return { resultText: '', count: 0 };
  }
  if (find === '') {
    return { resultText: input, count: 0 };
  }
  const { ignoreCase = false, global = true } = options;

  if (!ignoreCase) {
    if (!global) {
      const idx = input.indexOf(find);
      if (idx === -1) return { resultText: input, count: 0 };
      return {
        resultText: input.slice(0, idx) + replace + input.slice(idx + find.length),
        count: 1,
      };
    }
    const parts = input.split(find);
    if (parts.length === 1) return { resultText: input, count: 0 };
    return { resultText: parts.join(replace), count: parts.length - 1 };
  }

  // 忽略大小写：用正则（转义特殊字符）
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, global ? 'gi' : 'i');
  const m = input.match(re);
  if (!m) return { resultText: input, count: 0 };
  return { resultText: input.replace(re, () => replace), count: m.length };
}
