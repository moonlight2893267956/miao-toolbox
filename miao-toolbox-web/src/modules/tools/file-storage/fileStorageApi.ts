import axiosInstance from '../../../services/axiosInstance';
import type {
  FileInfo,
  UploadResult,
  DirectoryInfo,
  DirectoryTreeNode,
  QuotaInfo,
  PagedResponse,
  SortBy,
  SortDir,
  ConflictStrategy,
  ShareInfo,
  SharedWithMeFile,
  UserOption,
  ShareLinkInfo,
  CreateShareLinkPayload,
} from './types';

const BASE = '/api/storage';

export const fileStorageApi = {
  // 文件上传（Story 5.11：支持进度回调、AbortController 取消、同名冲突策略）
  uploadFile: async (
    file: File,
    path: string = '',
    options?: { onProgress?: (pct: number) => void; signal?: AbortSignal; conflictStrategy?: ConflictStrategy },
  ): Promise<UploadResult> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);
    if (options?.conflictStrategy) formData.append('conflictStrategy', options.conflictStrategy);
    const resp = await axiosInstance.post(`${BASE}/files`, formData, {
      onUploadProgress: (e) => {
        if (e.total) options?.onProgress?.(Math.round((e.loaded / e.total) * 100));
      },
      signal: options?.signal,
      // 全局 timeout 是 15s，大文件上传光传输就要远超这个时间——
      // 超时只会让前端单方面报错，后端仍会继续上传成功（COS 有文件、界面显示失败）。
      // 上传进度本身就是活性指标，这里关闭超时（0 = 不限制）。
      timeout: 0,
    });
    return resp.data.data;
  },

  // 检测目标目录下的同名文件（Story 5.11 / FR-36：上传/移动/粘贴前的冲突检查）
  checkConflict: async (path: string, fileNames: string[]): Promise<string[]> => {
    const resp = await axiosInstance.post(`${BASE}/files/check-conflict`, { path, fileNames });
    return resp.data.data ?? [];
  },

  // 预览文件（后端代理，返回 Blob，用于图片/音视频等二进制预览）
  previewFile: async (fileId: number): Promise<Blob> => {
    const resp = await axiosInstance.get(`${BASE}/files/${fileId}/preview`, {
      responseType: 'blob',
      // 大文件预览下载同样会超过全局 15s 超时
      timeout: 0,
    });
    return resp.data;
  },

  // 文本文件预览（返回文本内容）
  textPreview: async (fileId: number): Promise<{ fileName: string; mimeType: string; content: string }> => {
    const resp = await axiosInstance.get(`${BASE}/files/${fileId}/text-preview`);
    return resp.data.data;
  },

  // 下载文件（后端代理，返回 Blob + 文件名）
  downloadFile: async (fileId: number): Promise<{ blob: Blob; filename: string }> => {
    const resp = await axiosInstance.get(`${BASE}/files/${fileId}/download`, {
      responseType: 'blob',
    });
    const disposition = resp.headers['content-disposition'] as string;
    let filename = 'download';
    if (disposition) {
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      if (match) filename = decodeURIComponent(match[1]);
    }
    return { blob: resp.data, filename };
  },

  // 列出文件（Story 5.5：sortBy = name | size | updatedAt | type，sortDir = asc | desc）
  listFiles: async (
    path: string = '',
    page: number = 0,
    pageSize: number = 50,
    sortBy?: SortBy,
    sortDir?: SortDir,
  ): Promise<PagedResponse<FileInfo>> => {
    const resp = await axiosInstance.get(`${BASE}/files`, {
      params: { path, page, pageSize, sortBy, sortDir },
    });
    return resp.data.data;
  },

  // 搜索文件
  searchFiles: async (keyword: string, page: number = 0, pageSize: number = 50): Promise<PagedResponse<FileInfo>> => {
    const resp = await axiosInstance.get(`${BASE}/files/search`, {
      params: { keyword, page, pageSize },
    });
    return resp.data.data;
  },

  // 删除文件
  deleteFile: async (fileId: number): Promise<void> => {
    await axiosInstance.delete(`${BASE}/files/${fileId}`);
  },

  // 重命名文件
  renameFile: async (fileId: number, newName: string): Promise<FileInfo> => {
    const resp = await axiosInstance.put(`${BASE}/files/${fileId}/rename`, { newName });
    return resp.data.data;
  },

  // 移动文件
  moveFile: async (fileId: number, newPath: string): Promise<FileInfo> => {
    const resp = await axiosInstance.put(`${BASE}/files/${fileId}/move`, { newPath });
    return resp.data.data;
  },

  // 保存目录内的自定义排序（「自定义」排序模式：fileIds 为按新顺序排列的全部文件 ID）
  updateFileOrder: async (path: string, fileIds: number[]): Promise<void> => {
    await axiosInstance.put(`${BASE}/files/custom-order`, { path, fileIds });
  },

  // 批量删除文件（单事务，任一无权时整批拒绝）
  batchDeleteFiles: async (fileIds: number[]): Promise<{ success: number[]; failed: number[] }> => {
    const resp = await axiosInstance.post(`${BASE}/files/batch-delete`, { fileIds });
    return resp.data.data;
  },

  // 批量移动文件（单事务，任一无权时整批拒绝）。
  // conflictStrategy（Story 5.11 / FR-36）：目标同名时的策略，不传保持旧行为
  batchMoveFiles: async (
    fileIds: number[],
    targetPath: string,
    conflictStrategy?: ConflictStrategy,
  ): Promise<{ success: number[]; failed: number[] }> => {
    const resp = await axiosInstance.post(`${BASE}/files/batch-move`, { fileIds, targetPath, conflictStrategy });
    return resp.data.data;
  },

  // 批量复制文件（Story 5.10 / FR-34：剪贴板「复制」模式粘贴到目标目录）
  // 后端真实复制 COS 对象并占额外配额，目标目录同名文件自动追加 " (1)" 序号
  batchCopyFiles: async (fileIds: number[], targetPath: string): Promise<{ success: number[]; failed: number[] }> => {
    const resp = await axiosInstance.post(`${BASE}/files/batch-copy`, { fileIds, targetPath });
    return resp.data.data;
  },

  // 创建目录
  createDirectory: async (name: string, parentPath: string = ''): Promise<DirectoryInfo> => {
    const resp = await axiosInstance.post(`${BASE}/directories`, { name, parentPath });
    return resp.data.data;
  },

  // 列出子目录（Story 5.5：目录按名称排序，方向可切）
  // 列出子目录（Story 5.5：按名称排序；Story 5.12：sortBy=custom 时按自定义顺序）
  listDirectories: async (parentPath: string = '', sortDir?: SortDir, sortBy?: SortBy): Promise<DirectoryInfo[]> => {
    const resp = await axiosInstance.get(`${BASE}/directories`, {
      params: { parentPath, sortDir, sortBy },
    });
    return resp.data.data;
  },

  // 保存目录内的自定义顺序（Story 5.12：dirIds 为按新顺序排列的全部子目录 ID）
  updateDirectoryOrder: async (parentPath: string, dirIds: number[]): Promise<void> => {
    await axiosInstance.put(`${BASE}/directories/custom-order`, { parentPath, dirIds });
  },

  // 获取完整目录树
  getDirectoryTree: async (): Promise<DirectoryTreeNode[]> => {
    const resp = await axiosInstance.get(`${BASE}/directory-tree`);
    return resp.data.data;
  },

  // 删除目录
  deleteDirectory: async (dirId: number): Promise<void> => {
    await axiosInstance.delete(`${BASE}/directories/${dirId}`);
  },

  // 重命名目录（Story 5.6 / FR-28）
  renameDirectory: async (dirId: number, newName: string): Promise<DirectoryInfo> => {
    const resp = await axiosInstance.put(`${BASE}/directories/${dirId}/rename`, { newName });
    return resp.data.data;
  },

  // 移动目录（Story 5.6 / FR-28）
  moveDirectory: async (dirId: number, targetParentPath: string): Promise<DirectoryInfo> => {
    const resp = await axiosInstance.put(`${BASE}/directories/${dirId}/move`, { targetParentPath });
    return resp.data.data;
  },

  // 获取配额信息
  getQuotaInfo: async (): Promise<QuotaInfo> => {
    const resp = await axiosInstance.get(`${BASE}/quota`);
    return resp.data.data;
  },

  // ==================== 共享管理 ====================

  // 共享文件给指定用户
  shareFile: async (fileId: number, userId: number, permission: string): Promise<ShareInfo> => {
    const resp = await axiosInstance.post(`${BASE}/files/${fileId}/shares`, { userId, permission });
    return resp.data.data;
  },

  // 查看文件的共享列表
  listFileShares: async (fileId: number): Promise<ShareInfo[]> => {
    const resp = await axiosInstance.get(`${BASE}/files/${fileId}/shares`);
    return resp.data.data;
  },

  // 取消共享
  unshareFile: async (fileId: number, shareId: number): Promise<void> => {
    await axiosInstance.delete(`${BASE}/files/${fileId}/shares/${shareId}`);
  },

  // 更新共享权限（VIEW / EDIT）
  updateSharePermission: async (fileId: number, shareId: number, permission: string): Promise<ShareInfo> => {
    const resp = await axiosInstance.put(`${BASE}/files/${fileId}/shares/${shareId}`, { permission });
    return resp.data.data;
  },

  // 将共享文件复制到我的文件（可指定目标目录路径）
  copySharedFileToMine: async (fileId: number, targetPath: string): Promise<FileInfo> => {
    const resp = await axiosInstance.post(`${BASE}/files/${fileId}/copy-to-mine?path=${encodeURIComponent(targetPath)}`);
    return resp.data.data;
  },

  // 查看共享给我的文件
  listSharedWithMe: async (): Promise<SharedWithMeFile[]> => {
    const resp = await axiosInstance.get(`${BASE}/files/shared-with-me`);
    return resp.data.data;
  },

  // 搜索用户（用于共享选择，支持用户名/邮箱搜索）
  searchUsers: async (keyword: string = ''): Promise<UserOption[]> => {
    const resp = await axiosInstance.get('/api/users/search', {
      params: { keyword, limit: 50 },
    });
    return resp.data.data;
  },

  // 更新文本文件内容（覆盖写入）
  updateTextContent: async (fileId: number, content: string): Promise<FileInfo> => {
    const resp = await axiosInstance.put(`${BASE}/files/${fileId}/content`, { content });
    return resp.data.data;
  },

  // ==================== 外链分享管理（PRD §4.12） ====================

  // 创建外链分享（返回的 accessCode 明文仅此一次）
  createShareLink: async (payload: CreateShareLinkPayload): Promise<ShareLinkInfo> => {
    const resp = await axiosInstance.post(`${BASE}/share-links`, payload);
    return resp.data.data;
  },

  // 我的分享列表
  listShareLinks: async (): Promise<ShareLinkInfo[]> => {
    const resp = await axiosInstance.get(`${BASE}/share-links`);
    return resp.data.data;
  },

  // 取消分享
  revokeShareLink: async (linkId: number): Promise<void> => {
    await axiosInstance.delete(`${BASE}/share-links/${linkId}`);
  },
};
