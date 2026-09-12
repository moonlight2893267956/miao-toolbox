import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  QuestionCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import PageFadeIn from '../../../components/shared/PageFadeIn';
import { schedulerApi } from './schedulerApi';
import type { NotifyTrigger, ScheduledTask, ScriptParam, ScriptType, TaskPayload } from './types';
import { extractErrorMessage, fromLocalDateTime, toLocalDateTimeIso } from './format';
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

interface TaskFormValues {
  name: string;
  description?: string;
  scriptId: number | null;
  scriptVersion: number | null;
  params?: string | null;
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

  const timezoneValue = Form.useWatch('timezone', form) ?? 'Asia/Shanghai';
  const selectedScriptId = Form.useWatch('scriptId', form) ?? null;

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

  /** 拉取脚本详情中的 paramSchema，用于引导用户填写参数 */
  const loadScriptParamSchema = useCallback(async (scriptId: number) => {
    try {
      const detail = await schedulerApi.getScript(scriptId);
      setScriptParamSchema(detail.paramSchema ?? null);
    } catch {
      setScriptParamSchema(null);
    }
  }, []);

  /** 切换脚本：清空版本并默认选中最新版本（FR-5） */
  const handleScriptChange = useCallback(
    (scriptId?: number) => {
      form.setFieldValue('scriptVersion', undefined);
      setVersionOptions([]);
      setScriptParamSchema(null);
      if (scriptId === undefined || scriptId === null) {
        return;
      }
      void loadVersionOptions(scriptId).then((options) => {
        if (options.length > 0) {
          form.setFieldValue('scriptVersion', options[0].value);
        }
      });
      void loadScriptParamSchema(scriptId);
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

  /** 一键填充参数默认值：根据 paramSchema 生成 JSON 并填入 params 字段 */
  const handleFillDefaults = useCallback(() => {
    if (!scriptParamSchema || scriptParamSchema.length === 0) return;
    const obj: Record<string, unknown> = {};
    for (const p of scriptParamSchema) {
      if (p.default != null && p.default !== '') {
        obj[p.name] = p.type === 'int' ? Number(p.default) : p.type === 'bool' ? p.default === 'true' : p.default;
      }
    }
    form.setFieldValue('params', JSON.stringify(obj, null, 2));
    message.success('已填充默认参数');
  }, [scriptParamSchema, form]);

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
      .then((task) => {
        if (cancelled) return;
        setInitialValues(toFormValues(task));
        // 版本值由 initialValues 带入，此处仅预加载选项，不覆盖已绑定版本
        void loadScriptOptions({
          id: task.scriptId,
          name: task.scriptName ?? `#${task.scriptId}`,
          type: task.scriptType,
        });
        void loadVersionOptions(task.scriptId);
        void loadScriptParamSchema(task.scriptId);
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
  }, [isEdit, taskId, loadScriptOptions, loadVersionOptions, loadScriptParamSchema]);

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
        params: values.params ?? null,
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
    [form, isEdit, navigate, taskId],
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
                      label="脚本"
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
                <Form.Item
                  name="params"
                  label={
                    <div className="ts-param-label-row">
                      <span>参数（JSON）</span>
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
                            {scriptParamSchema && scriptParamSchema.length > 0 ? (
                              <>
                                <p className="ts-param-help-desc">
                                  以下参数将通过环境变量 <code>SCRIPT_PARAM_{'{NAME}'}</code> 注入脚本。
                                  按 JSON 对象格式填写，键名与参数名一致。
                                </p>
                                <div className="ts-param-table">
                                  {scriptParamSchema.map((p) => (
                                    <div key={p.name} className="ts-param-row">
                                      <div className="ts-param-row-head">
                                        <code className="ts-param-name">{p.name}</code>
                                        <Tag className="ts-param-type-tag">{p.type}</Tag>
                                        {p.default != null && p.default !== '' && (
                                          <span className="ts-param-default">默认: {p.default}</span>
                                        )}
                                      </div>
                                      {p.desc && <p className="ts-param-desc">{p.desc}</p>}
                                    </div>
                                  ))}
                                </div>
                                <Button
                                  size="small"
                                  type="primary"
                                  ghost
                                  icon={<ThunderboltOutlined />}
                                  onClick={handleFillDefaults}
                                >
                                  填充默认值
                                </Button>
                              </>
                            ) : (
                              <p className="ts-param-help-empty">
                                当前脚本未声明参数。如脚本需要入参，可在脚本管理中编辑 paramSchema。
                                无参数脚本此处留空即可。
                              </p>
                            )}
                          </div>
                        }
                      >
                        <QuestionCircleOutlined className="ts-param-help-icon" />
                      </Popover>
                    </div>
                  }
                  extra='脚本参数值，如 {"retentionDays": 30}；无参数脚本留空。悬浮 ? 查看参数声明'
                >
                  <Input.TextArea rows={3} placeholder='{"retentionDays": 30}' />
                </Form.Item>
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
