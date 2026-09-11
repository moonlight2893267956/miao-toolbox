/**
 * 定时任务调度 API 封装（后端统一响应体 {code,data,message}，此处统一解包 data）。
 *
 * 端点契约见 `com.miao.toolbox.tool.scheduler.controller.SchedulerController`。
 */
import axiosInstance from '../../../services/axiosInstance';
import type {
  ExecutionListItem,
  ExecutionStatus,
  PagedResponse,
  PresetTemplateInfo,
  ScheduledTask,
  TaskExecutionDetail,
  TaskListItem,
  TaskPayload,
  TaskStatus,
  ToggleAction,
} from './types';

const BASE = '/api/scheduler';

export interface TaskQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: TaskStatus;
}

export interface ExecutionQuery {
  page?: number;
  pageSize?: number;
  status?: ExecutionStatus;
}

export const schedulerApi = {
  /** 任务列表（分页 + 名称搜索 + 状态筛选） */
  listTasks: async (params: TaskQuery = {}): Promise<PagedResponse<TaskListItem>> => {
    const resp = await axiosInstance.get(`${BASE}/tasks`, { params });
    return resp.data.data;
  },

  /** 任务详情（敏感 header 值为 ****，含 nextRunAt） */
  getTask: async (id: number): Promise<ScheduledTask> => {
    const resp = await axiosInstance.get(`${BASE}/tasks/${id}`);
    return resp.data.data;
  },

  createTask: async (payload: TaskPayload): Promise<ScheduledTask> => {
    const resp = await axiosInstance.post(`${BASE}/tasks`, payload);
    return resp.data.data;
  },

  updateTask: async (id: number, payload: TaskPayload): Promise<ScheduledTask> => {
    const resp = await axiosInstance.put(`${BASE}/tasks/${id}`, payload);
    return resp.data.data;
  },

  deleteTask: async (id: number): Promise<void> => {
    await axiosInstance.delete(`${BASE}/tasks/${id}`);
  },

  /** 启停：pause 取消调度 / resume 重新注册 */
  toggleTask: async (id: number, action: ToggleAction): Promise<ScheduledTask> => {
    const resp = await axiosInstance.put(`${BASE}/tasks/${id}/toggle`, { action });
    return resp.data.data;
  },

  /** 手动触发（异步提交，响应不代表执行完成） */
  executeTask: async (id: number): Promise<void> => {
    await axiosInstance.post(`${BASE}/tasks/${id}/execute`);
  },

  /** 执行历史（按 triggered_at 倒序，支持状态筛选） */
  listExecutions: async (
    taskId: number,
    params: ExecutionQuery = {},
  ): Promise<PagedResponse<ExecutionListItem>> => {
    const resp = await axiosInstance.get(`${BASE}/tasks/${taskId}/executions`, { params });
    return resp.data.data;
  },

  /** 单次执行详情（request/response 摘要为 JSON 对象） */
  getExecution: async (executionId: number): Promise<TaskExecutionDetail> => {
    const resp = await axiosInstance.get(`${BASE}/executions/${executionId}`);
    return resp.data.data;
  },

  /** 预置模板列表（注册模板元信息，前端动态渲染模板选择器） */
  listPresetTemplates: async (): Promise<PresetTemplateInfo[]> => {
    const resp = await axiosInstance.get(`${BASE}/preset-templates`);
    return resp.data.data;
  },
};
