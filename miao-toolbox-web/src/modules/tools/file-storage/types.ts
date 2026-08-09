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
