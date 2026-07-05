import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import axios from 'axios';

const ROUTES_STORAGE_KEY = 'miao_routes';

// 闭包变量存储 token（不持久化到 localStorage/sessionStorage）
let _accessToken: string | null = null;
let _signingKey: string | null = null;

export function getAccessToken(): string | null {
  return _accessToken;
}

export function getSigningKey(): string | null {
  return _signingKey;
}

export function setTokens(accessToken: string | null, signingKey: string | null) {
  _accessToken = accessToken;
  _signingKey = signingKey;
}

export function clearTokens() {
  _accessToken = null;
  _signingKey = null;
}

export interface RoleBrief {
  id: number;
  code: string;
  name: string;
}

export interface UserInfo {
  id: number;
  username: string;
  roles: RoleBrief[];
}

/** 判断用户是否是超级管理员 */
export function isSuperAdmin(userInfo: UserInfo | null): boolean {
  return userInfo?.roles?.some(r => r.code === 'SUPER_ADMIN') ?? false;
}

interface AuthState {
  isAuthenticated: boolean;
  userInfo: UserInfo | null;
  accessibleRoutes: string[];
  routesLoading: boolean;
  mustChangePassword: boolean;
  loading: boolean;
  rehydrating: boolean;
}

type AuthAction =
  | { type: 'LOGIN_SUCCESS'; payload: { userInfo: UserInfo; mustChangePassword: boolean; accessibleRoutes: string[] } }
  | { type: 'LOGOUT' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'TOKEN_REFRESHED'; payload: { userInfo: UserInfo; mustChangePassword: boolean; accessibleRoutes: string[] } }
  | { type: 'ROUTES_REFRESHED'; payload: string[] }
  | { type: 'REHYDRATED'; payload: { isAuthenticated: boolean; mustChangePassword: boolean; accessibleRoutes: string[] } };

const initialState: AuthState = {
  isAuthenticated: false,
  userInfo: null,
  accessibleRoutes: [],
  routesLoading: false,
  mustChangePassword: false,
  loading: false,
  rehydrating: true,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        userInfo: action.payload.userInfo,
        accessibleRoutes: action.payload.accessibleRoutes,
        routesLoading: true,
        mustChangePassword: action.payload.mustChangePassword,
        loading: false,
        rehydrating: false,
      };
    case 'LOGOUT':
      return { ...initialState, rehydrating: false };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'TOKEN_REFRESHED':
      return {
        ...state,
        isAuthenticated: true,
        userInfo: action.payload.userInfo,
        accessibleRoutes: action.payload.accessibleRoutes,
        routesLoading: false,
        mustChangePassword: action.payload.mustChangePassword,
        rehydrating: false,
      };
    case 'ROUTES_REFRESHED':
      return { ...state, accessibleRoutes: action.payload, routesLoading: false };
    case 'REHYDRATED':
      return {
        ...state,
        isAuthenticated: action.payload.isAuthenticated,
        accessibleRoutes: action.payload.accessibleRoutes,
        routesLoading: false,
        mustChangePassword: action.payload.mustChangePassword,
        rehydrating: false,
      };
    default:
      return state;
  }
}

interface AuthContextType {
  state: AuthState;
  login: (accessToken: string, signingKey: string, userInfo: UserInfo, mustChangePassword: boolean) => void;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
  refreshRoutes: () => Promise<string[]>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// 从 localStorage 恢复 userInfo（页面刷新后）
function getInitialUserInfo(): UserInfo | null {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) return JSON.parse(userStr) as UserInfo;
  } catch { /* ignore */ }
  return null;
}

function getInitialAccessibleRoutes(): string[] {
  try {
    const raw = localStorage.getItem(ROUTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function persistAccessibleRoutes(routes: string[]) {
  localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(routes));
}

async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(data);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fetchAccessibleRoutes(accessToken: string, signingKey: string): Promise<string[]> {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const signature = await hmacSha256(signingKey, timestamp + nonce);
  const response = await axios.get('/api/auth/me/routes', {
    withCredentials: true,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Request-Timestamp': timestamp,
      'X-Request-Nonce': nonce,
      'X-Request-Signature': signature,
    },
  });
  return response.data.data?.routes ?? [];
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const savedUser = getInitialUserInfo();
  const savedRoutes = getInitialAccessibleRoutes();
  const [state, dispatch] = useReducer(authReducer, {
    ...initialState,
    userInfo: savedUser,
    accessibleRoutes: savedRoutes,
  });
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  const login = useCallback((
    accessToken: string,
    signingKey: string,
    userInfo: UserInfo,
    mustChangePassword: boolean,
  ) => {
    setTokens(accessToken, signingKey);
    localStorage.setItem('user', JSON.stringify(userInfo));
    if (mustChangePassword) {
      localStorage.setItem('mustChangePassword', 'true');
    } else {
      localStorage.removeItem('mustChangePassword');
    }
    // 保留上次缓存的 routes 作为初始值，避免异步加载期间侧边栏闪烁
    const oldRoutes = getInitialAccessibleRoutes();
    dispatch({ type: 'LOGIN_SUCCESS', payload: { userInfo, mustChangePassword, accessibleRoutes: oldRoutes } });
    fetchAccessibleRoutes(accessToken, signingKey)
      .then((routes) => {
        persistAccessibleRoutes(routes);
        dispatch({ type: 'ROUTES_REFRESHED', payload: routes });
      })
      .catch((err) => {
        localStorage.removeItem(ROUTES_STORAGE_KEY);
        dispatch({ type: 'ROUTES_REFRESHED', payload: oldRoutes.length > 0 ? oldRoutes : [] });
      });
  }, []);

  const logout = useCallback(async () => {
    try {
      await axios.post('/api/auth/logout', {}, {
        headers: _accessToken ? { Authorization: `Bearer ${_accessToken}` } : {},
        withCredentials: true,
      });
    } catch {
      // 即使 API 调用失败也要清除本地状态
    }
    clearTokens();
    localStorage.removeItem('user');
    localStorage.removeItem('mustChangePassword');
    localStorage.removeItem(ROUTES_STORAGE_KEY);
    dispatch({ type: 'LOGOUT' });
  }, []);

  const refreshRoutes = useCallback(async (): Promise<string[]> => {
    if (!_accessToken || !_signingKey) return [];
    const routes = await fetchAccessibleRoutes(_accessToken, _signingKey);
    persistAccessibleRoutes(routes);
    dispatch({ type: 'ROUTES_REFRESHED', payload: routes });
    return routes;
  }, []);

  const refreshTokenFn = useCallback(async (): Promise<string | null> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const promise = (async () => {
      try {
        const response = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        const data = response.data.data;
        // 如果 OAuth 登录已在刷新期间完成，保留 OAuth 的 token
        if (_accessToken) return _accessToken;
        setTokens(data.accessToken, data.signingKey);
        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.mustChangePassword) {
          localStorage.setItem('mustChangePassword', 'true');
        } else {
          localStorage.removeItem('mustChangePassword');
        }
        let routes = getInitialAccessibleRoutes();
        try {
          routes = await fetchAccessibleRoutes(data.accessToken, data.signingKey);
          persistAccessibleRoutes(routes);
        } catch {
          localStorage.removeItem(ROUTES_STORAGE_KEY);
          routes = [];
        }
        dispatch({ type: 'TOKEN_REFRESHED', payload: { userInfo: data.user, mustChangePassword: data.mustChangePassword, accessibleRoutes: routes } });
        return data.accessToken;
      } catch {
        // 仅在未登录时清除状态（OAuth 回调可能在刷新期间已完成登录）
        if (!_accessToken) {
          clearTokens();
          localStorage.removeItem('user');
          localStorage.removeItem('mustChangePassword');
          localStorage.removeItem(ROUTES_STORAGE_KEY);
          dispatch({ type: 'LOGOUT' });
        }
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;
    return promise;
  }, []);

  // 页面刷新时尝试静默刷新 token 恢复认证状态。
  // OAuth 回调也会在首次挂载时写入 token，因此这里读取 effect 执行时的当前状态，
  // 避免用首帧的 savedUser 快照覆盖刚完成的登录。
  React.useEffect(() => {
    const readMustChangePassword = () => localStorage.getItem('mustChangePassword') === 'true';
    const currentUser = getInitialUserInfo();

    if (currentUser && !_accessToken) {
      refreshTokenFn().then((token) => {
        dispatch({
          type: 'REHYDRATED',
          payload: {
            isAuthenticated: !!token || !!_accessToken,
            mustChangePassword: readMustChangePassword(),
            accessibleRoutes: getInitialAccessibleRoutes(),
          },
        });
      }).catch(() => {
        dispatch({
          type: 'REHYDRATED',
          payload: {
            isAuthenticated: !!_accessToken,
            mustChangePassword: readMustChangePassword(),
            accessibleRoutes: getInitialAccessibleRoutes(),
          },
        });
      });
    } else {
      dispatch({
        type: 'REHYDRATED',
        payload: {
          isAuthenticated: !!_accessToken,
          mustChangePassword: readMustChangePassword(),
          accessibleRoutes: getInitialAccessibleRoutes(),
        },
      });
    }
  }, [refreshTokenFn]);

  const contextValue: AuthContextType = {
    state,
    login,
    logout,
    refreshToken: refreshTokenFn,
    refreshRoutes,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
