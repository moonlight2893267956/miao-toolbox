import axiosInstance from './axiosInstance';

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

export interface AdminRole {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  userCount?: number | null;
}

export interface AdminRoute {
  id: number;
  code: string;
  name: string;
  path: string;
  category: string;
  icon?: string | null;
  sortOrder: number;
  isAdminRoute: boolean;
  isEnabled: boolean;
}

export interface RouteMatrix {
  routes: AdminRoute[];
  adminRoutes: AdminRoute[];
  roles: AdminRole[];
  mappings: Record<string, number[]>;
}

/** 获取仪表盘统计数据 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await axiosInstance.get('/api/admin/dashboard/stats');
  return res.data.data;
}

// ===== 角色管理 =====

export interface PagedAdminRoles {
  items: AdminRole[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getAdminRoles(page = 1, pageSize = 100): Promise<PagedAdminRoles> {
  const res = await axiosInstance.get('/api/admin/roles', { params: { page, pageSize } });
  return res.data.data;
}

// ===== 路由管理 =====

export async function getRouteMatrix(): Promise<RouteMatrix> {
  const res = await axiosInstance.get('/api/admin/routes/matrix');
  return res.data.data;
}

export async function updateRouteMatrix(mappings: Record<string, number[]>): Promise<RouteMatrix> {
  const res = await axiosInstance.put('/api/admin/routes/matrix', { mappings });
  return res.data.data;
}

// ===== 用户管理 =====

export interface RoleBrief {
  id: number;
  code: string;
  name: string;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  avatarUrl: string | null;
  roles: RoleBrief[];
  isEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  storageQuotaBytes: number;
  storageUsedBytes: number;
}

export interface PagedAdminUsers {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SetRoleRequest {
  roleIds: number[];
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
export async function setUserRole(userId: number, roleIds: number[]): Promise<void> {
  await axiosInstance.put(`/api/admin/users/${userId}/roles`, { roleIds });
}

/** 设置用户限流 */
export async function setUserRateLimit(userId: number, maxRequestsPerMinute: number): Promise<void> {
  await axiosInstance.put(`/api/admin/users/${userId}/rate-limit`, { maxRequestsPerMinute });
}

/** 设置用户存储配额 */
export async function setUserQuota(userId: number, quotaBytes: number): Promise<void> {
  await axiosInstance.put(`/api/admin/users/${userId}/quota`, { quotaBytes });
}

// ===== 管理员文件操作 =====

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminFileInfo {
  id: number;
  fileName: string;
  path: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
}

/** 管理员浏览用户文件 */
export async function getAdminUserFiles(userId: number, path?: string, page = 1, pageSize = 20): Promise<PagedResponse<AdminFileInfo>> {
  const params: Record<string, string | number> = { page, pageSize };
  if (path) params.path = path;
  const res = await axiosInstance.get(`/api/admin/storage/users/${userId}/files`, { params });
  return res.data.data;
}

/** 管理员删除用户文件 */
export async function deleteAdminUserFile(userId: number, fileId: number): Promise<void> {
  await axiosInstance.delete(`/api/admin/storage/users/${userId}/files/${fileId}`);
}

// ===== 存储管理 =====

export interface UserStorageInfo {
  userId: number;
  username: string;
  usedBytes: number;
  quotaBytes: number;
  percentage: number;
}

export interface MimeTypeDistribution {
  type: string;
  count: number;
  totalBytes: number;
}

export interface StorageOverview {
  totalBytes: number;
  totalFiles: number;
  userCount: number;
  users: UserStorageInfo[];
  typeDistribution: MimeTypeDistribution[];
}

/** 获取存储概览 */
export async function getStorageOverview(): Promise<StorageOverview> {
  const res = await axiosInstance.get('/api/admin/storage/overview');
  return res.data.data;
}

