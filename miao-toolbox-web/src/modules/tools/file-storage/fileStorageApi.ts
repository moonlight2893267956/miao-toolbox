import axiosInstance from '../../../services/axiosInstance';
import type {
  FileInfo,
  UploadResult,
  DirectoryInfo,
  DirectoryTreeNode,
  QuotaInfo,
  PagedResponse,
  ShareInfo,
  SharedWithMeFile,
  UserOption,
} from './types';

const BASE = '/api/storage';

export const fileStorageApi = {
  // 文件上传
  uploadFile: async (file: File, path: string = ''): Promise<UploadResult> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);
    const resp = await axiosInstance.post(`${BASE}/files`, formData);
    return resp.data.data;
  },

  // 预览文件（后端代理，返回 Blob，用于图片/音视频等二进制预览）
  previewFile: async (fileId: number): Promise<Blob> => {
    const resp = await axiosInstance.get(`${BASE}/files/${fileId}/preview`, {
      responseType: 'blob',
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

  // 列出文件
  listFiles: async (path: string = '', page: number = 0, pageSize: number = 50): Promise<PagedResponse<FileInfo>> => {
    const resp = await axiosInstance.get(`${BASE}/files`, {
      params: { path, page, pageSize },
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

  // 创建目录
  createDirectory: async (name: string, parentPath: string = ''): Promise<DirectoryInfo> => {
    const resp = await axiosInstance.post(`${BASE}/directories`, { name, parentPath });
    return resp.data.data;
  },

  // 列出子目录
  listDirectories: async (parentPath: string = ''): Promise<DirectoryInfo[]> => {
    const resp = await axiosInstance.get(`${BASE}/directories`, {
      params: { parentPath },
    });
    return resp.data.data;
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
};
