/**
 * 定时任务调度模块类型定义（与后端 DTO / 枚举对齐）。
 *
 * V35 改造：移除 HTTP/Preset 目标类型，改为脚本引用（scriptId/scriptVersion/params）。
 */

export type TaskStatus = 'ENABLED' | 'PAUSED';
export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'SKIPPED';
export type TriggerType = 'SCHEDULED' | 'MANUAL';
export type NotifyTrigger = 'ALWAYS' | 'ON_FAILURE' | 'ON_SUCCESS';
export type ToggleAction = 'pause' | 'resume';
export type ScriptType = 'SHELL' | 'PYTHON';

/** 脚本参数 schema 项 */
export interface ScriptParam {
  name: string;
  type: 'string' | 'int' | 'bool';
  default?: string | null;
  desc?: string | null;
}

/** 脚本列表项 */
export interface ScriptListItem {
  id: number;
  name: string;
  description?: string | null;
  scriptType: ScriptType;
  latestVersion: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** 脚本详情 */
export interface ScriptDetail extends ScriptListItem {
  content: string;
  /** 后端返回 JSON 字符串（ScriptResponse.paramSchema 为 String 类型） */
  paramSchema?: string | ScriptParam[] | null;
}

/** 脚本版本 */
export interface ScriptVersion {
  id: number;
  scriptId: number;
  version: number;
  content: string;
  createdAt?: string | null;
}

export interface WebhookNotify {
  url?: string | null;
  trigger?: NotifyTrigger | null;
}

export interface EmailNotify {
  recipients?: string[] | null;
  trigger?: NotifyTrigger | null;
}

export interface NotifyConfig {
  webhook?: WebhookNotify | null;
  email?: EmailNotify | null;
}

/** 任务列表项（GET /api/scheduler/tasks） */
export interface TaskListItem {
  id: number;
  name: string;
  scriptName?: string | null;
  scriptVersion?: number | null;
  cronExpression: string;
  status: TaskStatus;
  nextRunAt?: string | null;
  lastExecutionStatus?: ExecutionStatus | null;
  createdAt?: string | null;
}

/** 任务详情（GET /api/scheduler/tasks/{id}） */
export interface ScheduledTask {
  id: number;
  name: string;
  description?: string | null;
  scriptId: number;
  scriptVersion: number;
  scriptName?: string | null;
  scriptType?: ScriptType | null;
  params?: string | null;
  cronExpression: string;
  timezone: string;
  validFrom?: string | null;
  validUntil?: string | null;
  status: TaskStatus;
  retryCount: number;
  retryInterval: number;
  timeoutSeconds: number;
  notifyConfig?: NotifyConfig | null;
  nextRunAt?: string | null;
  lastExecutionStatus?: ExecutionStatus | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** 执行历史列表项 */
export interface ExecutionListItem {
  id: number;
  triggerType: TriggerType;
  triggeredAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  status: ExecutionStatus;
  retryCount: number;
}

/** 单次执行详情（request/response 摘要为后端解析后的 JSON 对象） */
export interface TaskExecutionDetail extends ExecutionListItem {
  taskId: number;
  requestSummary?: Record<string, unknown> | null;
  responseSummary?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 新建 / 编辑任务提交体 */
export interface TaskPayload {
  name: string;
  description?: string | null;
  scriptId: number;
  scriptVersion: number;
  params?: string | null;
  cronExpression: string;
  timezone: string;
  validFrom?: string | null;
  validUntil?: string | null;
  retryCount?: number | null;
  retryInterval?: number | null;
  timeoutSeconds?: number | null;
  notifyConfig?: NotifyConfig | null;
}
