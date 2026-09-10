import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Select, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { HistoryOutlined, ReloadOutlined } from '@ant-design/icons';
import { schedulerApi } from '../schedulerApi';
import type { ExecutionListItem, ExecutionStatus, TaskExecutionDetail } from '../types';
import { extractErrorMessage, formatDateTime, formatDuration, prettyJson } from '../format';
import ExecutionStatusTag from './ExecutionStatusTag';
import SchedulerEmpty from './SchedulerEmpty';

const STATUS_OPTIONS = [
  { value: 'SUCCESS', label: '成功' },
  { value: 'FAILED', label: '失败' },
  { value: 'TIMEOUT', label: '超时' },
  { value: 'SKIPPED', label: '跳过' },
];

const TRIGGER_LABEL: Record<string, string> = {
  SCHEDULED: '调度',
  MANUAL: '手动',
};

/** 展开行：单次执行详情（request/response 摘要 + 错误信息） */
const ExecutionDetailPanel: React.FC<{ detail?: TaskExecutionDetail; loading: boolean }> = ({
  detail,
  loading,
}) => {
  if (loading) {
    return <Spin size="small" />;
  }
  if (!detail) {
    return <span className="ts-muted">执行详情加载失败</span>;
  }
  return (
    <div className="ts-exec-detail">
      <Descriptions size="small" column={2} bordered>
        <Descriptions.Item label="触发方式">
          {TRIGGER_LABEL[detail.triggerType] ?? detail.triggerType}
        </Descriptions.Item>
        <Descriptions.Item label="重试次数">{detail.retryCount}</Descriptions.Item>
        <Descriptions.Item label="开始时间">{formatDateTime(detail.startedAt)}</Descriptions.Item>
        <Descriptions.Item label="结束时间">{formatDateTime(detail.finishedAt)}</Descriptions.Item>
        <Descriptions.Item label="耗时">{formatDuration(detail.durationMs)}</Descriptions.Item>
        <Descriptions.Item label="错误信息">
          {detail.errorMessage ? <span className="ts-exec-error">{detail.errorMessage}</span> : '-'}
        </Descriptions.Item>
      </Descriptions>

      <div className="ts-exec-json">
        <div>
          <div className="ts-exec-json-title">请求摘要</div>
          <pre>{prettyJson(detail.requestSummary)}</pre>
        </div>
        <div>
          <div className="ts-exec-json-title">响应摘要</div>
          <pre>{prettyJson(detail.responseSummary)}</pre>
        </div>
      </div>
    </div>
  );
};

interface ExecutionHistoryTableProps {
  taskId: number;
  /** 外部触发刷新（例如「立即执行」后自增） */
  refreshToken?: number;
}

/** 执行历史表格（FR-9）：倒序分页 + 状态筛选 + 展开行详情 */
const ExecutionHistoryTable: React.FC<ExecutionHistoryTableProps> = ({ taskId, refreshToken = 0 }) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<ExecutionStatus | undefined>(undefined);
  const [items, setItems] = useState<ExecutionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<number, TaskExecutionDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await schedulerApi.listExecutions(taskId, { page, pageSize, status });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setLoadError(extractErrorMessage(err, '执行历史加载失败'));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [taskId, page, pageSize, status]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  /** 展开行时按需拉取详情（已缓存则跳过） */
  const loadDetail = useCallback(
    async (executionId: number) => {
      if (details[executionId]) return;
      setDetailLoadingId(executionId);
      try {
        const detail = await schedulerApi.getExecution(executionId);
        setDetails((prev) => ({ ...prev, [executionId]: detail }));
      } catch {
        // 全局拦截器已提示；展开行显示占位文案
      } finally {
        setDetailLoadingId(null);
      }
    },
    [details],
  );

  const columns: ColumnsType<ExecutionListItem> = [
    { title: '#', dataIndex: 'id', width: 80 },
    {
      title: '触发方式',
      dataIndex: 'triggerType',
      width: 110,
      render: (value: string) => <Tag>{TRIGGER_LABEL[value] ?? value}</Tag>,
    },
    { title: '触发时间', dataIndex: 'triggeredAt', width: 190, render: formatDateTime },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value: ExecutionStatus) => <ExecutionStatusTag status={value} />,
    },
    { title: '耗时', dataIndex: 'durationMs', width: 110, render: (value: number | null) => formatDuration(value) },
    { title: '重试', dataIndex: 'retryCount', width: 80 },
  ];

  return (
    <div className="ts-history">
      <div className="ts-history-toolbar">
        <Select
          allowClear
          placeholder="全部状态"
          style={{ width: 150 }}
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => {
            setStatus(value as ExecutionStatus | undefined);
            setPage(1);
          }}
        />
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
          刷新
        </Button>
      </div>

      {loadError ? (
        <Alert type="error" showIcon message={loadError} />
      ) : (
        <Table<ExecutionListItem>
          className="ts-table"
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={items}
          scroll={{ x: 720 }}
          locale={{
            emptyText: (
              <SchedulerEmpty
                icon={<HistoryOutlined />}
                title="暂无执行记录"
                hint="任务触发执行后，这里会按时间倒序列出每次执行的摘要"
              />
            ),
          }}
          expandable={{
            expandedRowRender: (row) => (
              <ExecutionDetailPanel detail={details[row.id]} loading={detailLoadingId === row.id} />
            ),
            onExpand: (expanded, row) => {
              if (expanded) void loadDetail(row.id);
            },
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
      )}
    </div>
  );
};

export default ExecutionHistoryTable;
