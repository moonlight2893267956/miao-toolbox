// JSON 工具台历史快照读写模块
// 负责把用户的提交式操作结果（rawJson）按时间顺序持久化，支持去重、上限裁剪与配额容错。
// 与页面状态缓存（tabPageStorage）完全隔离；storage 可注入以便单测，默认使用 localStorage。

export interface JsonSnapshot {
  id: string;
  rawJson: string;
  label: string;
  createdAt: number;
  charCount: number;
}

const STORAGE_KEY = 'miao-json-wb-history';
const MAX_SNAPSHOTS = 30;

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeRead(storage: Storage): JsonSnapshot[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (it): it is JsonSnapshot =>
        !!it &&
        typeof it.rawJson === 'string' &&
        typeof it.id === 'string' &&
        typeof it.createdAt === 'number',
    );
  } catch {
    return [];
  }
}

function safeWrite(storage: Storage, list: JsonSnapshot[]): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 配额超限：丢弃最旧的一条后重试一次；仍失败则静默放弃，不阻断主流程
    if (list.length > 1) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, list.length - 1)));
      } catch {
        /* 静默忽略 */
      }
    }
  }
}

// 列表以「最新在前」的顺序返回
export function loadHistory(storage?: Storage): JsonSnapshot[] {
  const s = resolveStorage(storage);
  if (!s) return [];
  return safeRead(s).sort((a, b) => b.createdAt - a.createdAt);
}

// 记录一条快照：新快照前置插入（存储即「最新在前」），与上一条内容相同则跳过（去重），
// 超过上限丢弃最旧。返回最新列表。采用前置插入而非依赖时间戳排序，避免毫秒级并发捕获时
// createdAt 相同导致顺序不确定。
export function captureSnapshot(rawJson: string, label: string, storage?: Storage): JsonSnapshot[] {
  const s = resolveStorage(storage);
  if (!s) return [];
  if (!rawJson || !rawJson.trim()) return loadHistory(s);
  const list = safeRead(s);
  const latest = list[0];
  if (latest && latest.rawJson === rawJson) {
    return loadHistory(s);
  }
  const snapshot: JsonSnapshot = {
    id: generateId(),
    rawJson,
    label,
    createdAt: Date.now(),
    charCount: rawJson.length,
  };
  const next = [snapshot, ...list];
  const trimmed = next.length > MAX_SNAPSHOTS ? next.slice(0, MAX_SNAPSHOTS) : next;
  safeWrite(s, trimmed);
  return loadHistory(s);
}

export function deleteSnapshot(id: string, storage?: Storage): JsonSnapshot[] {
  const s = resolveStorage(storage);
  if (!s) return [];
  const next = safeRead(s).filter((it) => it.id !== id);
  safeWrite(s, next);
  return loadHistory(s);
}

export function clearHistory(storage?: Storage): JsonSnapshot[] {
  const s = resolveStorage(storage);
  if (!s) return [];
  try {
    s.removeItem(STORAGE_KEY);
  } catch {
    /* 静默忽略 */
  }
  return [];
}
