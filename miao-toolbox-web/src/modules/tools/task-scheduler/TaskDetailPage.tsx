import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Descriptions, Modal, Tag, message } from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import PageFadeIn from '../../../components/shared/PageFadeIn';
import { schedulerApi } from './schedulerApi';
import type { ScheduledTask } from './types';
import { extractErrorMessage, formatDateTime, prettyJson } from './format';
import SchedulerHeader from './components/SchedulerHeader';
import SchedulerPanel from './components/SchedulerPanel';
import TaskStatusTag from './components/TaskStatusTag';
import ExecutionStatusTag from './components/ExecutionStatusTag';
import ExecutionHistoryTable from './components/ExecutionHistoryTable';
import './task-scheduler.css';

const TRIGGER_LABEL: Record<string, string> = {
  ALWAYS: '每次执行',
  ON_FAILURE: '仅失败时',
  ON_SUCCESS: '仅成功时',
};

/** 任务详情页（FR-10）：配置分区 + 执行历史 + 操作入口 */
const TaskDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const taskId = Number(id);

  const [task, setTask] = useState<ScheduledTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyToken, setHistoryToken] = useState(0);
  const refreshTimerRef = React.useRef<number | null>(null);

  useEffect(
    () => () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setTask(await schedulerApi.getTask(taskId));
    } catch (err) {
      setLoadError(extractErrorMessage(err, '任务详情加载失败'));
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = useCallback(async () => {
    if (!task) return;
    const action = task.status === 'ENABLED' ? 'pause' : 'resume';
    setBusy(true);
    try {
      await schedulerApi.toggleTask(task.id, action);
      message.success(action === 'pause' ? '任务已暂停' : '任务已恢复');
      await load();
    } catch (err) {
      message.error(extractErrorMessage(err, '操作失败'));
    } finally {
      setBusy(false);
    }
  }, [load, task]);

  const handleExecute = useCallback(async () => {
    if (!task) return;
    setBusy(true);
    try {
      await schedulerApi.executeTask(task.id);
      message.success('已提交执行，稍后刷新查看结果');
      setHistoryToken((token) => token + 1);
      refreshTimerRef.current = window.setTimeout(() => setHistoryToken((token) => token + 1), 1500);
    } catch (err) {
      message.error(extractErrorMessage(err, '触发失败'));
    } finally {
      setBusy(false);
    }
  }, [task]);

  const handleDelete = useCallback(() => {
    if (!task) return;
    Modal.confirm({
      title: '删除任务',
      content: `确定删除「${task.name}」吗？该任务的执行历史会一并删除，且不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await schedulerApi.deleteTask(task.id);
          message.success('任务已删除');
          navigate('/tools/task-scheduler');
        } catch (err) {
          message.error(extractErrorMessage(err, '删除失败'));
        }
      },
    });
  }, [navigate, task]);

  const header = (
    <SchedulerHeader
      icon={<ThunderboltOutlined />}
      title={task?.name ?? '任务详情'}
      subtitle={
        task
          ? `任务 #${task.id} · 调度${task.status === 'ENABLED' ? '运行中' : '已暂停'} · ${task.timezone}`
          : '调度配置 · 脚本配置 · 执行历史'
      }
      live={task?.status === 'ENABLED'}
      actions={
        <>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tools/task-scheduler')}>
            返回列表
          </Button>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
            刷新
          </Button>
          {task ? (
            <>
              <Button
                icon={task.status === 'ENABLED' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                loading={busy}
                onClick={() => void handleToggle()}
              >
                {task.status === 'ENABLED' ? '暂停' : '恢复'}
              </Button>
              <Button type="primary" icon={<ThunderboltOutlined />} loading={busy} onClick={() => void handleExecute()}>
                立即执行
              </Button>
              <Button icon={<EditOutlined />} onClick={() => navigate(`/tools/task-scheduler/${task.id}/edit`)}>
                编辑
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
                删除
              </Button>
            </>
          ) : null}
        </>
      }
    />
  );

  return (
    <PageFadeIn>
      <div className="ts-page">
        {header}

        {loading && !task ? (
          <div className="ts-loading">
            <span className="ts-muted">加载中…</span>
          </div>
        ) : loadError ? (
          <Alert
            type="error"
            showIcon
            message={loadError}
            action={<Button onClick={() => navigate('/tools/task-scheduler')}>返回列表</Button>}
          />
        ) : task ? (
          <>
            <SchedulerPanel label="基本信息" meta={`#${task.id}`} index={0}>
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="任务名称">{task.name}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <TaskStatusTag status={task.status} />
                </Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>
                  {task.description || <span className="ts-muted">-</span>}
                </Descriptions.Item>
                <Descriptions.Item label="上次执行状态">
                  <ExecutionStatusTag status={task.lastExecutionStatus} />
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">{formatDateTime(task.createdAt)}</Descriptions.Item>
                <Descriptions.Item label="更新时间" span={2}>{formatDateTime(task.updatedAt)}</Descriptions.Item>
              </Descriptions>
            </SchedulerPanel>

            <SchedulerPanel label="调度配置" meta="cron + 时区 + 生效窗口" tone="schedule" index={1}>
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="Cron 表达式">
                  <code className="ts-code">{task.cronExpression}</code>
                </Descriptions.Item>
                <Descriptions.Item label="时区">{task.timezone}</Descriptions.Item>
                <Descriptions.Item label="下次执行">
                  {task.nextRunAt ? (
                    <span className="ts-next-run">
                      <span className="ts-next-run-dot" aria-hidden="true" />
                      {formatDateTime(task.nextRunAt)}
                    </span>
                  ) : (
                    <span className="ts-muted">-</span>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="失败重试">
                  {task.retryCount} 次 / 间隔 {task.retryInterval} 秒
                </Descriptions.Item>
                <Descriptions.Item label="生效起始">{formatDateTime(task.validFrom)}</Descriptions.Item>
                <Descriptions.Item label="生效结束">{formatDateTime(task.validUntil)}</Descriptions.Item>
              </Descriptions>
            </SchedulerPanel>

            <SchedulerPanel label="脚本配置" meta={task.scriptName ?? `脚本 #${task.scriptId}`} tone="target" index={2}>
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="脚本名称">
                  {task.scriptName ?? <span className="ts-muted">-</span>}
                </Descriptions.Item>
                <Descriptions.Item label="脚本类型">
                  {task.scriptType ? <Tag>{task.scriptType}</Tag> : <span className="ts-muted">-</span>}
                </Descriptions.Item>
                <Descriptions.Item label="版本">v{task.scriptVersion}</Descriptions.Item>
                <Descriptions.Item label="超时">{task.timeoutSeconds} 秒</Descriptions.Item>
                <Descriptions.Item label="参数" span={2}>
                  {task.params ? (
                    <pre className="ts-body-preview">{prettyJson(JSON.parse(task.params))}</pre>
                  ) : (
                    <span className="ts-muted">无参数</span>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </SchedulerPanel>

            <SchedulerPanel label="通知配置" meta="Webhook · 邮件" tone="notify" index={3}>
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="Webhook">
                  {task.notifyConfig?.webhook?.url ? (
                    <span className="ts-url">{task.notifyConfig.webhook.url}</span>
                  ) : (
                    <span className="ts-muted">未配置</span>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Webhook 触发条件">
                  {task.notifyConfig?.webhook?.trigger
                    ? TRIGGER_LABEL[task.notifyConfig.webhook.trigger] ?? '未配置'
                    : '未配置'}
                </Descriptions.Item>
                <Descriptions.Item label="通知邮箱">
                  {task.notifyConfig?.email?.recipients?.length ? (
                    <span className="ts-url">{task.notifyConfig.email.recipients.join('、')}</span>
                  ) : (
                    <span className="ts-muted">未配置</span>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="邮件触发条件">
                  {task.notifyConfig?.email?.trigger
                    ? TRIGGER_LABEL[task.notifyConfig.email.trigger] ?? '未配置'
                    : '未配置'}
                </Descriptions.Item>
              </Descriptions>
            </SchedulerPanel>

            <SchedulerPanel
              label="执行历史"
              meta={`任务 #${task.id} · 按触发时间倒序`}
              index={4}
            >
              <ExecutionHistoryTable taskId={task.id} refreshToken={historyToken} />
            </SchedulerPanel>
          </>
        ) : null}
      </div>
    </PageFadeIn>
  );
};

export default TaskDetailPage;
