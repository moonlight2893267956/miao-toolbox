import React, { useState, useEffect, useCallback } from 'react';
import { Table, Select, DatePicker, Tag, Button, Card, Empty, message, Space, Input } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getAiInvocations,
  getAgentOptions,
  getModelOptions,
  type AiInvocationItem,
  type AiInvocationQuery,
} from '../../services/aiInvocationService';

const { RangePicker } = DatePicker;

const InvocationsPage: React.FC = () => {
  const [data, setData] = useState<AiInvocationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选状态
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(7, 'day'),
    dayjs(),
  ]);
  const [agentFilter, setAgentFilter] = useState<string | undefined>();
  const [modelFilter, setModelFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [traceIdSearch, setTraceIdSearch] = useState<string>('');

  // 下拉选项
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  const fetchOptions = async () => {
    try {
      const [agents, models] = await Promise.all([getAgentOptions(), getModelOptions()]);
      setAgentOptions(agents);
      setModelOptions(models);
    } catch {
      // 静默处理
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const query: AiInvocationQuery = {
        page,
        pageSize,
        agentName: agentFilter,
        model: modelFilter,
        status: statusFilter,
      };
      if (dateRange[0]) query.startTime = dateRange[0].startOf('day').toISOString();
      if (dateRange[1]) query.endTime = dateRange[1].endOf('day').toISOString();

      const result = await getAiInvocations(query);
      setData(result.items);
      setTotal(result.total);
    } catch {
      message.error('加载调用日志失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, dateRange, agentFilter, modelFilter, statusFilter]);

  useEffect(() => {
    fetchOptions();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatLatency = (ms: number): string => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };

  const formatTokens = (prompt: number | null, completion: number | null): string => {
    if (prompt == null && completion == null) return '-';
    return `${prompt ?? 0} / ${completion ?? 0}`;
  };

  const columns: ColumnsType<AiInvocationItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString(),
      sorter: true,
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 100,
    },
    {
      title: 'Agent',
      dataIndex: 'agentName',
      key: 'agentName',
      width: 130,
    },
    {
      title: '模型',
      dataIndex: 'model',
      key: 'model',
      width: 130,
      render: (v: string | null) => v || '-',
    },
    {
      title: 'Tokens (入/出)',
      key: 'tokens',
      width: 120,
      render: (_: unknown, r: AiInvocationItem) => formatTokens(r.promptTokens, r.completionTokens),
    },
    {
      title: '耗时',
      dataIndex: 'latencyMs',
      key: 'latencyMs',
      width: 80,
      render: (v: number) => formatLatency(v),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) => (
        <Tag color={v === 'SUCCESS' ? '#52c41a' : '#ff4d4f'}>
          {v === 'SUCCESS' ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: 'Trace ID',
      dataIndex: 'traceId',
      key: 'traceId',
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v ? (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }} title={v}>
          {v.slice(0, 8)}...
        </span>
      ) : '-',
    },
    {
      title: '错误码',
      dataIndex: 'errorCode',
      key: 'errorCode',
      width: 120,
      render: (v: string | null) => v ? <Tag color="#ff4d4f">{v}</Tag> : '-',
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>AI 调用日志</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
      </div>

      {/* 筛选区 */}
      <Card style={{ marginBottom: 16, borderRadius: 10 }} size="small">
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0], dates[1]]);
              }
            }}
            format="YYYY-MM-DD"
          />
          <Select
            placeholder="Agent"
            allowClear
            style={{ width: 150 }}
            value={agentFilter}
            onChange={setAgentFilter}
            options={agentOptions.map(a => ({ label: a, value: a }))}
          />
          <Select
            placeholder="模型"
            allowClear
            style={{ width: 150 }}
            value={modelFilter}
            onChange={setModelFilter}
            options={modelOptions.map(m => ({ label: m, value: m }))}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 100 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: '成功', value: 'SUCCESS' },
              { label: '失败', value: 'FAILURE' },
            ]}
          />
          <Input
            placeholder="Trace ID"
            prefix={<SearchOutlined />}
            style={{ width: 180 }}
            value={traceIdSearch}
            onChange={(e) => setTraceIdSearch(e.target.value)}
            allowClear
          />
        </Space>
      </Card>

      {/* 表格 */}
      <Table<AiInvocationItem>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        scroll={{ x: 1000 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        locale={{ emptyText: <Empty description="暂无调用记录" /> }}
      />
    </div>
  );
};

export default InvocationsPage;
