import axiosInstance from '../../../services/axiosInstance';
import type { TranslateRequest, TranslateResponse, DetectRequest, DetectResponse } from './types';

/**
 * 翻译工具服务层（脚手架）。
 *
 * 封装计划中的后端代理端点（由 story-1.2 实现）：
 * - `POST /api/translate`       —— 文本翻译（FR-1/2）
 * - `POST /api/translate/detect` —— 语种识别（FR-5/6/7）
 *
 * 复用既有 axios 拦截器（HMAC 签名 + token 刷新），密钥仅存于服务端。
 * 注意：本文件为骨架，真实调用在后端代理层就绪后由后续 Story 接通。
 */

const BASE = '/api/translate';

/** 文本翻译 */
export async function translateText(req: TranslateRequest): Promise<TranslateResponse> {
  const resp = await axiosInstance.post<{ data: TranslateResponse }>(BASE, req);
  return resp.data.data;
}

/** 语种识别 */
export async function detectLanguage(req: DetectRequest): Promise<DetectResponse> {
  const resp = await axiosInstance.post<{ data: DetectResponse }>(`${BASE}/detect`, req);
  return resp.data.data;
}
