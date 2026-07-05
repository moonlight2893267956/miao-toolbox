import axiosInstance from './axiosInstance';

export interface RoleBrief {
  id: number;
  code: string;
  name: string;
}

export interface UserInfoData {
  id: number;
  username: string;
  roles: RoleBrief[];
  githubId: string | null;
  githubUsername: string | null;
  mustChangePassword: boolean;
}

export interface UpdatePasswordData {
  oldPassword: string;
  newPassword: string;
}

export const userService = {
  async getCurrentUser(): Promise<UserInfoData> {
    const response = await axiosInstance.get('/api/users/me');
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
};