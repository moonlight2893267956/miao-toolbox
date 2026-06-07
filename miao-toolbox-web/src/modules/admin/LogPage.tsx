import React, { useState, useEffect, useCallback } from 'react';
import { Table, Card, Form, Input, Select, DatePicker, Collapse, Space, Button, Empty, message } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { getAuditLogs, type AuditLogItem, type AuditLogQuery } from '../../services/adminService';

const { RangePicker } = DatePicker;

const statusOptions = [
  { label: '成功', value: 'SUCCESS' },
  { label: '失败', value: 'FAILED' },
  { label: '超时', value: 'TIMEOUT' },
  { label: '错误', value: 'ERROR' },
];

const LogPage: React.FC = () => {
  const [data, setData] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [form] = Form.useForm();

  const fetchData = useCallback(async (query?: Partial<AuditLogQuery>) => {
    setLoading(true);
    try {
      const result = await getAuditLogs({
        page,
        pageSize,
        ...query,
      });
      setData(result.items);
      setTotal(result.total);
    } catch {
      message.error('加载日志失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [page, pageSize, fetchData]);

  const handleSearch = () => {
    const values = form.getFieldsValue();
    const query: Partial<AuditLogQuery> = {};
    if (values.timeRange?.[0]) query.startTime = values.timeRange[0].toISOString();
    if (values.timeRange?.[1]) query.endTime = values.timeRange[1].toISOString();
    if (values.userId) query.userId = Number(values.userId);
    if (values.toolId) query.toolId = values.toolId;
    if (values.responseStatus) query.responseStatus = values.responseStatus;
    setPage(1);
    fetchData(query);
  };

  const handleReset = () => {
    form.resetFields();
    setPage(1);
    fetchData();
  };

  const columns: ColumnsType<AuditLogItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '用户ID',
      dataIndex: 'userId',
      key: 'userId',
      width: 80,
    },
    {
      title: '工具',
      dataIndex: 'toolId',
      key: 'toolId',
      width: 120,
    },
    {
      title: '请求摘要',
      dataIndex: 'requestSummary',
      key: 'requestSummary',
      ellipsis: true,
      width: 250,
    },
    {
      title: '状态',
      dataIndex: 'responseStatus',
      key: 'responseStatus',
      width: 80,
      render: (v: string) => {
        const color = v === 'SUCCESS' ? 'green' : v === 'FAILED' ? 'red' : 'orange';
        return <span style={{ color }}>{v}</span>;
      },
    },
    {
      title: '耗时(ms)',
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 90,
    },
    {
      title: 'Token消耗',
      dataIndex: 'tokenConsumption',
      key: 'tokenConsumption',
      width: 100,
    },
  ];

  const filterContent = (
    <Form form={form} layout="inline" style={{ flexWrap: 'wrap', gap: '8px' }}>
      <Form.Item name="timeRange">
        <RangePicker showTime style={{ width: 360 }} />
      </Form.Item>
      <Form.Item name="userId">
        <Input placeholder="用户ID" style={{ width: 120 }} />
      </Form.Item>
      <Form.Item name="toolId">
        <Input placeholder="工具ID" style={{ width: 120 }} />
      </Form.Item>
      <Form.Item name="responseStatus">
        <Select placeholder="状态" allowClear style={{ width: 120 }} options={statusOptions} />
      </Form.Item>
      <Form.Item>
        <Space>
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </Form.Item>
    </Form>
  );

  return (
    <Card title="调用日志" style={{ margin: 16 }}>
      <Collapse
        ghost
        items={[{ key: 'filter', label: '筛选条件', children: filterContent }]}
        style={{ marginBottom: 16 }}
      />
      {data.length === 0 && !loading ? (
        <Empty description="暂无数据" />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 900 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            simple: window.innerWidth < 768,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      )}
      <div style={{ marginTop: 8, textAlign: 'right' }}>
        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>刷新</Button>
      </div>
    </Card>
  );
};

export default LogPage;
