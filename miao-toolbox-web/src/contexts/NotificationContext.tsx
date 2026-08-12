import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useNotificationPoll } from '../hooks/useNotificationPoll';
import {
  notificationService,
  type PagedMessagesResponse,
  type MessageDetailResponse,
} from '../services/notificationService';

interface NotificationState {
  unreadCount: number;
  unreadByType: Record<string, number>;
  pollError: boolean;
}

interface NotificationContextType extends NotificationState {
  /** 手动刷新未读数 */
  refreshUnreadCount: () => void;
  /** 外部更新未读数（如标记已读后） */
  setUnreadCount: (count: number, byType?: Record<string, number>) => void;
  /** 加载消息列表 */
  loadMessages: (params: { page?: number; pageSize?: number; type?: string; readStatus?: string }) => Promise<PagedMessagesResponse>;
  /** 加载消息详情 */
  loadMessageDetail: (messageId: number) => Promise<MessageDetailResponse>;
  /** 标记单条已读 */
  markAsRead: (messageId: number) => Promise<void>;
  /** 标记全部已读 */
  markAllAsRead: () => Promise<number>;
  /** 隐藏单条消息 */
  dismissMessage: (messageId: number) => Promise<void>;
  /** 批量隐藏消息 */
  dismissMessages: (messageIds: number[]) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotification(): NotificationContextType {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state: authState } = useAuth();
  const isLoggedIn = authState.isAuthenticated;

  const [notificationState, setNotificationState] = useState<NotificationState>({
    unreadCount: 0,
    unreadByType: {},
    pollError: false,
  });

  const handleUnreadCount = useCallback((total: number, byType: Record<string, number>) => {
    setNotificationState(prev => ({
      ...prev,
      unreadCount: total,
      unreadByType: byType,
      pollError: false,
    }));
  }, []);

  const handleError = useCallback(() => {
    setNotificationState(prev => ({ ...prev, pollError: true }));
  }, []);

  const { doPoll } = useNotificationPoll({
    onUnreadCount: handleUnreadCount,
    onError: handleError,
    enabled: isLoggedIn,
  });

  const refreshUnreadCount = useCallback(() => {
    doPoll();
  }, [doPoll]);

  const setUnreadCount = useCallback((count: number, byType?: Record<string, number>) => {
    setNotificationState(prev => ({
      ...prev,
      unreadCount: count,
      unreadByType: byType ?? prev.unreadByType,
      pollError: false,
    }));
  }, []);

  const loadMessages = useCallback(async (params: {
    page?: number;
    pageSize?: number;
    type?: string;
    readStatus?: string;
  }): Promise<PagedMessagesResponse> => {
    return notificationService.listMessages(params);
  }, []);

  const loadMessageDetail = useCallback(async (messageId: number): Promise<MessageDetailResponse> => {
    return notificationService.getMessageDetail(messageId);
  }, []);

  const markAsRead = useCallback(async (messageId: number): Promise<void> => {
    await notificationService.markAsRead(messageId);
    // 乐观更新：减少未读数
    setNotificationState(prev => ({
      ...prev,
      unreadCount: Math.max(0, prev.unreadCount - 1),
      pollError: false,
    }));
    doPoll();
  }, [doPoll]);

  const markAllAsRead = useCallback(async (): Promise<number> => {
    const result = await notificationService.markAllAsRead();
    // 乐观更新：立即清零未读数，不等轮询
    setNotificationState(prev => ({
      ...prev,
      unreadCount: 0,
      pollError: false,
    }));
    // 后台轮询确认
    doPoll();
    return result.count;
  }, [doPoll]);

  const dismissMessage = useCallback(async (messageId: number): Promise<void> => {
    await notificationService.dismissMessage(messageId);
    doPoll();
  }, [doPoll]);

  const dismissMessages = useCallback(async (messageIds: number[]): Promise<void> => {
    await notificationService.dismissMessages(messageIds);
    doPoll();
  }, [doPoll]);

  const value = useMemo<NotificationContextType>(() => ({
    ...notificationState,
    refreshUnreadCount,
    setUnreadCount,
    loadMessages,
    loadMessageDetail,
    markAsRead,
    markAllAsRead,
    dismissMessage,
    dismissMessages,
  }), [notificationState, refreshUnreadCount, setUnreadCount, loadMessages, loadMessageDetail, markAsRead, markAllAsRead, dismissMessage, dismissMessages]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
