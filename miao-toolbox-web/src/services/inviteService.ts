import axiosInstance from './axiosInstance';

export interface InviteInfo {
  token: string;
  roleId: number;
  roleName: string;
  roleCode: string;
  expiresAt: string;
}

export interface CreateInviteParams {
  expiresInDays?: number;
}

export const inviteService = {
  async createInvite(roleId: number, params: CreateInviteParams = {}): Promise<InviteInfo> {
    const response = await axiosInstance.post(`/api/admin/roles/${roleId}/invites`, params);
    return response.data.data;
  },
};
