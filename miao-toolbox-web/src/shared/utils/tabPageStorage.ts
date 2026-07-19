/**
 * 按 Tab 维度持久化页面工作数据。
 *
 * - 刷新浏览器：数据仍在 localStorage，页面 remount 后恢复
 * - 关闭 Tab：由 TabContext 调用 clearPageState / clearPageStates 清除
 *
 * key 约定：`miao-page:{tabKey}`，tabKey 与 TabItem.key（makeTabKey(path)）一致。
 */

export const PAGE_STATE_PREFIX = 'miao-page:';

export function pageStorageKey(tabKey: string): string {
  return `${PAGE_STATE_PREFIX}${tabKey}`;
}

export function loadPageState<T>(tabKey: string): T | null {
  if (!tabKey) return null;
  try {
    const raw = localStorage.getItem(pageStorageKey(tabKey));
    if (raw == null || raw === '') return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function savePageState(tabKey: string, data: unknown): void {
  if (!tabKey) return;
  try {
    localStorage.setItem(pageStorageKey(tabKey), JSON.stringify(data));
  } catch {
    /* 隐私模式 / 配额超限等，静默失败 */
  }
}

export function clearPageState(tabKey: string): void {
  if (!tabKey) return;
  try {
    localStorage.removeItem(pageStorageKey(tabKey));
  } catch {
    /* ignore */
  }
}

export function clearPageStates(tabKeys: Iterable<string>): void {
  for (const key of tabKeys) {
    clearPageState(key);
  }
}

/** 清除所有 miao-page:* 缓存 */
export function clearAllPageStates(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k?.startsWith(PAGE_STATE_PREFIX)) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
