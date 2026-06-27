import React, { useState, useEffect, useCallback } from 'react';
import { Table, Switch, Tag, Button, Popconfirm, message, InputNumber, Dropdown, Spin, Empty, Drawer, Tabs, Card, Row, Col } from 'antd';
import { ReloadOutlined, DownOutlined, RobotOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getAdminUsers,
  disableUser,
  enableUser,
  setUserRole,
  setUserRateLimit,
  type AdminUser,
} from '../../services/adminService';
import {
  getUserUsageSummary,
  getAiInvocations,
  type UserUsageSummary,
  type AiInvocationItem,
} from '../../services/aiInvocationService';

/** 用户 AI 用量 Tab */
const UserAiUsageTab: React.FC<{ userId: number }> = ({ userId }) => {
  const [summary, setSummary] = useState<UserUsageSummary | null>(null);
  const [invocations, setInvocations] = useState<AiInvocationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, invData] = await Promise.all([
        getUserUsageSummary(userId),
        getAiInvocations({ userId, page, pageSize: 10 }),
      ]);
      setSummary(summaryData);
      setInvocations(invData.items);
      setTotal(invData.total);
    } catch {
      message.error('加载用户 AI 用量失败');
    } finally {
      setLoading(false);
    }
  }, [userId, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !summary) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  }

  if (!summary) {
    return <Empty description="暂无 AI 调用记录" />;
  }

  const failureRate = (summary.failureRate * 100).toFixed(1);

  const columns: ColumnsType<AiInvocationItem> = [
    { title: '时间', dataIndex: 'createdAt', width: 150, render: (v: string) => new Date(v).toLocaleString() },
    { title: 'Agent', dataIndex: 'agentName', width: 120 },
    { title: '模型', dataIndex: 'model', width: 120, render: (v: string | null) => v || '-' },
    { title: 'Tokens', key: 'tokens', width: 80, render: (_: unknown, r: AiInvocationItem) => r.totalTokens ?? '-' },
    { title: '耗时', dataIndex: 'latencyMs', width: 70, render: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms` },
    { title: '状态', dataIndex: 'status', width: 70, render: (v: string) => <Tag color={v === 'SUCCESS' ? '#52c41a' : '#ff4d4f'}>{v === 'SUCCESS' ? '成功' : '失败'}</Tag> },
  ];

  return (
    <div>
      {/* 累计统计 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--miao-text-secondary)' }}>总调用</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{summary.totalCalls}</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--miao-text-secondary)' }}>总 Token</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{summary.totalTokens.toLocaleString()}</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--miao-text-secondary)' }}>失败率</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: summary.failureRate > 0.05 ? '#ff4d4f' : undefined }}>{failureRate}%</div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small">
            <div style={{ fontSize: 12, color: 'var(--miao-text-secondary)' }}>涉及 Agent 数</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{summary.agentCount}</div>
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small">
            <div style={{ fontSize: 12, color: 'var(--miao-text-secondary)' }}>涉及模型数</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{summary.modelCount}</div>
          </Card>
        </Col>
      </Row>

      {/* 最近调用明细 */}
      <h4 style={{ margin: '16px 0 8px' }}>最近调用</h4>
      <Table<AiInvocationItem>
        rowKey="id"
        columns={columns}
        dataSource={invocations}
        loading={loading}
        size="small"
        scroll={{ x: 600 }}
        pagination={{
          current: page,
          pageSize: 10,
          total,
          simple: true,
          onChange: setPage,
        }}
        locale={{ emptyText: <Empty description="暂无调用记录" /> }}
      />
    </div>
  );
};

const UserManagePage: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  // Drawer 状态
  const [drawerUser, setDrawerUser] = useState<AdminUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminUsers(page, pageSize);
      setUsers(data.items);
      setTotal(data.total);
    } catch {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleEnabled = async (user: AdminUser, enabled: boolean) => {
    try {
      if (enabled) {
        await enableUser(user.id);
        message.success('已启用');
      } else {
        await disableUser(user.id);
        message.success('已禁用');
      }
      fetchData();
    } catch {
      message.error(enabled ? '启用失败' : '禁用失败');
    }
  };

  const handleRoleChange = async (user: AdminUser, newRole: string) => {
    try {
      await setUserRole(user.id, newRole);
      message.success('角色已变更');
      fetchData();
    } catch (err: any) {
      const msg = err?.response?.data?.message || '角色变更失败';
      message.error(msg);
    }
  };

  const handleSetRateLimit = async (userId: number, value: number | null) => {
    if (value === null) return;
    try {
      await setUserRateLimit(userId, value);
      message.success('限流已设置');
    } catch {
      message.error('设置限流失败');
    }
  };

  const columns: ColumnsType<AdminUser> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (v: string, user: AdminUser) => (
        <Button type="link" size="small" onClick={() => { setDrawerUser(user); setDrawerOpen(true); }}>
          {v}
        </Button>
      ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (v: string | null) => v || '-',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string, user: AdminUser) => (
        <Dropdown
          menu={{
            items: [
              { key: 'USER', label: 'USER' },
              { key: 'ADMIN', label: 'ADMIN' },
            ],
            onClick: ({ key }) => {
              if (key === role) return;
              handleRoleChange(user, key);
            },
          }}
          trigger={['click']}
        >
          <Button size="small" type="link" aria-label={`变更角色 ${user.username}`}>
            <Tag color={role === 'ADMIN' ? 'red' : 'blue'}>{role}</Tag>
            <DownOutlined style={{ fontSize: 10 }} />
          </Button>
        </Dropdown>
      ),
    },
    {
      title: '状态',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      render: (enabled: boolean, user: AdminUser) => (
        <Popconfirm
          title={enabled ? '确定禁用该用户？禁用后该用户将无法登录和使用任何工具。' : '确定启用该用户？'}
          onConfirm={() => handleToggleEnabled(user, !enabled)}
          okText="确定"
          cancelText="取消"
        >
          <Switch
            checked={enabled}
            checkedChildren="启用"
            unCheckedChildren="禁用"
            aria-label={`禁用用户 ${user.username}`}
          />
        </Popconfirm>
      ),
    },
    {
      title: '限流(次/分)',
      key: 'rateLimit',
      render: (_: unknown, user: AdminUser) => (
        <InputNumber
          min={1}
          max={10000}
          placeholder="默认"
          style={{ width: 100 }}
          onPressEnter={(e) => {
            const val = parseInt((e.target as HTMLInputElement).value, 10);
            if (!isNaN(val) && val > 0) handleSetRateLimit(user.id, val);
          }}
          onBlur={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val > 0) handleSetRateLimit(user.id, val);
          }}
          aria-label={`设置限流 ${user.username}`}
        />
      ),
    },
    {
      title: '最后登录',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      render: (v: string | null) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleString(),
    },
  ];

  if (loading && users.length === 0) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
      </div>

      <Table<AdminUser>
        rowKey="id"
        columns={columns}
        dataSource={users}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        locale={{ emptyText: <Empty description="暂无用户" /> }}
      />

      {/* 用户详情 Drawer */}
      <Drawer
        title={drawerUser?.username}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerUser(null); }}
        width={640}
      >
        {drawerUser && (
          <Tabs
            items={[
              {
                key: 'info',
                label: '基本信息',
                children: (
                  <div>
                    <p><strong>用户名：</strong>{drawerUser.username}</p>
                    <p><strong>邮箱：</strong>{drawerUser.email || '-'}</p>
                    <p><strong>角色：</strong><Tag color={drawerUser.role === 'ADMIN' ? 'red' : 'blue'}>{drawerUser.role}</Tag></p>
                    <p><strong>状态：</strong>{drawerUser.isEnabled ? '启用' : '禁用'}</p>
                    <p><strong>最后登录：</strong>{drawerUser.lastLoginAt ? new Date(drawerUser.lastLoginAt).toLocaleString() : '-'}</p>
                    <p><strong>注册时间：</strong>{new Date(drawerUser.createdAt).toLocaleString()}</p>
                  </div>
                ),
              },
              {
                key: 'ai-usage',
                label: <><RobotOutlined style={{ marginRight: 4 }} />AI 用量</>,
                children: <UserAiUsageTab userId={drawerUser.id} />,
              },
            ]}
          />
        )}
      </Drawer>
    </div>
  );
};

export default UserManagePage;
