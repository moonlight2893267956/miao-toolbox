import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { message as antdMessage } from 'antd';
import { getAccessToken, getSigningKey, setTokens, clearTokens } from '../contexts/AuthContext';

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
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string | null) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

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
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          if (token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            // 清除旧签名头，让请求拦截器用新 signingKey 重新签名
            delete originalRequest.headers['X-Request-Timestamp'];
            delete originalRequest.headers['X-Request-Nonce'];
            delete originalRequest.headers['X-Request-Signature'];
            return axiosInstance(originalRequest);
          }
          return Promise.reject(error);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        const { accessToken, signingKey, user } = response.data.data;
        setTokens(accessToken, signingKey);
        localStorage.setItem('user', JSON.stringify(user));

        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        // 清除旧签名头，让请求拦截器用新 signingKey 重新签名
        delete originalRequest.headers['X-Request-Timestamp'];
        delete originalRequest.headers['X-Request-Nonce'];
        delete originalRequest.headers['X-Request-Signature'];
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        clearTokens();
        localStorage.removeItem('user');
        localStorage.removeItem('mustChangePassword');
        localStorage.removeItem('miao_routes');

        // 标记 auth 错误，下游拦截器将静默吞掉，避免排队请求同时弹 toast
        Object.assign(refreshError as object, { [AUTH_REDIRECT]: true });
        processQueue(refreshError, null);

        // 跳转登录页，携带来源路径
        const currentPath = window.location.pathname;
        if (currentPath !== '/login') {
          window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
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

    // 401 / 429 已被上游拦截器处理，不再额外弹 toast
    if (status === 401 || status === 429) {
      return Promise.reject(error);
    }

    showErrorOnce('加载失败，请刷新页面重试');
    return Promise.reject(error);
  }
);

export default axiosInstance;
