import { useRef, useCallback, useEffect } from 'react';
import { notificationService } from '../services/notificationService';

const POLL_INTERVAL_MS = 30_000;
const MAX_CONSECUTIVE_ERRORS = 3;

interface PollOptions {
  onUnreadCount: (total: number, byType: Record<string, number>) => void;
  onError: () => void;
  enabled: boolean;
}

/**
 * 通知轮询 Hook
 * - 30 秒间隔轮询 /api/messages/unread-count
 * - 页面不可见时暂停，可见时立即发起一次
 * - 连续失败 3 次触发 onError 回调
 */
export function useNotificationPoll({ onUnreadCount, onError, enabled }: PollOptions) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const mountedRef = useRef(false);

  // 用 ref 持有最新回调，避免闭包过期
  const callbacksRef = useRef({ onUnreadCount, onError, enabled });
  callbacksRef.current = { onUnreadCount, onError, enabled };

  const doPoll = useCallback(async () => {
    if (!callbacksRef.current.enabled) return;

    try {
      const result = await notificationService.getUnreadCount();
      if (!mountedRef.current) return;
      consecutiveErrorsRef.current = 0;
      callbacksRef.current.onUnreadCount(result.total, result.byType);
    } catch {
      if (!mountedRef.current) return;
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        callbacksRef.current.onError();
      }
    }
  }, []);

  const startPolling = useCallback(() => {
    if (timerRef.current) return; // 已在轮询
    doPoll(); // 立即发起一次
    timerRef.current = setInterval(doPoll, POLL_INTERVAL_MS);
  }, [doPoll]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 页面可见性监听
  useEffect(() => {
    mountedRef.current = true;

    const handleVisibility = () => {
      if (!callbacksRef.current.enabled) {
        stopPolling();
        return;
      }
      if (document.visibilityState === 'visible') {
        stopPolling();   // 先清除旧定时器
        startPolling();  // 立即发起 + 重新定时
      } else {
        stopPolling();
      }
    };

    // 初始启动
    if (enabled && document.visibilityState === 'visible') {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, startPolling, stopPolling]);

  // enabled 变化时启停
  useEffect(() => {
    if (enabled && document.visibilityState === 'visible') {
      startPolling();
    } else {
      stopPolling();
    }
  }, [enabled, startPolling, stopPolling]);

  return { doPoll, startPolling, stopPolling };
}
