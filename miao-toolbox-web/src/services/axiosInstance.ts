import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { message as antdMessage } from 'antd';
import { getAccessToken, getSigningKey, setTokens, clearTokens } from '../contexts/AuthContext';

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
      const retryAfter = error.response.headers['retry-after'];
      const msg = retryAfter
        ? `请求过于频繁，请${retryAfter}秒后重试`
        : '请求过于频繁，请稍后再试';
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
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        clearTokens();
        localStorage.removeItem('user');
        localStorage.removeItem('mustChangePassword');
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

export default axiosInstance;
