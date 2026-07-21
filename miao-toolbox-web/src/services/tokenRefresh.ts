import axios from 'axios';
import { setTokens, clearTokens } from '../contexts/AuthContext';

let refreshPromise: Promise<string | null> | null = null;

/**
 * 静默刷新 access token（单例模式，防止并发刷新）。
 * 多个调用方（axios 拦截器、SSE hook、AuthContext）共享同一次刷新结果。
 * 成功返回新 access token，失败返回 null 并清除本地认证状态。
 */
export async function silentRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
      const { accessToken, signingKey, user } = response.data.data;
      setTokens(accessToken, signingKey);
      localStorage.setItem('user', JSON.stringify(user));
      if (response.data.data.mustChangePassword) {
        localStorage.setItem('mustChangePassword', 'true');
      } else {
        localStorage.removeItem('mustChangePassword');
      }
      return accessToken;
    } catch {
      clearTokens();
      localStorage.removeItem('user');
      localStorage.removeItem('mustChangePassword');
      localStorage.removeItem('miao_routes');
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
