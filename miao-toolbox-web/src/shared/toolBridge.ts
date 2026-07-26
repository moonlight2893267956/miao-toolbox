/**
 * 工具间数据桥接
 *
 * 用于在工具页面之间传递数据（例如把 PHP 日志提取器的解析结果
 * 直接送到 JSON 工作台做美化 / 树形查看）。
 *
 * 机制：
 * 1. localStorage 持久化 —— 保证整页刷新后数据仍在
 * 2. CustomEvent 即时通知 —— 解决 KeepAlive 下目标页面已挂载、
 *    useReducer 初始化器不会重新执行的问题
 */

const STORAGE_KEY = 'tool-bridge:json-workbench';
const EVENT_KEY = 'tool-bridge:json-workbench';

/** 把一段 JSON 文本交给 JSON 工作台。 */
export function sendJsonToWorkbench(rawJson: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, rawJson);
  } catch {
    /* 存储不可用时静默忽略 */
  }
  /* 即使目标页面已挂载（KeepAlive），也能通过事件即时收到 */
  window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: rawJson }));
}

/**
 * JSON 工作台启动时调用：取回并清除待处理的输入，没有则返回 null。
 * 适用于首次挂载场景（useReducer 初始化器）。
 */
export function consumeJsonFromBridge(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v != null) {
      localStorage.removeItem(STORAGE_KEY);
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 监听桥接事件（KeepAlive 场景下目标页面已挂载时使用）。
 * 返回清理函数。
 */
export function onBridgeEvent(handler: (rawJson: string) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (typeof detail === 'string') {
      /* 事件到达说明数据已消费，清除 localStorage */
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      handler(detail);
    }
  };
  window.addEventListener(EVENT_KEY, listener);
  return () => window.removeEventListener(EVENT_KEY, listener);
}
