import axiosInstance from '../../../../services/axiosInstance';
import type { NetworkToolMeta } from '../types';

interface ApiEnvelope<T> {
  code: string;
  data: T;
  message?: string;
}

/**
 * 拉取全部网络工具元数据（GET /api/network/tools）。
 */
export async function listNetworkTools(): Promise<NetworkToolMeta[]> {
  const response = await axiosInstance.get<ApiEnvelope<NetworkToolMeta[]>>('/api/network/tools');
  return response.data.data ?? [];
}
