import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { message as antdMessage } from 'antd';
import { getAccessToken, getSigningKey } from '../contexts/AuthContext';
import { silentRefresh } from './tokenRefresh';

// 错误去重：同一消息 2 秒内只展示一次
const errorThrottle = new Map<string, number>();
function showErrorOnce(msg: string, type: 'error' | 'warning' = 'error') {
  const now = Date.now();
  const last = errorThrottle.get(msg) ?? 0;
  if (now - last < 2000) return;
  errorThrottle.set(msg, now);
  if (type === 'warning') {
    antdMessage.warning(msg);
  } else {
    antdMessage.error(msg);
  }
}

// Auth 刷新失败标记：页面即将跳转登录，下游拦截器需静默吞掉
const AUTH_REDIRECT = Symbol('AUTH_REDIRECT');

// HMAC-SHA256 签名工具
async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(data);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateNonce(): string {
  return crypto.randomUUID();
}

const axiosInstance = axios.create({
  baseURL: '',
  timeout: 15000,
  withCredentials: true,
});

// 请求拦截器：附加 Authorization + HMAC 签名
axiosInstance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const signingKey = getSigningKey();
  if (signingKey && token) {
    const timestamp = Date.now().toString();
    const nonce = generateNonce();

    // 请求体为空时用空字符串
    const body = config.data ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data)) : '';
    const signature = await hmacSha256(signingKey, timestamp + nonce + body);

    config.headers['X-Request-Timestamp'] = timestamp;
    config.headers['X-Request-Nonce'] = nonce;
    config.headers['X-Request-Signature'] = signature;
  }

  return config;
});

// 响应拦截器：401 静默刷新 + 429 提示
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 429 限流提示
    if (error.response?.status === 429) {
      const msg = (error.response?.data as { message?: string })?.message || '请求过于频繁，请稍后再试';
      antdMessage.warning(msg);
      return Promise.reject(error);
    }

    // 401 静默刷新
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const newToken = await silentRefresh();

      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        delete originalRequest.headers['X-Request-Timestamp'];
        delete originalRequest.headers['X-Request-Nonce'];
        delete originalRequest.headers['X-Request-Signature'];
        return axiosInstance(originalRequest);
      }

      // 刷新失败，标记 auth 错误并跳转登录
      Object.assign(error as object, { [AUTH_REDIRECT]: true });
      const currentPath = window.location.pathname;
      if (currentPath !== '/login') {
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
      }
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

// 全局错误统一处理：去重 + auth 错误静默 + 统一引导刷新
axiosInstance.interceptors.response.use(
  response => response,
  (error: AxiosError) => {
    // Auth 刷新失败导致页面即将跳转登录，静默吞掉所有相关错误
    if ((error as unknown as Record<symbol, boolean>)[AUTH_REDIRECT]) {
      return new Promise(() => {});
    }

    const status = error.response?.status;

    // 429 已在上游拦截器弹过 warning，不再兜底提示
    if (status === 429) {
      return Promise.reject(error);
    }

    // 其他 4xx 通常是业务错误，由调用方按场景展示更准确的提示。
    // 这里仅兜底网络错误或 5xx，避免和表单自身的错误提示重复。
    if (status && status < 500) {
      return Promise.reject(error);
    }

    showErrorOnce('加载失败，请刷新页面重试');
    return Promise.reject(error);
  }
);

export default axiosInstance;
