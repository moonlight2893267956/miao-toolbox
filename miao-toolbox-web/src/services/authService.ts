import axiosInstance from './axiosInstance';

export interface LoginParams {
  username: string;
  password: string;
}

export interface RegisterParams {
  username: string;
  password: string;
  inviteToken?: string;
}

export interface InvitePreview {
  valid: boolean;
  roleName: string | null;
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

export interface LoginResult {
  accessToken: string;
  signingKey: string;
  mustChangePassword: boolean;
  user: UserInfo;
}

export interface AccessibleRoutesResult {
  routes: string[];
}

export const authService = {
  async login(params: LoginParams): Promise<LoginResult> {
    const response = await axiosInstance.post('/api/auth/login', params);
    return response.data.data;
  },

  async register(params: RegisterParams): Promise<void> {
    await axiosInstance.post('/api/auth/register', params);
  },

  async previewInvite(token: string): Promise<InvitePreview> {
    const response = await axiosInstance.get('/api/auth/invite/preview', { params: { token } });
    return response.data.data;
  },

  async refresh(): Promise<LoginResult> {
    const response = await axiosInstance.post('/api/auth/refresh');
    return response.data.data;
  },

  async getAccessibleRoutes(): Promise<string[]> {
    const response = await axiosInstance.get('/api/auth/me/routes');
    return (response.data.data as AccessibleRoutesResult).routes;
  },

  async logout(): Promise<void> {
    await axiosInstance.post('/api/auth/logout');
  },

  getOAuthUrl(): string {
    return '/api/auth/oauth/github';
  },

  getGoogleOAuthUrl(): string {
    return '/api/auth/oauth/google';
  },

  /**
   * 构建带 state 的 OAuth 注册 URL。
   * state 中编码 inviteToken，后端回调时可解析并绑定邀请角色。
   * 格式：invite=xxx （base64 编码，避免特殊字符问题）
   */
  getOAuthRegisterUrl(provider: 'github' | 'google', inviteToken?: string): string {
    const baseUrl = `/api/auth/oauth/${provider}`;
    if (!inviteToken) return baseUrl;
    const statePayload = btoa(JSON.stringify({ invite: inviteToken }));
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}state=${encodeURIComponent(statePayload)}`;
  },
};
