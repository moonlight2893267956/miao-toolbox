import axiosInstance from './axiosInstance';
import { getAccessToken } from '../contexts/AuthContext';

export interface LoginParams {
  username: string;
  password: string;
}

export interface RegisterParams {
  username: string;
  password: string;
  inviteToken?: string;
}

export interface EmailRegisterParams {
  email: string;
  username: string;
  password: string;
  code: string;
  inviteToken?: string;
}

export type EmailCodePurpose = 'REGISTER' | 'BIND_EMAIL' | 'RESET_PASSWORD';

export interface SendCodeParams {
  email: string;
  purpose: EmailCodePurpose;
}

export interface VerifyCodeParams {
  email: string;
  code: string;
  purpose: EmailCodePurpose;
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
  email: string | null;
  emailVerified: boolean;
  roles: RoleBrief[];
  githubUsername: string | null;
  googleUsername: string | null;
  avatarUrl: string | null;
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

  async emailRegister(params: EmailRegisterParams): Promise<LoginResult> {
    const response = await axiosInstance.post('/api/auth/email/register', params);
    return response.data.data;
  },

  async sendEmailCode(params: SendCodeParams): Promise<void> {
    await axiosInstance.post('/api/auth/email/send-code', params);
  },

  /**
   * 分步校验验证码（只校验，不消费）。
   * 用于多步骤流程进入下一步之前即时反馈验证码是否正确；
   * 校验通过不代表最终提交一定成功，最终提交时后端仍会再次校验并消费。
   */
  async verifyEmailCode(params: VerifyCodeParams): Promise<boolean> {
    const response = await axiosInstance.post('/api/auth/email/verify-code', params);
    return response.data.data?.valid === true;
  },

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    await axiosInstance.post('/api/auth/email/reset-password', { email, code, newPassword });
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
   * 构建 OAuth 绑定 URL（当前登录用户绑定第三方账号）。
   * 将 JWT 写入临时 cookie，后端 OAuthController 从 cookie 读取以识别当前用户。
   */
  getOAuthBindUrl(provider: 'github' | 'google'): string {
    const token = getAccessToken();
    if (token) {
      // 写入临时 cookie（60 秒过期，仅限 /api/auth/oauth 路径）
      document.cookie = `miao_bind_token=${encodeURIComponent(token)}; path=/api/auth/oauth; max-age=60; SameSite=Lax`;
    }
    return `/api/auth/oauth/${provider}?bind=true`;
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

/** 验证码相关错误码 → 中文提示 */
const EMAIL_CODE_ERROR_MESSAGES: Record<string, string> = {
  EMAIL_CODE_INVALID: '验证码错误，请重新输入',
  EMAIL_CODE_EXPIRED: '验证码已过期，请重新获取',
  EMAIL_CODE_PURPOSE_MISMATCH: '验证码用途不匹配，请重新获取',
  EMAIL_VERIFY_RATE_LIMIT: '验证次数过多，请明天再试',
};

/**
 * 把验证码相关的后端错误转换为中文提示。
 * 优先按错误码映射（文案更准确），未命中时回退到后端 message，最后才用兜底文案。
 */
export function resolveEmailCodeError(
  err: unknown,
  fallback = '验证码校验失败，请稍后重试',
): string {
  const data = (err as any)?.response?.data;
  return EMAIL_CODE_ERROR_MESSAGES[data?.code] ?? data?.message ?? fallback;
}
