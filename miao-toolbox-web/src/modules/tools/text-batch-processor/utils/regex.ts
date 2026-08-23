/**
 * 正则工具纯函数
 * - validateRegex：主线程即时校验（输入停顿即刷新，不依赖 Worker 往返）
 * - normalizeReplacement：${name} → $<name> 归一化（FR-5.5 / ARCH-12）
 */

export interface RegexValidation {
  valid: boolean;
  error: string | null;
}

/** 支持的 JS 正则标志位 */
export const JS_FLAGS = ['g', 'i', 'm', 's', 'u', 'y', 'd'];

/**
 * 校验正则是否合法。非法时返回包含错误原因的 error。
 * 复用 new RegExp 抛出的 message（浏览器本地化），并做中文化兜底。
 */
export function validateRegex(pattern: string, flags: string = ''): RegexValidation {
  if (!pattern) return { valid: true, error: null };
  // 过滤掉非法 flags：只保留 JS 支持的位，避免 "Invalid flags" 噪音
  const safeFlags = flags
    .split('')
    .filter((f) => JS_FLAGS.includes(f))
    .join('');
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern, safeFlags);
    return { valid: true, error: null };
  } catch (err) {
    const msg = (err as Error).message || '正则表达式无效';
    return { valid: false, error: msg };
  }
}

/**
 * 替换串归一化：将 `${name}` 命名引用写法转换为 JS 原生 `$<name>`。
 * 原生 `$<name>`、`$1` / `$2`、`$$` / `$&` 等保持原样。
 */
export function normalizeReplacement(text: string): string {
  return text.replace(/\$\{([a-zA-Z_$][\w$]*)\}/g, '$<$1>');
}
