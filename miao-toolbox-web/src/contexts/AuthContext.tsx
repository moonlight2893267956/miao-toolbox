import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import axios from 'axios';

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

export interface UserInfo {
  id: number;
  username: string;
  role: string;
}

interface AuthState {
  isAuthenticated: boolean;
  userInfo: UserInfo | null;
  mustChangePassword: boolean;
  loading: boolean;
  rehydrating: boolean;
}

type AuthAction =
  | { type: 'LOGIN_SUCCESS'; payload: { userInfo: UserInfo; mustChangePassword: boolean } }
  | { type: 'LOGOUT' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'TOKEN_REFRESHED'; payload: { userInfo: UserInfo; mustChangePassword: boolean } }
  | { type: 'REHYDRATED'; payload: { isAuthenticated: boolean; mustChangePassword: boolean } };

const initialState: AuthState = {
  isAuthenticated: false,
  userInfo: null,
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
        mustChangePassword: action.payload.mustChangePassword,
        rehydrating: false,
      };
    case 'REHYDRATED':
      return {
        ...state,
        isAuthenticated: action.payload.isAuthenticated,
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const savedUser = getInitialUserInfo();
  const [state, dispatch] = useReducer(authReducer, {
    ...initialState,
    userInfo: savedUser,
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
    dispatch({ type: 'LOGIN_SUCCESS', payload: { userInfo, mustChangePassword } });
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
    dispatch({ type: 'LOGOUT' });
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
        dispatch({ type: 'TOKEN_REFRESHED', payload: { userInfo: data.user, mustChangePassword: data.mustChangePassword } });
        return data.accessToken;
      } catch {
        // 仅在未登录时清除状态（OAuth 回调可能在刷新期间已完成登录）
        if (!_accessToken) {
          clearTokens();
          localStorage.removeItem('user');
          localStorage.removeItem('mustChangePassword');
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
          },
        });
      }).catch(() => {
        dispatch({
          type: 'REHYDRATED',
          payload: {
            isAuthenticated: !!_accessToken,
            mustChangePassword: readMustChangePassword(),
          },
        });
      });
    } else {
      dispatch({
        type: 'REHYDRATED',
        payload: {
          isAuthenticated: !!_accessToken,
          mustChangePassword: readMustChangePassword(),
        },
      });
    }
  }, [refreshTokenFn]);

  const contextValue: AuthContextType = {
    state,
    login,
    logout,
    refreshToken: refreshTokenFn,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
