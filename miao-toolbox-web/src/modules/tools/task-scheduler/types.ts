/**
 * 定时任务调度模块类型定义（与后端 DTO / 枚举对齐）。
 *
 * 契约来源：`com.miao.toolbox.tool.scheduler.controller.SchedulerController` + `dto/*`。
 * 枚举统一用字符串字面量联合（取值与 Java enum name 一致，不使用 TS enum）。
 */

export type TargetType = 'HTTP' | 'PRESET';
export type TaskStatus = 'ENABLED' | 'PAUSED';
export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'SKIPPED';
export type TriggerType = 'SCHEDULED' | 'MANUAL';
export type NotifyTrigger = 'ALWAYS' | 'ON_FAILURE' | 'ON_SUCCESS';
export type ToggleAction = 'pause' | 'resume';

/** HTTP 请求头（sensitive=true 时后端加密存储，接口回显 ****） */
export interface TargetHeader {
  name: string;
  value: string;
  sensitive: boolean;
}

/** HTTP 目标配置（多态判别字段 targetType） */
export interface HttpTargetConfig {
  targetType: 'HTTP';
  method: string;
  url: string;
  headers: TargetHeader[];
  body?: string | null;
  /** 单次执行超时（秒，1-120）——HTTP 执行器实际使用的超时 */
  timeoutSeconds?: number | null;
}

/** 预置运维模板目标（Epic 3 交付，本模块仅类型占位） */
export interface PresetTargetConfig {
  targetType: 'PRESET';
  template: string;
  params?: Record<string, unknown> | null;
}

export type TaskTargetConfig = HttpTargetConfig | PresetTargetConfig;

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
  targetType: TargetType;
  cronExpression: string;
  status: TaskStatus;
  nextRunAt?: string | null;
  lastExecutionStatus?: ExecutionStatus | null;
  createdAt?: string | null;
}

/** 任务详情（GET /api/scheduler/tasks/{id}）：敏感 header 值为 **** */
export interface ScheduledTask {
  id: number;
  name: string;
  description?: string | null;
  targetType: TargetType;
  targetConfig: TaskTargetConfig;
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

/** 新建 / 编辑任务提交体（CreateTaskRequest / UpdateTaskRequest 的公共字段） */
export interface TaskPayload {
  name: string;
  description?: string | null;
  targetType: TargetType;
  targetConfig: TaskTargetConfig;
  cronExpression: string;
  timezone: string;
  validFrom?: string | null;
  validUntil?: string | null;
  retryCount?: number | null;
  retryInterval?: number | null;
  notifyConfig?: NotifyConfig | null;
}
