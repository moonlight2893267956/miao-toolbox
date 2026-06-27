import axiosInstance from './axiosInstance';

// ===== AI 调用记录类型 =====

export interface AiInvocationItem {
  id: number;
  requestId: string;
  userId: number;
  username: string;
  agentName: string;
  model: string | null;
  mode: string | null;
  status: string;
  errorCode: string | null;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  traceId: string | null;
  createdAt: string;
}

export interface AiInvocationQuery {
  startTime?: string;
  endTime?: string;
  userId?: number;
  agentName?: string;
  model?: string;
  status?: string;
  traceId?: string;
  page?: number;
  pageSize?: number;
}

export interface PagedAiInvocations {
  items: AiInvocationItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ===== AI 仪表盘统计 =====

export interface AgentDistributionItem {
  agentName: string;
  count: number;
}

export interface ModelDistributionItem {
  model: string;
  count: number;
}

export interface TokenTrendItem {
  date: string;
  tokens: number;
}

export interface ErrorCodeItem {
  errorCode: string;
  count: number;
}

export interface DashboardAiStats {
  totalCalls: number;
  totalTokens: number;
  failureRate: number;
  onlineUsers: number;
  agentDistribution: AgentDistributionItem[];
  modelDistribution: ModelDistributionItem[];
  tokenTrend7d: TokenTrendItem[];
  errorCodesTop5: ErrorCodeItem[];
}

// ===== 用户 AI 用量 =====

export interface UserUsageSummary {
  totalCalls: number;
  totalTokens: number;
  failureRate: number;
  lastCalledAt: string | null;
  agentCount: number;
  modelCount: number;
}

// ===== API 函数 =====

/** 获取 AI 仪表盘统计（近 7 天） */
export async function getDashboardAiStats(): Promise<DashboardAiStats> {
  const res = await axiosInstance.get('/api/admin/ai-invocations/summary');
  return res.data.data;
}

/** 分页查询 AI 调用日志 */
export async function getAiInvocations(query: AiInvocationQuery): Promise<PagedAiInvocations> {
  const params = new URLSearchParams();
  if (query.startTime) params.append('startTime', query.startTime);
  if (query.endTime) params.append('endTime', query.endTime);
  if (query.userId) params.append('userId', String(query.userId));
  if (query.agentName) params.append('agentName', query.agentName);
  if (query.model) params.append('model', query.model);
  if (query.status) params.append('status', query.status);
  if (query.traceId) params.append('traceId', query.traceId);
  if (query.page) params.append('page', String(query.page));
  if (query.pageSize) params.append('pageSize', String(query.pageSize));

  const res = await axiosInstance.get(`/api/admin/ai-invocations?${params.toString()}`);
  return res.data.data;
}

/** 获取 Agent 下拉选项 */
export async function getAgentOptions(): Promise<string[]> {
  const res = await axiosInstance.get('/api/admin/ai-invocations/agents');
  return res.data.data;
}

/** 获取用户 AI 用量统计 */
export async function getUserUsageSummary(userId: number): Promise<UserUsageSummary> {
  const res = await axiosInstance.get(`/api/admin/users/${userId}/usage-summary`);
  return res.data.data;
}
