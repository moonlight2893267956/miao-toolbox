import axiosInstance from '../../../services/axiosInstance';
import type {
  TranslateRequest,
  TranslateResponse,
  DetectRequest,
  DetectResponse,
  ImageTranslateResponse,
  SpeechTranslateResponse,
  LanguageCode,
  AiEnhanceRequest,
  AiEnhanceResponse,
} from './types';

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

/**
 * 图片翻译（FR-8）
 *
 * 以 `multipart/form-data` 调用 story-2.1 提供的新端点。
 * `from` 默认 `auto`（与后端 `@RequestParam(defaultValue="auto")` 对齐），
 * `to` 必填。复用 axios 拦截器（HMAC 签名 + token 刷新），密钥仅存于服务端。
 */
export async function imageTranslate(
  file: File,
  from: LanguageCode,
  to: LanguageCode,
): Promise<ImageTranslateResponse> {
  const form = new FormData();
  form.append('image', file);
  form.append('from', from);
  form.append('to', to);
  const resp = await axiosInstance.post<{ data: ImageTranslateResponse }>(
    `${BASE}/image`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return resp.data.data;
}

/**
 * 语音翻译（FR-12，story-3.2）
 *
 * 以 `multipart/form-data` 调用 story-3.1 提供的新端点。
 * 前端把录音转码为 16kHz/单声道/16bit 后，默认以裸 `pcm` 上传：
 * 百度语音翻译仅「中文/粤语」支持 wav，英语等其他语种只接受 pcm，而 pcm 对所有语种通用。
 * `from` 必须为具体语种（百度语音翻译不支持 `auto` 自动检测），`to` 必填。
 * 复用 axios 拦截器（HMAC 签名 + token 刷新），密钥仅存于服务端。
 */
export async function speechTranslate(
  file: Blob,
  from: LanguageCode,
  to: LanguageCode,
  format: 'pcm' | 'wav' = 'pcm',
): Promise<SpeechTranslateResponse> {
  const form = new FormData();
  form.append('voice', file);
  form.append('from', from);
  form.append('to', to);
  form.append('format', format);
  const resp = await axiosInstance.post<{ data: SpeechTranslateResponse }>(
    `${BASE}/voice`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return resp.data.data;
}

/**
 * AI 增强翻译（FR-16，story-4.2）
 *
 * 调用 story-4.1 提供的 `POST /api/translate/enhance`，后端经 miao-agent 翻译通用 Agent
 * 完成「百度打底 + LLM 润色/风格化」，返回增强译文。前端只传原文 + 语种 + 风格，
 * 不持有百度密钥。复用 axios 拦截器（HMAC 签名 + token 刷新）。
 */
export async function enhanceTranslate(
  req: AiEnhanceRequest,
): Promise<AiEnhanceResponse> {
  // 后端 miao-ai translate-agent read-timeout 默认 120s，前端留出 130s 余量
  const resp = await axiosInstance.post<{ data: AiEnhanceResponse }>(
    `${BASE}/enhance`,
    req,
    { timeout: 130000 },
  );
  return resp.data.data;
}
