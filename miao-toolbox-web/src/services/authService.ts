import axiosInstance from './axiosInstance';

export interface LoginParams {
  username: string;
  password: string;
}

export interface RegisterParams {
  username: string;
  password: string;
}

export interface UserInfo {
  id: number;
  username: string;
  role: string;
}

export interface LoginResult {
  accessToken: string;
  signingKey: string;
  mustChangePassword: boolean;
  user: UserInfo;
}

export const authService = {
  async login(params: LoginParams): Promise<LoginResult> {
    const response = await axiosInstance.post('/api/auth/login', params);
    return response.data.data;
  },

  async register(params: RegisterParams): Promise<void> {
    await axiosInstance.post('/api/auth/register', params);
  },

  async refresh(): Promise<LoginResult> {
    const response = await axiosInstance.post('/api/auth/refresh');
    return response.data.data;
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
};
