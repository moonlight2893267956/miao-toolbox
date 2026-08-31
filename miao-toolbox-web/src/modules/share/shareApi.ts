import publicApi from '../../services/publicApi';
import type { SharePublicInfo } from '../tools/file-storage/types';

const BASE = '/api/public/share';

/**
 * 从公开接口的错误响应中提取中文提示
 * 分享接口的失败响应为 403/404，body 形如 { code, message }
 */
function extractMessage(error: unknown, fallback: string): string {
  const resp = (error as { response?: { data?: { message?: string } } })?.response;
  return resp?.data?.message || fallback;
}

export interface ShareApiError {
  code: string;
  message: string;
}

/**
 * 把 axios 错误规整为 { code, message }，便于页面按 code 区分失效类型
 */
export function toShareError(error: unknown, fallbackCode: string, fallbackMessage: string): ShareApiError {
  const resp = (error as { response?: { status?: number; data?: { code?: string; message?: string } } })?.response;
  if (resp?.data?.code) {
    return { code: resp.data.code, message: resp.data.message || fallbackMessage };
  }
  return { code: fallbackCode, message: extractMessage(error, fallbackMessage) };
}

export const shareApi = {
  /** 获取分享公开信息（免登，不含提取码） */
  getInfo: async (shareCode: string): Promise<SharePublicInfo> => {
    const resp = await publicApi.get(`${BASE}/${encodeURIComponent(shareCode)}/info`);
    return resp.data.data;
  },

  /** 校验提取码并换取短期访问票据 */
  unlock: async (shareCode: string, accessCode: string): Promise<string> => {
    const resp = await publicApi.post(`${BASE}/${encodeURIComponent(shareCode)}/unlock`, { accessCode });
    return resp.data.data.ticket as string;
  },

  /** 文本内容预览 */
  fetchTextPreview: async (shareCode: string, ticket: string): Promise<string> => {
    const resp = await publicApi.get(`${BASE}/${encodeURIComponent(shareCode)}/text-preview`, {
      params: { st: ticket },
    });
    return resp.data.data.content as string;
  },

  /** 二进制预览（返回 Blob，调用方负责 createObjectURL / revokeObjectURL） */
  fetchPreviewBlob: async (shareCode: string, ticket: string): Promise<Blob> => {
    const resp = await publicApi.get(`${BASE}/${encodeURIComponent(shareCode)}/preview`, {
      params: { st: ticket },
      responseType: 'blob',
    });
    return resp.data;
  },

  /** 下载文件（返回 Blob + 文件名，调用方触发浏览器下载） */
  download: async (shareCode: string, ticket: string): Promise<{ blob: Blob; filename: string }> => {
    const resp = await publicApi.get(`${BASE}/${encodeURIComponent(shareCode)}/download`, {
      params: { st: ticket },
      responseType: 'blob',
    });
    const disposition = resp.headers['content-disposition'] as string | undefined;
    let filename = 'download';
    if (disposition) {
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      if (match) filename = decodeURIComponent(match[1]);
    }
    return { blob: resp.data, filename };
  },
};
