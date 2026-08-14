import axiosInstance from './axiosInstance';

export interface UnreadCountResponse {
  total: number;
  byType: Record<string, number>;
}

export interface MessageResponse {
  id: number;
  title: string;
  summary: string;
  type: string;
  priority: string;
  senderId: number | null;
  read: boolean;
  createdAt: string;
  /** 管理员视角 */
  deleted?: boolean;
  editedAt?: string | null;
  recipientCount?: number;
  scope?: 'BROADCAST' | 'TARGETED';
  /** 是否含配图 */
  hasImage?: boolean;
}

export interface MessageDetailResponse {
  id: number;
  title: string;
  content: string;
  type: string;
  priority: string;
  senderId: number | null;
  /** 工具 ID（v1 预留） */
  toolId: string | null;
  /** 工具操作 ID（v1 预留） */
  toolOperationId: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  /** 图片预览 URL（后端代理端点），无图时为 null */
  imageUrl?: string | null;
}

export interface PagedMessagesResponse {
  items: MessageResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RecipientInfo {
  userId: number;
  username: string;
  email: string | null;
}

export interface SendMessageRequest {
  title: string;
  content: string;
  type?: string;
  priority?: string;
  scope?: 'BROADCAST' | 'TARGETED';
  userIds?: number[] | null;
  /** 消息配图 COS key */
  imageCosKey?: string | null;
}

export const notificationService = {
  async getUnreadCount(): Promise<UnreadCountResponse> {
    const response = await axiosInstance.get('/api/messages/unread-count');
    return response.data.data;
  },

  async listMessages(params: {
    page?: number;
    pageSize?: number;
    type?: string;
    readStatus?: string;
  }): Promise<PagedMessagesResponse> {
    const response = await axiosInstance.get('/api/messages', { params });
    return response.data.data;
  },

  async getMessageDetail(messageId: number): Promise<MessageDetailResponse> {
    const response = await axiosInstance.get(`/api/messages/${messageId}`);
    return response.data.data;
  },

  async markAsRead(messageId: number): Promise<void> {
    await axiosInstance.put(`/api/messages/${messageId}/read`);
  },

  async markAllAsRead(): Promise<{ count: number }> {
    const response = await axiosInstance.put('/api/messages/read-all');
    return response.data.data;
  },

  async sendMessage(data: SendMessageRequest): Promise<MessageResponse> {
    const response = await axiosInstance.post('/api/admin/messages', data);
    return response.data.data;
  },

  async dismissMessage(messageId: number): Promise<void> {
    await axiosInstance.delete(`/api/messages/${messageId}`);
  },

  async dismissMessages(messageIds: number[]): Promise<void> {
    await axiosInstance.delete('/api/messages', { data: messageIds });
  },

  // ==================== 消息配图 ====================

  /** 上传消息配图（管理员），返回 COS key */
  async uploadMessageImage(file: File): Promise<{ cosKey: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const resp = await axiosInstance.post('/api/admin/messages/upload-image', formData);
    return resp.data.data;
  },

  /** 通过后端代理端点获取消息图片 blob（需携带 JWT，故不能用 <img> 直接加载） */
  async fetchMessageImage(messageId: number): Promise<Blob> {
    const resp = await axiosInstance.get(`/api/messages/${messageId}/image`, {
      responseType: 'blob',
    });
    return resp.data;
  },

  // ==================== 公告管理（管理员） ====================

  async listAnnouncements(params: { page?: number; pageSize?: number }): Promise<PagedMessagesResponse> {
    const response = await axiosInstance.get('/api/admin/messages/announcements', { params });
    return response.data.data;
  },

  async updateAnnouncement(messageId: number, data: { title: string; content: string; imageCosKey?: string | null }): Promise<void> {
    await axiosInstance.put(`/api/admin/messages/announcements/${messageId}`, data);
  },

  async deleteAnnouncement(messageId: number): Promise<void> {
    await axiosInstance.delete(`/api/admin/messages/announcements/${messageId}`);
  },

  async getAnnouncementRecipients(messageId: number): Promise<RecipientInfo[]> {
    const response = await axiosInstance.get(`/api/admin/messages/announcements/${messageId}/recipients`);
    return response.data.data;
  },
};
