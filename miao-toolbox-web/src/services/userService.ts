import axiosInstance from './axiosInstance';

export interface RoleBrief {
  id: number;
  code: string;
  name: string;
}

export interface UserInfoData {
  id: number;
  username: string;
  email: string | null;
  emailVerified: boolean;
  roles: RoleBrief[];
  githubId: string | null;
  githubUsername: string | null;
  googleId: string | null;
  googleUsername: string | null;
  avatarUrl: string | null;
  mustChangePassword: boolean;
}

export interface UpdatePasswordData {
  oldPassword: string;
  newPassword: string;
}

export interface UpdateProfileData {
  username: string;
}

export const userService = {
  async getCurrentUser(): Promise<UserInfoData> {
    const response = await axiosInstance.get('/api/users/me');
    return response.data.data;
  },

  async updateProfile(data: UpdateProfileData): Promise<UserInfoData> {
    const response = await axiosInstance.put('/api/users/me/profile', data);
    return response.data.data;
  },

  async updatePassword(data: UpdatePasswordData): Promise<void> {
    await axiosInstance.put('/api/users/me/password', data);
  },

  async getBindGithubUrl(): Promise<string> {
    const response = await axiosInstance.post('/api/users/me/bind-github');
    return response.data.data;
  },

  async unbindGithub(): Promise<void> {
    await axiosInstance.delete('/api/users/me/bind-github');
  },

  async bindEmail(email: string, code: string): Promise<UserInfoData> {
    const response = await axiosInstance.post('/api/users/me/bind-email', { email, code });
    return response.data.data;
  },

  async unbindEmail(): Promise<UserInfoData> {
    const response = await axiosInstance.delete('/api/users/me/bind-email');
    return response.data.data;
  },

  async uploadAvatar(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axiosInstance.post('/api/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  async setPresetAvatar(presetName: string): Promise<string> {
    const response = await axiosInstance.put('/api/users/me/avatar/preset', { preset: presetName });
    return response.data.data;
  },
};
