import React, { useState, useEffect, useCallback } from 'react';
import { Button, message, Select, DatePicker, Input, Table } from 'antd';
import { ReloadOutlined, SearchOutlined, CopyOutlined, WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getAiInvocations,
  getAgentOptions,
  type AiInvocationItem,
  type AiInvocationQuery,
} from '../../services/aiInvocationService';
import PageFadeIn from '../../components/shared/PageFadeIn';
import AdminPageHeader from './components/AdminPageHeader';
import StatusDot from './components/StatusDot';
import EmptyState from './components/EmptyState';
import './components/admin.css';

const { RangePicker } = DatePicker;

/** 时间范围快捷选项 */
type TimePreset = '24h' | '7d' | '30d' | 'custom';

const timePresets: { key: TimePreset; label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'custom', label: '自定义' },
];

/** 状态筛选 */
type StatusPreset = 'all' | 'SUCCESS' | 'FAILURE';

const statusPresets: { key: StatusPreset; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'SUCCESS', label: '成功' },
  { key: 'FAILURE', label: '失败' },
];

const InvocationsPage: React.FC = () => {
  const [data, setData] = useState<AiInvocationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选状态
  const [timePreset, setTimePreset] = useState<TimePreset>('7d');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(7, 'day'),
    dayjs(),
  ]);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [agentFilter, setAgentFilter] = useState<string | undefined>();
  const [statusPreset, setStatusPreset] = useState<StatusPreset>('all');
  const [traceIdSearch, setTraceIdSearch] = useState<string>('');
  const [traceIdSearchDebounced, setTraceIdSearchDebounced] = useState<string>('');

  // 下拉选项
  const [agentOptions, setAgentOptions] = useState<string[]>([]);

  // 复制状态
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);

  // 防抖
  useEffect(() => {
    const t = setTimeout(() => setTraceIdSearchDebounced(traceIdSearch.trim()), 500);
    return () => clearTimeout(t);
  }, [traceIdSearch]);

  // 时间预设 → dateRange
  const applyTimePreset = (preset: TimePreset) => {
    setTimePreset(preset);
    if (preset === '24h') {
      setDateRange([dayjs().subtract(24, 'hour'), dayjs()]);
    } else if (preset === '7d') {
      setDateRange([dayjs().subtract(7, 'day'), dayjs()]);
    } else if (preset === '30d') {
      setDateRange([dayjs().subtract(30, 'day'), dayjs()]);
    } else {
      setCustomRangeOpen(true);
    }
  };

  const fetchOptions = async () => {
    try {
      const agents = await getAgentOptions();
      setAgentOptions(agents);
    } catch {
      // 静默
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const query: AiInvocationQuery = {
        page,
        pageSize,
        agentName: agentFilter,
        status: statusPreset === 'all' ? undefined : statusPreset,
        traceId: traceIdSearchDebounced || undefined,
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
  }, [page, pageSize, dateRange, agentFilter, statusPreset, traceIdSearchDebounced]);

  useEffect(() => { fetchOptions(); }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const formatLatency = (ms: number): string =>
    ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

  const copyTraceId = async (traceId: string) => {
    try {
      await navigator.clipboard.writeText(traceId);
      setCopiedTraceId(traceId);
      setTimeout(() => setCopiedTraceId(null), 1500);
    } catch {
      message.error('复制失败');
    }
  };

  const clearFilters = () => {
    setTimePreset('7d');
    setDateRange([dayjs().subtract(7, 'day'), dayjs()]);
    setAgentFilter(undefined);
    setStatusPreset('all');
    setTraceIdSearch('');
    setTraceIdSearchDebounced('');
  };

  const columns: ColumnsType<AiInvocationItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (v: string) => {
        const d = dayjs(v);
        return <span className="miao-admin-cell-time">{d.format('HH:mm:ss')} · {d.format('MM-DD')}</span>;
      },
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
      title: '耗时',
      dataIndex: 'latencyMs',
      key: 'latencyMs',
      width: 80,
      render: (v: number) => (
        <span style={{ fontFamily: 'var(--miao-font-mono)', color: 'var(--miao-text-secondary)', fontSize: 12 }}>
          {formatLatency(v)}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: string) => (
        <StatusDot status={v === 'SUCCESS' ? 'success' : 'failure'} label={v === 'SUCCESS' ? '成功' : '失败'} />
      ),
    },
    {
      title: 'Trace ID',
      dataIndex: 'traceId',
      key: 'traceId',
      width: 240,
      render: (v: string | null) =>
        v ? (
          <button
            className={`miao-admin-copy-btn ${copiedTraceId === v ? 'miao-admin-copy-btn--copied' : ''}`}
            onClick={() => copyTraceId(v)}
          >
            <span style={{ fontFamily: 'var(--miao-font-mono)', fontSize: 12, wordBreak: 'break-all' }}>
              {copiedTraceId === v ? '✓ 已复制' : v}
            </span>
            {copiedTraceId !== v && <CopyOutlined style={{ opacity: 0.6, fontSize: 11 }} />}
          </button>
        ) : (
          '—'
        ),
    },
    {
      title: '错误码',
      dataIndex: 'errorCode',
      key: 'errorCode',
      width: 120,
      render: (v: string | null) =>
        v ? <span className="miao-admin-error-pill">{v}</span> : '—',
    },
  ];

  return (
    <PageFadeIn>
      <div style={{ padding: 32 }}>
        <AdminPageHeader
          eyebrow="OBSERVABILITY · 实时追踪"
        title={<>AI 调用 <em>日志</em></>}
        description="按时间范围、Agent、状态、Trace ID 检索。点击 Trace ID 复制到剪贴板。"
      />

      {/* Chip-style 筛选条 */}
      <div className="miao-admin-filters">
        {/* 时间范围 */}
        <div className="miao-admin-chip-group">
          {timePresets.map((p) => (
            <button
              key={p.key}
              className={`miao-admin-chip ${timePreset === p.key ? 'active' : ''}`}
              onClick={() => applyTimePreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* 自定义时间弹窗 */}
        {timePreset === 'custom' && (
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0], dates[1]]);
              }
            }}
            format="YYYY-MM-DD"
            open={customRangeOpen || undefined}
            onOpenChange={setCustomRangeOpen}
            style={{ width: 220 }}
          />
        )}

        {/* 状态 */}
        <div className="miao-admin-chip-group">
          {statusPresets.map((s) => (
            <button
              key={s.key}
              className={`miao-admin-chip ${statusPreset === s.key ? 'active' : ''}`}
              onClick={() => setStatusPreset(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Agent */}
        <Select
          placeholder="Agent"
          allowClear
          style={{ width: 150 }}
          value={agentFilter}
          onChange={setAgentFilter}
          options={agentOptions.map((a) => ({ label: a, value: a }))}
        />

        {/* Trace ID 搜索 */}
        <Input
          placeholder="搜索 Trace ID / 用户名..."
          prefix={<SearchOutlined style={{ color: 'var(--miao-text-tertiary)' }} />}
          style={{ width: 200 }}
          value={traceIdSearch}
          onChange={(e) => setTraceIdSearch(e.target.value)}
          allowClear
        />

        <span style={{ flex: 1 }} />

        <Button
          icon={<ReloadOutlined />}
          onClick={fetchData}
          loading={loading}
          className="miao-admin-btn-ghost"
        >
          刷新
        </Button>
      </div>

      {/* 表格 */}
      <div className="miao-admin-tbl">
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
          locale={{
            emptyText: (
              <EmptyState
                icon={<WarningOutlined />}
                title="暂无调用记录"
                description="尝试调整筛选条件查看更多数据"
                action={
                  <Button onClick={clearFilters} className="miao-admin-btn-ghost">
                    清除筛选
                  </Button>
                }
              />
            ),
          }}
        />
      </div>
    </div>
    </PageFadeIn>
  );
};

export default InvocationsPage;
