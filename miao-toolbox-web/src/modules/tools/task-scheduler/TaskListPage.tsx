import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Input, Modal, Select, Table, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import PageFadeIn from '../../../components/shared/PageFadeIn';
import { schedulerApi } from './schedulerApi';
import type { TaskListItem, TaskStatus } from './types';
import { extractErrorMessage, formatDateTime } from './format';
import SchedulerHeader from './components/SchedulerHeader';
import SchedulerPanel from './components/SchedulerPanel';
import SchedulerEmpty from './components/SchedulerEmpty';
import TaskStatusTag from './components/TaskStatusTag';
import ExecutionStatusTag from './components/ExecutionStatusTag';
import './task-scheduler.css';

const STATUS_OPTIONS = [
  { value: 'ENABLED', label: '启用' },
  { value: 'PAUSED', label: '暂停' },
];

/** 立即执行后等待服务端落库再刷新（异步提交，响应不等于执行完成） */
const EXECUTE_REFRESH_DELAY = 1500;

/** 任务列表页（FR-1/FR-6） */
const TaskListPage: React.FC = () => {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<TaskStatus | undefined>(undefined);
  const [items, setItems] = useState<TaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 正在执行「立即执行 / 启停」的任务 ID */
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await schedulerApi.listTasks({ page, pageSize, search: keyword || undefined, status });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setLoadError(extractErrorMessage(err, '任务列表加载失败'));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = useCallback(
    async (task: TaskListItem) => {
      const action = task.status === 'ENABLED' ? 'pause' : 'resume';
      setBusyId(task.id);
      try {
        await schedulerApi.toggleTask(task.id, action);
        message.success(action === 'pause' ? '任务已暂停' : '任务已恢复');
        await load();
      } catch (err) {
        message.error(extractErrorMessage(err, '操作失败'));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const handleExecute = useCallback(
    async (task: TaskListItem) => {
      setBusyId(task.id);
      try {
        await schedulerApi.executeTask(task.id);
        message.success('已提交执行，稍后刷新查看结果');
        await load();
        // 执行是异步的：稍后再刷一次，尽量把最新执行状态带出来
        window.setTimeout(() => void load(), EXECUTE_REFRESH_DELAY);
      } catch (err) {
        message.error(extractErrorMessage(err, '触发失败'));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const handleDelete = useCallback(
    (task: TaskListItem) => {
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
            await load();
          } catch (err) {
            message.error(extractErrorMessage(err, '删除失败'));
          }
        },
      });
    },
    [load],
  );

  const columns: ColumnsType<TaskListItem> = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 200,
      render: (name: string, task) => (
        <Button type="link" className="ts-name-link" onClick={() => navigate(`/tools/task-scheduler/${task.id}`)}>
          {name}
        </Button>
      ),
    },
    {
      title: '目标',
      dataIndex: 'targetType',
      width: 90,
      render: (value: string) => <span className="ts-muted">{value === 'HTTP' ? 'HTTP' : 'PRESET'}</span>,
    },
    {
      title: 'Cron',
      dataIndex: 'cronExpression',
      width: 160,
      render: (value: string) => <code className="ts-code">{value}</code>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: TaskStatus) => <TaskStatusTag status={value} />,
    },
    {
      title: '下次执行',
      dataIndex: 'nextRunAt',
      width: 185,
      render: (value: string | null) =>
        value ? (
          <span className="ts-next-run">
            <span className="ts-next-run-dot" aria-hidden="true" />
            {formatDateTime(value)}
          </span>
        ) : (
          <span className="ts-muted">-</span>
        ),
    },
    {
      title: '上次执行',
      dataIndex: 'lastExecutionStatus',
      width: 110,
      render: (value: TaskListItem['lastExecutionStatus']) => <ExecutionStatusTag status={value} />,
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      fixed: 'right',
      render: (_, task) => {
        const busy = busyId === task.id;
        return (
          <span className="ts-row-actions">
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                aria-label="编辑"
                icon={<EditOutlined />}
                onClick={() => navigate(`/tools/task-scheduler/${task.id}/edit`)}
              />
            </Tooltip>
            <Tooltip title={task.status === 'ENABLED' ? '暂停' : '恢复'}>
              <Button
                type="text"
                size="small"
                aria-label={task.status === 'ENABLED' ? '暂停' : '恢复'}
                loading={busy}
                icon={task.status === 'ENABLED' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={() => void handleToggle(task)}
              />
            </Tooltip>
            <Tooltip title="立即执行">
              <Button
                type="text"
                size="small"
                aria-label="立即执行"
                loading={busy}
                icon={<ThunderboltOutlined />}
                onClick={() => void handleExecute(task)}
              />
            </Tooltip>
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                aria-label="删除"
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(task)}
              />
            </Tooltip>
          </span>
        );
      },
    },
  ];

  return (
    <PageFadeIn>
      <div className="ts-page">
        <SchedulerHeader
          icon={<ClockCircleOutlined />}
          title="定时任务"
          subtitle="cron 调度 HTTP 目标 · 执行记录可追溯 · 失败自动重试"
          live
          actions={
            <>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
                刷新
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/tools/task-scheduler/new')}
              >
                新建任务
              </Button>
            </>
          }
        />

        <div className="ts-command-bar">
          <div className="ts-command-group">
            <Input.Search
              allowClear
              placeholder="按任务名称搜索"
              style={{ width: 260 }}
              onChange={(event) => {
                // allowClear 清空时 onSearch 不一定会触发，这里兜底恢复全量列表
                if (!event.target.value) {
                  setKeyword('');
                  setPage(1);
                }
              }}
              onSearch={(value) => {
                setKeyword(value.trim());
                setPage(1);
              }}
            />
            <Select
              allowClear
              placeholder="全部状态"
              style={{ width: 140 }}
              value={status}
              options={STATUS_OPTIONS}
              onChange={(value) => {
                setStatus(value as TaskStatus | undefined);
                setPage(1);
              }}
            />
          </div>
          <div className="ts-command-group">
            <span className="ts-panel-meta">共 {total} 个任务</span>
          </div>
        </div>

        {loadError ? (
          <Alert type="error" showIcon message={loadError} />
        ) : (
          <SchedulerPanel label="任务列表" meta={loading ? '加载中…' : null} index={0} flush fill>
            <Table<TaskListItem>
              className="ts-table"
              rowKey="id"
              columns={columns}
              dataSource={items}
              loading={loading}
              scroll={{ x: 1015 }}
              locale={{
                emptyText: (
                  <SchedulerEmpty
                    icon={<ClockCircleOutlined />}
                    title="暂无定时任务"
                    hint="点击右上角「新建任务」，配置第一个 cron 调度"
                  />
                ),
              }}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (count) => `共 ${count} 条`,
                onChange: (nextPage, nextPageSize) => {
                  setPage(nextPage);
                  setPageSize(nextPageSize);
                },
              }}
            />
          </SchedulerPanel>
        )}
      </div>
    </PageFadeIn>
  );
};

export default TaskListPage;
