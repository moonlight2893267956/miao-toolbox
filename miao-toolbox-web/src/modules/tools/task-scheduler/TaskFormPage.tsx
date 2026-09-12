import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  AutoComplete,
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Spin,
  message,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { ArrowLeftOutlined, ClockCircleOutlined } from '@ant-design/icons';
import PageFadeIn from '../../../components/shared/PageFadeIn';
import { schedulerApi } from './schedulerApi';
import type { NotifyTrigger, ScheduledTask, TaskPayload } from './types';
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

  const timezoneValue = Form.useWatch('timezone', form) ?? 'Asia/Shanghai';

  useEffect(() => {
    if (!isEdit) {
      setInitialValues(DEFAULT_VALUES);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    schedulerApi
      .getTask(taskId)
      .then((task) => {
        if (cancelled) return;
        setInitialValues(toFormValues(task));
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
  }, [isEdit, taskId]);

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
        }
        navigate('/tools/task-scheduler');
      } catch (err) {
        message.error(extractErrorMessage(err, '保存失败'));
      } finally {
        setSubmitting(false);
      }
    },
    [isEdit, navigate, taskId],
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
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="scriptId"
                      label="脚本 ID"
                      rules={[{ required: true, message: '请输入脚本 ID' }]}
                      extra="脚本管理页创建后获取 ID（脚本管理 UI 在后续 Story 交付）"
                    >
                      <InputNumber min={1} style={{ width: '100%' }} placeholder="输入脚本 ID" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="scriptVersion"
                      label="脚本版本"
                      rules={[{ required: true, message: '请输入脚本版本' }]}
                    >
                      <InputNumber min={1} style={{ width: '100%' }} placeholder="如：1" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="params" label="参数（JSON）" extra='参数值 JSON，如 {"retentionDays": 30}；无参数脚本留空'>
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
