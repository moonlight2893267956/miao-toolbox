import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  AutoComplete,
  Button,
  Card,
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
import { ClockCircleOutlined } from '@ant-design/icons';
import PageFadeIn from '../../../components/shared/PageFadeIn';
import ToolPageHeader from '../../../components/shared/ToolPageHeader';
import { schedulerApi } from './schedulerApi';
import type { NotifyConfig, ScheduledTask, TaskPayload, TargetHeader } from './types';
import { extractErrorMessage, fromLocalDateTime, toLocalDateTimeIso } from './format';
import TargetConfigForm from './components/TargetConfigForm';
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
  targetType: 'HTTP' | 'PRESET';
  targetConfig: {
    targetType?: string;
    method: string;
    url: string;
    headers?: TargetHeader[];
    body?: string | null;
    timeoutSeconds?: number | null;
  };
  cronExpression: string;
  timezone: string;
  validFrom?: Dayjs | null;
  validUntil?: Dayjs | null;
  retryCount?: number | null;
  retryInterval?: number | null;
}

const DEFAULT_VALUES: TaskFormValues = {
  name: '',
  description: '',
  targetType: 'HTTP',
  targetConfig: {
    targetType: 'HTTP',
    method: 'GET',
    url: '',
    headers: [],
    body: '',
    timeoutSeconds: 30,
  },
  cronExpression: '',
  timezone: 'Asia/Shanghai',
  validFrom: null,
  validUntil: null,
  retryCount: 0,
  retryInterval: 60,
};

/** 详情 → 表单初值（敏感 header 的 **** 占位原样带入，用户不改则后端保留原密文） */
function toFormValues(task: ScheduledTask): TaskFormValues {
  const http = task.targetConfig?.targetType === 'HTTP' ? task.targetConfig : null;
  return {
    name: task.name,
    description: task.description ?? '',
    targetType: task.targetType === 'PRESET' ? 'PRESET' : 'HTTP',
    targetConfig: {
      targetType: 'HTTP',
      method: http?.method ?? 'GET',
      url: http?.url ?? '',
      headers: (http?.headers ?? []).map((header) => ({ ...header })),
      body: http?.body ?? '',
      timeoutSeconds: http?.timeoutSeconds ?? 30,
    },
    cronExpression: task.cronExpression,
    timezone: task.timezone,
    validFrom: fromLocalDateTime(task.validFrom),
    validUntil: fromLocalDateTime(task.validUntil),
    retryCount: task.retryCount ?? 0,
    retryInterval: task.retryInterval ?? 60,
  };
}

/** 时区校验：用 Intl 构造一次即知是否合法（IANA 名） */
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

/** 任务表单页（FR-1/FR-2/FR-3）：新建 `/new` 与编辑 `/:id/edit` 共用 */
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
  /** 通知配置：Epic 2 交付前不做可视化编辑，保存时原样透传，避免被清空 */
  const [existingNotify, setExistingNotify] = useState<NotifyConfig | null>(null);

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
        setExistingNotify(task.notifyConfig ?? null);
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

      const http = values.targetConfig ?? DEFAULT_VALUES.targetConfig;
      const payload: TaskPayload = {
        name: values.name.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
        targetType: 'HTTP',
        targetConfig: {
          targetType: 'HTTP',
          method: http.method,
          url: http.url.trim(),
          // 敏感值留空提交空串 = 后端按同名保留原密文
          headers: (http.headers ?? []).map((header) => ({
            name: header.name?.trim() ?? '',
            value: header.value ?? '',
            sensitive: Boolean(header.sensitive),
          })),
          body: http.body ? http.body : null,
          timeoutSeconds: http.timeoutSeconds ?? 30,
        },
        cronExpression: (values.cronExpression ?? '').trim(),
        timezone: values.timezone,
        validFrom: toLocalDateTimeIso(from),
        validUntil: toLocalDateTimeIso(until),
        retryCount: values.retryCount ?? 0,
        retryInterval: values.retryInterval ?? 60,
        notifyConfig: existingNotify,
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
    [existingNotify, isEdit, navigate, taskId],
  );

  const header = useMemo(
    () => (
      <ToolPageHeader
        icon={<ClockCircleOutlined />}
        title={isEdit ? '编辑定时任务' : '新建定时任务'}
        subtitle="HTTP 目标 · cron 调度 · 生效窗口与失败重试"
      />
    ),
    [isEdit],
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
            <Card title="基本信息" className="ts-card" size="small">
              <Row gutter={12}>
                <Col xs={24} md={10}>
                  <Form.Item
                    name="name"
                    label="任务名称"
                    rules={[
                      { required: true, message: '请输入任务名称' },
                      { min: 2, max: 50, message: '任务名称长度须为 2-50 字' },
                    ]}
                  >
                    <Input placeholder="如：健康检查探针" maxLength={50} showCount />
                  </Form.Item>
                </Col>
                <Col xs={24} md={14}>
                  <Form.Item name="description" label="描述" rules={[{ max: 200, message: '描述最长 200 字' }]}>
                    <Input placeholder="可选，说明该任务的用途" maxLength={200} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card title="调度配置" className="ts-card" size="small">
              <Form.Item
                name="cronExpression"
                label="Cron 表达式"
                rules={[{ required: true, message: '请输入 cron 表达式' }, { max: 120, message: 'cron 表达式最长 120 字符' }]}
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
                  <Form.Item
                    name="validUntil"
                    label="生效结束（可选）"
                    extra="超过结束时间后任务自动暂停"
                  >
                    <DatePicker showTime style={{ width: '100%' }} placeholder="不填表示长期有效" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card title="目标配置" className="ts-card" size="small">
              <TargetConfigForm isEdit={isEdit} />
            </Card>

            <Card title="重试配置" className="ts-card" size="small">
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
              </Row>
            </Card>

            <Card title="通知配置" className="ts-card" size="small">
              <NotifyConfigForm existing={existingNotify} />
            </Card>

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
