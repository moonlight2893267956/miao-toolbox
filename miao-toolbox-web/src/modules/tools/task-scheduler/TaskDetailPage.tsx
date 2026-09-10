import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Descriptions, Modal, Space, Spin, Tag, Tooltip, message } from 'antd';
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
import ToolPageHeader from '../../../components/shared/ToolPageHeader';
import { schedulerApi } from './schedulerApi';
import type { HttpTargetConfig, ScheduledTask } from './types';
import { extractErrorMessage, formatDateTime } from './format';
import TaskStatusTag from './components/TaskStatusTag';
import ExecutionStatusTag from './components/ExecutionStatusTag';
import ExecutionHistoryTable from './components/ExecutionHistoryTable';
import './task-scheduler.css';

/** 任务详情页（FR-9）：配置分区 + 执行历史 + 操作入口 */
const TaskDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const taskId = Number(id);

  const [task, setTask] = useState<ScheduledTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 自增后触发执行历史表格重新拉取 */
  const [historyToken, setHistoryToken] = useState(0);

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
    setBusy(true);
    try {
      await schedulerApi.toggleTask(task.id, task.status === 'ENABLED' ? 'pause' : 'resume');
      message.success(task.status === 'ENABLED' ? '任务已暂停' : '任务已恢复');
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
      window.setTimeout(() => setHistoryToken((token) => token + 1), 1500);
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

  const http: HttpTargetConfig | null =
    task?.targetConfig?.targetType === 'HTTP' ? (task.targetConfig as HttpTargetConfig) : null;

  return (
    <PageFadeIn>
      <div className="ts-page">
        <ToolPageHeader
          icon={<ThunderboltOutlined />}
          title={task?.name ?? '任务详情'}
          subtitle="调度配置 · 目标配置 · 执行历史"
        />

        {loading ? (
          <div className="ts-loading">
            <Spin />
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
            <div className="ts-detail-actions">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tools/task-scheduler')}>
                返回列表
              </Button>
              <Space wrap>
                <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
                  刷新
                </Button>
                <Button
                  icon={task.status === 'ENABLED' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  loading={busy}
                  onClick={() => void handleToggle()}
                >
                  {task.status === 'ENABLED' ? '暂停' : '恢复'}
                </Button>
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={busy}
                  onClick={() => void handleExecute()}
                >
                  立即执行
                </Button>
                <Button icon={<EditOutlined />} onClick={() => navigate(`/tools/task-scheduler/${task.id}/edit`)}>
                  编辑
                </Button>
                <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
                  删除
                </Button>
              </Space>
            </div>

            <Card title="基本信息" className="ts-card" size="small">
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="任务名称">{task.name}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <TaskStatusTag status={task.status} />
                </Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>
                  {task.description || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="目标类型">
                  <Tag>{task.targetType === 'HTTP' ? 'HTTP 请求' : '预置模板'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="上次执行状态">
                  <ExecutionStatusTag status={task.lastExecutionStatus} />
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">{formatDateTime(task.createdAt)}</Descriptions.Item>
                <Descriptions.Item label="更新时间">{formatDateTime(task.updatedAt)}</Descriptions.Item>
              </Descriptions>
            </Card>

            <Card title="调度配置" className="ts-card" size="small">
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="Cron 表达式">
                  <code className="ts-code">{task.cronExpression}</code>
                </Descriptions.Item>
                <Descriptions.Item label="时区">{task.timezone}</Descriptions.Item>
                <Descriptions.Item label="下次执行">{formatDateTime(task.nextRunAt)}</Descriptions.Item>
                <Descriptions.Item label="失败重试">
                  {task.retryCount} 次 / 间隔 {task.retryInterval} 秒
                </Descriptions.Item>
                <Descriptions.Item label="生效起始">{formatDateTime(task.validFrom)}</Descriptions.Item>
                <Descriptions.Item label="生效结束">{formatDateTime(task.validUntil)}</Descriptions.Item>
              </Descriptions>
            </Card>

            <Card title="目标配置" className="ts-card" size="small">
              {http ? (
                <Descriptions size="small" column={2} bordered>
                  <Descriptions.Item label="请求方法">
                    <Tag>{http.method}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="超时">
                    {http.timeoutSeconds ?? 30} 秒
                  </Descriptions.Item>
                  <Descriptions.Item label="目标 URL" span={2}>
                    <span className="ts-url">{http.url}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="请求头" span={2}>
                    {(http.headers ?? []).length === 0 ? (
                      <span className="ts-muted">未配置</span>
                    ) : (
                      <div className="ts-header-list">
                        {(http.headers ?? []).map((header, index) => (
                          <div className="ts-header-item" key={`${index}-${header.name}`}>
                            <span className="ts-header-item-name">{header.name}</span>
                            <span className="ts-header-item-value">
                              {header.sensitive ? (
                                <Tooltip title="敏感值已由服务端加密存储，此处仅显示占位">
                                  <i>{header.value || '****'}</i>
                                </Tooltip>
                              ) : (
                                header.value
                              )}
                            </span>
                            {header.sensitive && <Tag color="gold">敏感</Tag>}
                          </div>
                        ))}
                      </div>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="请求体" span={2}>
                    {http.body ? <pre className="ts-body-preview">{http.body}</pre> : <span className="ts-muted">无</span>}
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Alert type="info" showIcon message="预置模板目标由 Epic 3 交付" />
              )}
            </Card>

            <Card title="执行历史" className="ts-card" size="small">
              <ExecutionHistoryTable taskId={task.id} refreshToken={historyToken} />
            </Card>
          </>
        ) : null}
      </div>
    </PageFadeIn>
  );
};

export default TaskDetailPage;
