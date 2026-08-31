export interface FileInfo {
  id: number;
  fileName: string;
  path: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  /** 是否已共享给其他用户 */
  shared?: boolean;
  /** 共享给我此文件的用户（仅共享文件视图有值） */
  ownerUserId?: number;
  ownerUsername?: string;
}

export interface UploadResult {
  id: number;
  fileName: string;
  path: string;
  sizeBytes: number;
  mimeType: string;
}

export interface PresignedUrl {
  url: string;
  expirySeconds: number;
}

export interface DirectoryInfo {
  id: number;
  name: string;
  path: string;
  parentPath: string;
  createdAt: string;
}

export interface DirectoryTreeNode {
  id: number;
  name: string;
  path: string;
  children: DirectoryTreeNode[];
}

export interface QuotaInfo {
  usedBytes: number;
  quotaBytes: number;
  usagePercent: number;
}

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ShareInfo {
  id: number;
  fileId: number;
  sharedWithUserId: number;
  sharedWithUsername: string;
  permission: 'VIEW' | 'EDIT';
  createdAt: string;
}

export interface SharedWithMeFile {
  shareId: number;
  fileId: number;
  fileName: string;
  path: string;
  sizeBytes: number;
  mimeType: string;
  permission: 'VIEW' | 'EDIT';
  ownerUserId: number;
  ownerUsername: string;
  sharedAt: string;
}

export interface UserOption {
  id: number;
  username: string;
  email?: string;
}

// ==================== 外链分享（PRD §4.12） ====================

/** 分享链接状态 */
export type ShareLinkStatus = 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'REVOKED';

/** 外链分享记录（管理侧，分享者本人可见） */
export interface ShareLinkInfo {
  id: number;
  shareCode: string;
  fileId: number;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  /** 分享地址的相对路径，展示时用 window.location.origin 拼接 */
  shareUrl: string;
  /** 明文提取码，仅创建接口返回一次 */
  accessCode?: string;
  expiresAt: string | null;
  maxVisits: number | null;
  visitCount: number;
  revoked: boolean;
  status: ShareLinkStatus;
  createdAt: string;
}

/** 外链分享公开信息（访客侧，免登可见，不含提取码） */
export interface SharePublicInfo {
  shareCode: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  ownerName: string | null;
  expiresAt: string | null;
  status: ShareLinkStatus;
}

/** 创建外链分享的请求体 */
export interface CreateShareLinkPayload {
  fileId: number;
  /** 有效期天数：1 / 7 / 30，null 表示永久 */
  expireDays?: number | null;
  /** 访问次数上限，null 表示不限 */
  maxVisits?: number | null;
}
