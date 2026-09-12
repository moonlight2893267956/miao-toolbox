import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  AutoComplete,
  Button,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Popover,
  Row,
  Select,
  Spin,
  Tag,
  Tooltip,
  message,
} from 'antd';
import type { Dayjs } from 'dayjs';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  EditOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import PageFadeIn from '../../../components/shared/PageFadeIn';
import { schedulerApi } from './schedulerApi';
import type { NotifyTrigger, ScheduledTask, ScriptParam, ScriptType, TaskPayload } from './types';
import {
  extractErrorMessage,
  fromLocalDateTime,
  missingParamNames,
  paramEnvName,
  parseParamSchema,
  parseParamsObject,
  toLocalDateTimeIso,
} from './format';
import SchedulerHeader from './components/SchedulerHeader';
import SchedulerPanel from './components/SchedulerPanel';
import CronField from './components/CronField';
import NotifyConfigForm from './components/NotifyConfigForm';
import './task-scheduler.css';

const COMMON_TIMEZONES = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Paris',
  'Europe/Moscow',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
].map((value) => ({ value }));

/** 脚本下拉一次拉取的上限（后端 pageSize 上限 100），搜索走客户端过滤 */
const SCRIPT_OPTION_LIMIT = 100;

interface ScriptOption {
  value: number;
  /** 纯文本 label：便于 Select 内置过滤 */
  label: string;
}

interface VersionOption {
  value: number;
  label: string;
}

function scriptTypeLabel(type?: ScriptType | null): string {
  if (type === 'PYTHON') return 'Python';
  if (type === 'SHELL') return 'Shell';
  return '脚本';
}

/** 按类型把声明里的默认值转成取值 */
function coerceParamValue(type: ScriptParam['type'], raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  if (type === 'int') {
    return typeof raw === 'number' ? raw : Number(raw);
  }
  if (type === 'bool') {
    return typeof raw === 'boolean' ? raw : String(raw) === 'true';
  }
  return String(raw);
}

/** 依据参数声明构造默认取值（仅含声明了非空默认值的参数） */
function buildDefaultParamValues(schema: ScriptParam[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const param of schema) {
    const name = param.name?.trim();
    if (!name) continue;
    const coerced = coerceParamValue(param.type, param.default);
    if (coerced !== undefined) {
      values[name] = coerced;
    }
  }
  return values;
}

/** 取值模型 → 提交用 params JSON（无有效取值返回 null） */
function buildParamsJson(
  schema: ScriptParam[],
  values?: Record<string, unknown> | null,
): string | null {
  const payload: Record<string, unknown> = {};
  for (const param of schema) {
    const name = param.name?.trim();
    if (!name) continue;
    const coerced = coerceParamValue(param.type, values?.[name]);
    if (coerced !== undefined) {
      payload[name] = coerced;
    }
  }
  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : null;
}

/** 用声明默认值补齐取值（已有值优先，不覆盖任务里已保存的值） */
function mergeParamValues(
  existing: Record<string, unknown> | null | undefined,
  schema: ScriptParam[] | null,
): Record<string, unknown> | null {
  const defaults = schema && schema.length > 0 ? buildDefaultParamValues(schema) : {};
  const merged = { ...defaults, ...(existing ?? {}) };
  return Object.keys(merged).length > 0 ? merged : null;
}

interface TaskFormValues {
  name: string;
  description?: string;
  scriptId: number | null;
  scriptVersion: number | null;
  /** 无参数声明时使用：原始参数 JSON 文本 */
  params?: string | null;
  /** 有参数声明时使用：按声明渲染的取值模型（提交时序列化为 params JSON） */
  paramValues?: Record<string, unknown> | null;
  cronExpression: string;
  timezone: string;
  validFrom?: Dayjs | null;
  validUntil?: Dayjs | null;
  retryCount?: number | null;
  retryInterval?: number | null;
  timeoutSeconds?: number | null;
  notifyConfig?: {
    webhook?: { url?: string | null; trigger?: NotifyTrigger | null } | null;
    email?: { recipients?: string[] | null; trigger?: NotifyTrigger | null } | null;
  } | null;
}

const DEFAULT_VALUES: TaskFormValues = {
  name: '',
  description: '',
  scriptId: null,
  scriptVersion: null,
  params: null,
  paramValues: null,
  cronExpression: '',
  timezone: 'Asia/Shanghai',
  validFrom: null,
  validUntil: null,
  retryCount: 0,
  retryInterval: 60,
  timeoutSeconds: 60,
  notifyConfig: {
    webhook: { url: '', trigger: 'ON_FAILURE' },
    email: { recipients: [], trigger: 'ON_FAILURE' },
  },
};

function toFormValues(task: ScheduledTask): TaskFormValues {
  return {
    name: task.name,
    description: task.description ?? '',
    scriptId: task.scriptId,
    scriptVersion: task.scriptVersion,
    params: task.params ?? null,
    paramValues: parseParamsObject(task.params),
    cronExpression: task.cronExpression,
    timezone: task.timezone,
    validFrom: fromLocalDateTime(task.validFrom),
    validUntil: fromLocalDateTime(task.validUntil),
    retryCount: task.retryCount ?? 0,
    retryInterval: task.retryInterval ?? 60,
    timeoutSeconds: task.timeoutSeconds ?? 60,
    notifyConfig: {
      webhook: {
        url: task.notifyConfig?.webhook?.url ?? '',
        trigger: task.notifyConfig?.webhook?.trigger ?? 'ON_FAILURE',
      },
      email: {
        recipients: task.notifyConfig?.email?.recipients ?? [],
        trigger: task.notifyConfig?.email?.trigger ?? 'ON_FAILURE',
      },
    },
  };
}

function buildNotifyPayload(
  notify?: TaskFormValues['notifyConfig'],
): TaskPayload['notifyConfig'] {
  const webhookUrl = notify?.webhook?.url?.trim() ?? '';
  const recipients = (notify?.email?.recipients ?? [])
    .map((r) => (r ?? '').trim())
    .filter((r) => r.length > 0);
  if (!webhookUrl && recipients.length === 0) {
    return null;
  }
  return {
    webhook: webhookUrl
      ? { url: webhookUrl, trigger: notify?.webhook?.trigger ?? 'ON_FAILURE' }
      : null,
    email: recipients.length > 0
      ? { recipients, trigger: notify?.email?.trigger ?? 'ON_FAILURE' }
      : null,
  };
}

function validateTimezone(_rule: unknown, value?: string): Promise<void> {
  if (!value) {
    return Promise.resolve();
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return Promise.resolve();
  } catch {
    return Promise.reject(new Error('时区无效，请输入 IANA 时区名，如 Asia/Shanghai'));
  }
}

/** 任务表单页（FR-3）：新建 `/new` 与编辑 `/:id/edit` 共用 */
const TaskFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const taskId = Number(id);
  const location = useLocation();
  /** KeepAlive 下本页被缓存而非卸载，用 pathname 判断是否处于激活状态 */
  const isActive =
    location.pathname ===
    (isEdit ? `/tools/task-scheduler/${taskId}/edit` : '/tools/task-scheduler/new');

  const [form] = Form.useForm<TaskFormValues>();
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<TaskFormValues>(DEFAULT_VALUES);

  /** 脚本 / 版本下拉选项 */
  const [scriptOptions, setScriptOptions] = useState<ScriptOption[]>([]);
  const [scriptOptionsLoading, setScriptOptionsLoading] = useState(true);
  const [versionOptions, setVersionOptions] = useState<VersionOption[]>([]);
  const [versionOptionsLoading, setVersionOptionsLoading] = useState(false);
  const [versionRefreshing, setVersionRefreshing] = useState(false);
  /** 当前选中脚本的参数声明（从脚本详情拉取，用于引导用户填写参数） */
  const [scriptParamSchema, setScriptParamSchema] = useState<ScriptParam[] | null>(null);
  /** 脚本是否声明了参数：决定参数区渲染结构化表单还是原始 JSON 文本框 */
  const hasParamSchema = Boolean(scriptParamSchema && scriptParamSchema.length > 0);

  const timezoneValue = Form.useWatch('timezone', form) ?? 'Asia/Shanghai';
  const selectedScriptId = Form.useWatch('scriptId', form) ?? null;
  const watchedParamValues = Form.useWatch('paramValues', form);

  /** 声明了但任务里没有取值的参数：脚本内会读到空值，需显式提示 */
  const missingParams = useMemo(
    () =>
      missingParamNames(
        scriptParamSchema,
        watchedParamValues as Record<string, unknown> | undefined,
      ),
    [scriptParamSchema, watchedParamValues],
  );

  /**
   * 拉取脚本下拉选项（上限 SCRIPT_OPTION_LIMIT，输入过滤由 Select 客户端完成）。
   * {@code ensure}：编辑场景下若目标脚本不在前 N 条内，补一条选项避免下拉显示裸 ID。
   */
  const loadScriptOptions = useCallback(
    async (ensure?: { id: number; name: string; type?: ScriptType | null }) => {
      setScriptOptionsLoading(true);
      try {
        const data = await schedulerApi.listScripts({ page: 1, pageSize: SCRIPT_OPTION_LIMIT });
        const options: ScriptOption[] = (data.items ?? []).map((s) => ({
          value: s.id,
          label: `${s.name} · ${scriptTypeLabel(s.scriptType)}`,
        }));
        if (ensure && !options.some((option) => option.value === ensure.id)) {
          options.unshift({
            value: ensure.id,
            label: `${ensure.name} · ${scriptTypeLabel(ensure.type)}`,
          });
        }
        setScriptOptions(options);
      } catch (err) {
        message.error(extractErrorMessage(err, '脚本列表加载失败'));
      } finally {
        setScriptOptionsLoading(false);
      }
    },
    [],
  );

  /** 拉取指定脚本的版本选项（后端按版本倒序返回，首项即最新） */
  const loadVersionOptions = useCallback(async (scriptId: number) => {
    setVersionOptionsLoading(true);
    try {
      const versions = await schedulerApi.listScriptVersions(scriptId);
      const options: VersionOption[] = versions.map((v, index) => ({
        value: v.version,
        label: index === 0 ? `v${v.version}（最新）` : `v${v.version}`,
      }));
      setVersionOptions(options);
      return options;
    } catch (err) {
      setVersionOptions([]);
      message.error(extractErrorMessage(err, '脚本版本加载失败'));
      return [];
    } finally {
      setVersionOptionsLoading(false);
    }
  }, []);

  /**
   * 拉取脚本详情中的 paramSchema（后端为 JSON 字符串，需解析为数组）。
   * {@code prefillDefaults}：按声明默认值预填取值（PRD FR-5「带默认值预填」）。
   */
  const loadScriptParamSchema = useCallback(
    async (scriptId: number, prefillDefaults = false) => {
      let schema: ScriptParam[] | null = null;
      try {
        const detail = await schedulerApi.getScript(scriptId);
        schema = parseParamSchema(detail.paramSchema);
      } catch {
        schema = null;
      }
      setScriptParamSchema(schema);
      if (prefillDefaults) {
        form.setFieldValue('paramValues', mergeParamValues(null, schema));
      }
    },
    [form],
  );

  /** 切换脚本：清空版本/参数并默认选中最新版本 + 按新脚本声明预填默认参数（FR-5） */
  const handleScriptChange = useCallback(
    (scriptId?: number) => {
      form.setFieldValue('scriptVersion', undefined);
      setVersionOptions([]);
      setScriptParamSchema(null);
      // 换脚本后旧参数值不再适用，清空后按新脚本的声明重新预填
      form.setFieldValue('paramValues', null);
      form.setFieldValue('params', null);
      if (scriptId === undefined || scriptId === null) {
        return;
      }
      void loadVersionOptions(scriptId).then((options) => {
        if (options.length > 0) {
          form.setFieldValue('scriptVersion', options[0].value);
        }
      });
      void loadScriptParamSchema(scriptId, true);
    },
    [form, loadVersionOptions, loadScriptParamSchema],
  );

  /** 手动刷新版本列表：重新拉取当前脚本的版本，若发现更新版本则提示 */
  const handleRefreshVersions = useCallback(async () => {
    if (selectedScriptId === null || selectedScriptId === undefined) return;
    setVersionRefreshing(true);
    try {
      const options = await loadVersionOptions(selectedScriptId);
      const currentVersion = form.getFieldValue('scriptVersion');
      if (options.length > 0 && currentVersion != null) {
        const latest = options[0].value;
        if (latest !== currentVersion) {
          message.info(`发现新版本 v${latest}，当前绑定 v${currentVersion}`);
        } else {
          message.success('已是最新版本');
        }
      }
    } finally {
      setVersionRefreshing(false);
    }
  }, [selectedScriptId, form, loadVersionOptions]);

  /** 一键填充参数默认值：按参数声明的默认值填充取值表单 */
  const handleFillDefaults = useCallback(() => {
    if (!scriptParamSchema || scriptParamSchema.length === 0) return;
    const defaults = buildDefaultParamValues(scriptParamSchema);
    form.setFieldValue('paramValues', defaults);
    if (Object.keys(defaults).length === 0) {
      message.warning('该脚本的参数均未设置默认值，请手动填写');
      return;
    }
    message.success('已填充默认参数');
  }, [scriptParamSchema, form]);

  /**
   * 跳到脚本编辑 / 新建页。
   *
   * KeepAlive 会缓存本页（隐藏而非卸载），因此跳转不会丢失未保存的任务配置，
   * 用户在脚本页保存后切回本页即可继续编辑——无需「放弃修改」确认。
   */
  const handleOpenScript = useCallback(
    (mode: 'edit' | 'new') => {
      navigate(
        mode === 'new'
          ? '/tools/task-scheduler/scripts/new'
          : `/tools/task-scheduler/scripts/${selectedScriptId}/edit`,
      );
    },
    [navigate, selectedScriptId],
  );

  /**
   * 从脚本页返回时同步脚本侧的最新状态：可能刚发布了新版本或改了参数声明。
   * 参数取值按「已有值优先」合并，新声明的参数自动带入默认值（已清空的不回补）。
   */
  const refreshFromScript = useCallback(async () => {
    const scriptId = form.getFieldValue('scriptId') as number | undefined;
    if (!scriptId) return;
    await loadVersionOptions(scriptId);
    let schema: ScriptParam[] | null = null;
    try {
      schema = parseParamSchema((await schedulerApi.getScript(scriptId)).paramSchema);
    } catch {
      return;
    }
    setScriptParamSchema(schema);
    const current = form.getFieldValue('paramValues') as Record<string, unknown> | undefined;
    form.setFieldValue('paramValues', mergeParamValues(current, schema));
  }, [form, loadVersionOptions]);

  /** 首次激活由加载逻辑负责；此后每次回到本页都重新同步一次脚本侧状态 */
  const skipFirstActivateRef = useRef(true);
  useEffect(() => {
    if (skipFirstActivateRef.current) {
      skipFirstActivateRef.current = false;
      return;
    }
    if (!isActive) return;
    void refreshFromScript();
  }, [isActive, refreshFromScript]);

  useEffect(() => {
    if (!isEdit) {
      setInitialValues(DEFAULT_VALUES);
      setScriptOptionsLoading(false);
      void loadScriptOptions();
      return;
    }
    let cancelled = false;
    setLoading(true);
    schedulerApi
      .getTask(taskId)
      .then(async (task) => {
        if (cancelled) return;
        const formValues = toFormValues(task);
        // 参数声明：编辑态一并拉取，并用声明默认值补齐取值（任务已有值优先）。
        // PRD FR-2 明确「参数 schema 变更不影响已绑定任务」——执行用的是任务保存的
        // 参数值，因此这里只做预填，需保存任务后生效。
        let schema: ScriptParam[] | null = null;
        try {
          const detail = await schedulerApi.getScript(task.scriptId);
          schema = parseParamSchema(detail.paramSchema);
        } catch {
          schema = null;
        }
        if (cancelled) return;
        setScriptParamSchema(schema);
        setInitialValues({
          ...formValues,
          paramValues: mergeParamValues(formValues.paramValues, schema),
        });
        // 版本值由 initialValues 带入，此处仅预加载选项，不覆盖已绑定版本
        void loadScriptOptions({
          id: task.scriptId,
          name: task.scriptName ?? `#${task.scriptId}`,
          type: task.scriptType,
        });
        void loadVersionOptions(task.scriptId);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(extractErrorMessage(err, '任务详情加载失败'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, taskId, loadScriptOptions, loadVersionOptions]);

  const handleSubmit = useCallback(
    async (values: TaskFormValues) => {
      const from = values.validFrom ?? null;
      const until = values.validUntil ?? null;
      if (from && until && !until.isAfter(from)) {
        message.error('生效结束时间需晚于生效起始时间');
        return;
      }

      const payload: TaskPayload = {
        name: values.name.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
        scriptId: values.scriptId!,
        scriptVersion: values.scriptVersion!,
        // 有参数声明 → 用结构化取值序列化；无声明 → 用原始 JSON 文本
        params: hasParamSchema
          ? buildParamsJson(scriptParamSchema ?? [], values.paramValues)
          : (values.params ?? null),
        cronExpression: (values.cronExpression ?? '').trim(),
        timezone: values.timezone,
        validFrom: toLocalDateTimeIso(from),
        validUntil: toLocalDateTimeIso(until),
        retryCount: values.retryCount ?? 0,
        retryInterval: values.retryInterval ?? 60,
        timeoutSeconds: values.timeoutSeconds ?? 60,
        notifyConfig: buildNotifyPayload(values.notifyConfig),
      };

      setSubmitting(true);
      try {
        if (isEdit) {
          await schedulerApi.updateTask(taskId, payload);
          message.success('任务已更新');
        } else {
          await schedulerApi.createTask(payload);
          message.success('任务已创建');
          // KeepAlive 下本页不会卸载：创建后重置，避免下次「新建任务」残留上次内容
          form.resetFields();
          setVersionOptions([]);
        }
        navigate('/tools/task-scheduler');
      } catch (err) {
        message.error(extractErrorMessage(err, '保存失败'));
      } finally {
        setSubmitting(false);
      }
    },
    [form, hasParamSchema, isEdit, navigate, scriptParamSchema, taskId],
  );

  const header = (
    <SchedulerHeader
      icon={<ClockCircleOutlined />}
      title={isEdit ? '编辑定时任务' : '新建定时任务'}
      subtitle="脚本执行 · cron 调度 · 生效窗口与失败重试"
      actions={
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tools/task-scheduler')}>
          返回列表
        </Button>
      }
    />
  );

  if (loading) {
    return (
      <PageFadeIn>
        <div className="ts-page">
          {header}
          <div className="ts-loading">
            <Spin />
          </div>
        </div>
      </PageFadeIn>
    );
  }

  return (
    <PageFadeIn>
      <div className="ts-page">
        {header}

        {loadError ? (
          <Alert
            type="error"
            showIcon
            message={loadError}
            action={<Button onClick={() => navigate('/tools/task-scheduler')}>返回列表</Button>}
          />
        ) : (
          <Form<TaskFormValues>
            form={form}
            layout="vertical"
            className="ts-form"
            initialValues={initialValues}
            onFinish={(values) => void handleSubmit(values)}
            scrollToFirstError
          >
            <div className="ts-form-stack">
              <SchedulerPanel label="基本信息" meta="名称与用途" index={0}>
                <Row gutter={12}>
                  <Col xs={24} md={10}>
                    <Form.Item
                      name="name"
                      label="任务名称"
                      rules={[
                        { required: true, message: '请输入任务名称' },
                        { min: 2, max: 50, message: '任务名称长度须为 2-50 字', transform: (v?: string) => v?.trim() },
                      ]}
                    >
                      <Input placeholder="如：清理过期日志" maxLength={50} showCount />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={14}>
                    <Form.Item name="description" label="描述" rules={[{ max: 200, message: '描述最长 200 字' }]}>
                      <Input placeholder="可选，说明该任务的用途" maxLength={200} />
                    </Form.Item>
                  </Col>
                </Row>
              </SchedulerPanel>

              <SchedulerPanel label="调度配置" meta="cron + 时区 + 生效窗口" tone="schedule" index={1}>
                <Form.Item
                  name="cronExpression"
                  label="Cron 表达式"
                  rules={[
                    { required: true, message: '请输入 cron 表达式' },
                    { max: 120, message: 'cron 表达式最长 120 字符' },
                  ]}
                  extra="5 位 Unix 方言会自动补秒；服务端保存时会做二次校验与规范化"
                >
                  <CronField timezone={timezoneValue} dialect={isEdit ? 'spring6' : 'linux5'} />
                </Form.Item>

                <Row gutter={12}>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="timezone"
                      label="时区"
                      rules={[{ required: true, message: '请输入时区' }, { validator: validateTimezone }]}
                    >
                      <AutoComplete
                        options={COMMON_TIMEZONES}
                        placeholder="Asia/Shanghai"
                        filterOption={(input, option) =>
                          String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="validFrom" label="生效起始（可选）">
                      <DatePicker showTime style={{ width: '100%' }} placeholder="不填表示立即生效" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="validUntil" label="生效结束（可选）" extra="超过结束时间后任务自动暂停">
                      <DatePicker showTime style={{ width: '100%' }} placeholder="不填表示长期有效" />
                    </Form.Item>
                  </Col>
                </Row>
              </SchedulerPanel>

              <SchedulerPanel label="脚本配置" meta="关联脚本版本与参数" tone="target" index={2}>
                <Row gutter={12}>
                  <Col xs={24} md={14}>
                    <Form.Item
                      name="scriptId"
                      label={
                        <div className="ts-version-label-row">
                          <span>脚本</span>
                          <span className="ts-script-jump">
                            <Tooltip
                              title={
                                selectedScriptId
                                  ? '打开该脚本的编辑页；本页已填写的内容会保留'
                                  : '请先选择脚本'
                              }
                            >
                              <Button
                                type="text"
                                size="small"
                                className="ts-script-jump-btn"
                                icon={<EditOutlined />}
                                disabled={!selectedScriptId}
                                onClick={() => handleOpenScript('edit')}
                              >
                                编辑脚本
                              </Button>
                            </Tooltip>
                            <Tooltip title="新建脚本；本页已填写的内容会保留">
                              <Button
                                type="text"
                                size="small"
                                className="ts-script-jump-btn"
                                icon={<PlusOutlined />}
                                onClick={() => handleOpenScript('new')}
                              >
                                新建
                              </Button>
                            </Tooltip>
                          </span>
                        </div>
                      }
                      rules={[{ required: true, message: '请选择脚本' }]}
                    >
                      <Select
                        showSearch
                        allowClear
                        loading={scriptOptionsLoading}
                        placeholder="选择要执行的脚本"
                        options={scriptOptions}
                        optionFilterProp="label"
                        onChange={(value?: number) => handleScriptChange(value)}
                        notFoundContent={
                          scriptOptionsLoading ? (
                            <div className="ts-select-loading">
                              <Spin size="small" />
                            </div>
                          ) : (
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description="暂无脚本，请先到「脚本管理」创建"
                            />
                          )
                        }
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={10}>
                    <Form.Item
                      name="scriptVersion"
                      label={
                        <div className="ts-version-label-row">
                          <span>版本</span>
                          <Tooltip title="刷新脚本版本列表">
                            <Button
                              type="text"
                              size="small"
                              className="ts-version-refresh-btn"
                              icon={<ReloadOutlined spin={versionRefreshing || versionOptionsLoading} />}
                              disabled={!selectedScriptId || versionRefreshing}
                              onClick={() => void handleRefreshVersions()}
                            />
                          </Tooltip>
                        </div>
                      }
                      rules={[{ required: true, message: '请选择脚本版本' }]}
                      extra="任务绑定固定版本；脚本后续发布新版本不影响本任务"
                    >
                      <Select
                        loading={versionOptionsLoading}
                        disabled={selectedScriptId === null || selectedScriptId === undefined}
                        placeholder={selectedScriptId ? '选择版本' : '请先选择脚本'}
                        options={versionOptions}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <div className="ts-param-section">
                  <div className="ts-param-section-head">
                    <span className="ts-param-section-title">参数</span>
                    <Popover
                      trigger="hover"
                      placement="rightTop"
                      overlayClassName="ts-param-popover"
                      content={
                        <div className="ts-param-help">
                          <div className="ts-param-help-title">
                            <ThunderboltOutlined />
                            <span>脚本参数说明</span>
                          </div>
                          {hasParamSchema ? (
                            <>
                              <p className="ts-param-help-desc">
                                参数取值来自本页填写的内容，脚本内通过对应环境变量读取。
                                <strong>未填写的参数在脚本内为空值</strong>；若参数声明里配置了默认值，
                                可用「填充默认值」一键带入。
                              </p>
                              <div className="ts-param-table">
                                {(scriptParamSchema ?? []).map((p) => (
                                  <div key={p.name} className="ts-param-row">
                                    <div className="ts-param-row-head">
                                      <code className="ts-param-name">{p.name}</code>
                                      <Tag className="ts-param-type-tag">{p.type}</Tag>
                                      {p.default != null && p.default !== '' && (
                                        <span className="ts-param-default">默认: {p.default}</span>
                                      )}
                                    </div>
                                    <div className="ts-param-env">
                                      脚本内取值：<code>${paramEnvName(p.name.trim())}</code>
                                    </div>
                                    {p.desc && <p className="ts-param-desc">{p.desc}</p>}
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <p className="ts-param-help-empty">
                              当前脚本未声明参数。如脚本需要入参，可在「脚本管理」中编辑参数声明。
                            </p>
                          )}
                        </div>
                      }
                    >
                      <QuestionCircleOutlined className="ts-param-help-icon" />
                    </Popover>
                    {hasParamSchema && (
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        icon={<ThunderboltOutlined />}
                        className="ts-param-fill-btn"
                        onClick={handleFillDefaults}
                      >
                        填充默认值
                      </Button>
                    )}
                  </div>

                  {hasParamSchema && missingParams.length > 0 && (
                    <Alert
                      className="ts-param-missing-alert"
                      type="warning"
                      showIcon
                      message={`${missingParams.length} 个参数在任务里没有取值：${missingParams.join('、')}`}
                      description="脚本内将读到空值。参数值随任务保存生效——填写下方取值（或点「填充默认值」）后保存任务即可；脚本参数声明的后续变更不会影响已创建的任务。"
                    />
                  )}

                  {hasParamSchema ? (
                    <Row gutter={12}>
                      {(scriptParamSchema ?? []).map((param) => (
                        <Col xs={24} md={12} key={param.name}>
                          <Form.Item
                            name={['paramValues', param.name.trim()]}
                            label={
                              <div className="ts-param-field-label">
                                <span className="ts-param-field-name">{param.name}</span>
                                <Tag className="ts-param-type-tag">{param.type}</Tag>
                              </div>
                            }
                            extra={
                              <span className="ts-param-field-extra">
                                脚本内取值 <code>${paramEnvName(param.name.trim())}</code>
                                {param.desc ? ` · ${param.desc}` : ''}
                              </span>
                            }
                          >
                            {param.type === 'int' ? (
                              <InputNumber style={{ width: '100%' }} placeholder="整数" />
                            ) : param.type === 'bool' ? (
                              <Select
                                allowClear
                                placeholder="true / false"
                                options={[
                                  { value: true, label: 'true' },
                                  { value: false, label: 'false' },
                                ]}
                              />
                            ) : (
                              <Input placeholder="字符串值" allowClear />
                            )}
                          </Form.Item>
                        </Col>
                      ))}
                    </Row>
                  ) : (
                    <Form.Item
                      name="params"
                      extra='脚本未声明参数，如需传参可在此填写 JSON，如 {"key": "value"}'
                    >
                      <Input.TextArea rows={3} placeholder='{"retentionDays": 30}' />
                    </Form.Item>
                  )}
                </div>
              </SchedulerPanel>

              <SchedulerPanel label="重试与超时" meta="执行失败后的重试策略" index={3}>
                <Row gutter={12}>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="retryCount"
                      label="失败重试次数"
                      rules={[{ type: 'number', min: 0, max: 5, message: '重试次数范围 0-5' }]}
                    >
                      <InputNumber min={0} max={5} style={{ width: 160 }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="retryInterval"
                      label="重试间隔（秒）"
                      rules={[{ type: 'number', min: 1, max: 3600, message: '重试间隔范围 1-3600 秒' }]}
                    >
                      <InputNumber min={1} max={3600} style={{ width: 160 }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="timeoutSeconds"
                      label="执行超时（秒）"
                      rules={[{ type: 'number', min: 1, max: 600, message: '超时范围 1-600 秒' }]}
                    >
                      <InputNumber min={1} max={600} style={{ width: 160 }} />
                    </Form.Item>
                  </Col>
                </Row>
              </SchedulerPanel>

              <SchedulerPanel label="通知配置" meta="Webhook · 邮件" tone="notify" index={4}>
                <NotifyConfigForm />
              </SchedulerPanel>
            </div>

            <div className="ts-form-actions">
              <Button onClick={() => navigate('/tools/task-scheduler')}>取消</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                保存
              </Button>
            </div>
          </Form>
        )}
      </div>
    </PageFadeIn>
  );
};

export default TaskFormPage;
