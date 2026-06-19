import axiosInstance from '../../../services/axiosInstance';
import { useCallback } from 'react';
import type { DiffRequestBody, DiffResult, FileUploadResult } from './types';

const BASE = '/api/diff';

/**
 * 文本对照 API Hook
 * - compare: 触发对比
 * - upload: 上传文件获取 fileKey
 */
export const useDiffApi = () => {
  const compare = useCallback(async (body: DiffRequestBody): Promise<DiffResult> => {
    const res = await axiosInstance.post(BASE, body);
    return res.data.data as DiffResult;
  }, []);

  const upload = useCallback(async (file: File): Promise<FileUploadResult> => {
    const form = new FormData();
    form.append('file', file);
    const res = await axiosInstance.post(`${BASE}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data as FileUploadResult;
  }, []);

  return { compare, upload };
};
