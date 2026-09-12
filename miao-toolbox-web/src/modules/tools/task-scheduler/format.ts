/**
 * 展示与表单转换小工具（日期/耗时/错误消息）。
 *
 * 后端 `LocalDateTime` 无时区语义，序列化为 ISO 局部时间串（如 2026-09-10T14:30:00），
 * 展示时直接按字面值格式化，不做时区换算——与「任务时区只影响 cron 触发」的语义一致。
 */
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { ScriptParam } from './types';

/** LocalDateTime → 'YYYY-MM-DD HH:mm:ss'；空值显示 '-' */
export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
}

/** 耗时毫秒 → 人类可读 */
export function formatDuration(ms?: number | null): string {
  if (ms === null || ms === undefined) return '-';
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${Math.round(seconds % 60)} 秒`;
}

/** 提取后端统一错误响应体中的中文 message（{code,message,requestId}） */
export function extractErrorMessage(err: unknown, fallback = '操作失败'): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string } | undefined;
  return e?.response?.data?.message || e?.message || fallback;
}

/** dayjs → 后端 LocalDateTime 可解析的 ISO 局部时间串 */
export function toLocalDateTimeIso(value?: Dayjs | null): string | null {
  return value ? value.format('YYYY-MM-DDTHH:mm:ss') : null;
}

/** 后端 LocalDateTime 串 → dayjs（表单回填） */
export function fromLocalDateTime(value?: string | null): Dayjs | null {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}

/** 摘要 JSON 对象 → 缩进文本（执行详情展开行展示） */
export function prettyJson(value?: Record<string, unknown> | null): string {
  if (!value) return '（无）';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** http/https 协议校验（Webhook URL 用，与后端 FR-15 白名单一致；SSRF 由服务端判定）。空值放行。 */
export function validateUrl(_rule: unknown, value?: string): Promise<void> {
  if (!value) {
    return Promise.resolve();
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return Promise.reject(new Error('URL 格式不正确'));
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return Promise.reject(new Error('仅支持 http/https 协议'));
  }
  return Promise.resolve();
}

/** 邮箱格式预检（正则与后端 TaskService.EMAIL_PATTERN 一致；后端仍做最终校验）。空值放行。 */
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function validateEmails(_rule: unknown, value?: string[]): Promise<void> {
  if (!value || value.length === 0) {
    return Promise.resolve();
  }
  const invalid = value.find((item) => !EMAIL_PATTERN.test((item ?? '').trim()));
  if (invalid) {
    return Promise.reject(new Error(`邮箱格式不正确：${invalid}`));
  }
  return Promise.resolve();
}

/**
 * 参数名 → 环境变量名：前缀 `SCRIPT_PARAM_` + 大写下划线。
 *
 * 必须与后端 `ScriptTaskExecutor.paramEnvName` **逐字符一致**——UI 提示与编辑器补全
 * 都以此为准，一旦不一致，用户按提示写的 `$SCRIPT_PARAM_XXX` 在运行时拿不到值。
 * 例：`retentionDays` → `SCRIPT_PARAM_RETENTION_DAYS`，`data` → `SCRIPT_PARAM_DATA`。
 */
export function paramEnvName(name: string): string {
  const sb: string[] = ['SCRIPT_PARAM', '_'];
  for (let i = 0; i < name.length; i++) {
    const c = name[i];
    const boundary = /[A-Z]/.test(c) && i > 0 && /[a-z0-9]/.test(name[i - 1]);
    if (boundary && sb[sb.length - 1] !== '_') sb.push('_');
    if (/[A-Za-z0-9]/.test(c)) {
      sb.push(c.toUpperCase());
    } else if (sb[sb.length - 1] !== '_') {
      sb.push('_');
    }
  }
  while (sb.length > 0 && sb[sb.length - 1] === '_') sb.pop();
  return sb.join('');
}

/**
 * 脚本参数声明解析。
 *
 * 后端 `Script.paramSchema` 是 JSON 文本（可能是字符串，也可能因序列化差异已是数组），
 * 统一在此收敛，避免各处重复解析出不一致结果。无声明/解析失败返回 null。
 */
export function parseParamSchema(raw?: string | ScriptParam[] | null): ScriptParam[] | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ScriptParam[]) : null;
    } catch {
      return null;
    }
  }
  return Array.isArray(raw) ? raw : null;
}

/** 任务参数快照解析：JSON 文本 → 取值对象（非对象/解析失败返回 null） */
export function parseParamsObject(raw?: string | null): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * 声明了参数、但任务参数快照里没有取值的参数名列表。
 *
 * 非空即意味着任务已创建在当时尚无默认值的脚本声明上——脚本内对应
 * `SCRIPT_PARAM_*` 会展开为空串。参数是任务级别的快照（PRD FR-2）：
 * 脚本声明/默认值的后续变更不会回溯已有任务，需进任务编辑页保存一次。
 */
export function missingParamNames(
  schema: ScriptParam[] | null | undefined,
  params: Record<string, unknown> | null | undefined,
): string[] {
  return (schema ?? [])
    .map((param) => param.name?.trim())
    .filter((name): name is string => Boolean(name))
    .filter((name) => {
      const value = params?.[name];
      return value === undefined || value === null || value === '';
    });
}
