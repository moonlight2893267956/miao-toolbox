import axiosInstance from './axiosInstance';

export interface AuditLogItem {
  id: number;
  userId: number;
  toolId: string;
  requestSummary: string;
  responseStatus: string;
  durationMs: number | null;
  tokenConsumption: number | null;
  createdAt: string;
}

export interface AuditLogQuery {
  startTime?: string;
  endTime?: string;
  userId?: number;
  toolId?: string;
  responseStatus?: string;
  page?: number;
  pageSize?: number;
}

export interface PagedAuditLogs {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ToolCallCount {
  toolId: string;
  count: number;
}

export interface DailyErrorCount {
  date: string;
  count: number;
}

export interface DashboardStats {
  todayTotalCalls: number;
  todayErrorCalls: number;
  onlineUsers: number;
  totalUsers: number;
  toolCallDistribution: ToolCallCount[];
  errorTrend7d: DailyErrorCount[];
  rateLimitHits: number;
}

/** 查询审计日志 */
export async function getAuditLogs(query: AuditLogQuery): Promise<PagedAuditLogs> {
  const params = new URLSearchParams();
  if (query.startTime) params.append('startTime', query.startTime);
  if (query.endTime) params.append('endTime', query.endTime);
  if (query.userId) params.append('userId', String(query.userId));
  if (query.toolId) params.append('toolId', query.toolId);
  if (query.responseStatus) params.append('responseStatus', query.responseStatus);
  if (query.page) params.append('page', String(query.page));
  if (query.pageSize) params.append('pageSize', String(query.pageSize));

  const res = await axiosInstance.get(`/api/admin/logs?${params.toString()}`);
  return res.data.data;
}

/** 获取仪表盘统计数据 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await axiosInstance.get('/api/admin/dashboard/stats');
  return res.data.data;
}

// ===== 用户管理 =====

export interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  role: string;
  isEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface PagedAdminUsers {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SetRoleRequest {
  role: string;
}

export interface SetRateLimitRequest {
  maxRequestsPerMinute: number;
}

/** 获取用户列表 */
export async function getAdminUsers(page = 1, pageSize = 20): Promise<PagedAdminUsers> {
  const res = await axiosInstance.get('/api/admin/users', { params: { page, pageSize } });
  return res.data.data;
}

/** 禁用用户 */
export async function disableUser(userId: number): Promise<void> {
  await axiosInstance.put(`/api/admin/users/${userId}/disable`);
}

/** 启用用户 */
export async function enableUser(userId: number): Promise<void> {
  await axiosInstance.put(`/api/admin/users/${userId}/enable`);
}

/** 变更用户角色 */
export async function setUserRole(userId: number, role: string): Promise<void> {
  await axiosInstance.put(`/api/admin/users/${userId}/role`, { role });
}

/** 设置用户限流 */
export async function setUserRateLimit(userId: number, maxRequestsPerMinute: number): Promise<void> {
  await axiosInstance.put(`/api/admin/users/${userId}/rate-limit`, { maxRequestsPerMinute });
}
