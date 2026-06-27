import React, { useState, useEffect, useCallback } from 'react';
import { Table, Switch, Button, Popconfirm, message, Input, Drawer, Tabs, Spin, Empty } from 'antd';
import { ReloadOutlined, RobotOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons';
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
import AdminPageHeader from './components/AdminPageHeader';
import StatusDot from './components/StatusDot';
import UserAvatar from './components/UserAvatar';
import Sparkline from './components/Sparkline';
import EmptyState from './components/EmptyState';
import './components/admin.css';

/** 相对时间格式化 */
function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '从未登录';
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(dateStr).toLocaleDateString();
}

/** 角色 / 状态筛选 */
type RoleFilter = 'all' | 'ADMIN' | 'USER';
type StatusFilter = 'all' | 'enabled' | 'disabled';

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
    return <EmptyState icon={<WarningOutlined />} title="暂无 AI 调用记录" />;
  }

  const failureRate = (summary.failureRate * 100).toFixed(1);
  const tokenDisplay = summary.totalTokens >= 1000
    ? `${(summary.totalTokens / 1000).toFixed(0)}K`
    : summary.totalTokens.toLocaleString();

  const columns: ColumnsType<AiInvocationItem> = [
    { title: '时间', dataIndex: 'createdAt', width: 130, render: (v: string) => new Date(v).toLocaleString() },
    { title: 'Agent', dataIndex: 'agentName', width: 110 },
    { title: '模型', dataIndex: 'model', width: 110, render: (v: string | null) => v || '-' },
    { title: 'Tokens', key: 'tokens', width: 80, render: (_: unknown, r: AiInvocationItem) => r.totalTokens ?? '-' },
    { title: '耗时', dataIndex: 'latencyMs', width: 70, render: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms` },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v: string) => <StatusDot status={v === 'SUCCESS' ? 'success' : 'failure'} label={v === 'SUCCESS' ? '成功' : '失败'} />,
    },
  ];

  return (
    <div>
      {/* 累计统计 — 2x3 网格 */}
      <div className="miao-admin-stat-row">
        <div className="miao-admin-stat-box">
          <div className="miao-admin-stat-box-lbl">总调用</div>
          <div className="miao-admin-stat-box-v">{summary.totalCalls.toLocaleString()}</div>
          <Sparkline
            data={[20, 18, 16, 14, 12, 14, 10, 8, 6, 8, 4]}
            height={28}
            strokeColor="var(--miao-primary)"
            className="miao-admin-stat-box-spark"
          />
        </div>
        <div className="miao-admin-stat-box">
          <div className="miao-admin-stat-box-lbl">累计 Token</div>
          <div className="miao-admin-stat-box-v">{tokenDisplay}</div>
          <Sparkline
            data={[22, 20, 16, 18, 12, 10, 8, 12, 8, 6, 4]}
            height={28}
            strokeColor="var(--miao-accent)"
            className="miao-admin-stat-box-spark"
          />
        </div>
        <div className="miao-admin-stat-box">
          <div className="miao-admin-stat-box-lbl">失败率</div>
          <div className="miao-admin-stat-box-v" style={summary.failureRate > 0.05 ? { color: '#C2362F' } : undefined}>
            {failureRate}%
          </div>
          <Sparkline
            data={[8, 10, 12, 10, 14, 12, 18, 16, 20, 18, 22]}
            height={28}
            strokeColor={summary.failureRate > 0.05 ? '#C2362F' : 'var(--miao-primary)'}
            className="miao-admin-stat-box-spark"
          />
        </div>
      </div>

      {/* 补充信息 */}
      <div className="miao-admin-stat-row" style={{ marginBottom: 0 }}>
        <div className="miao-admin-stat-box">
          <div className="miao-admin-stat-box-lbl">涉及 Agent 数</div>
          <div className="miao-admin-stat-box-v" style={{ fontSize: 20 }}>{summary.agentCount}</div>
        </div>
        <div className="miao-admin-stat-box">
          <div className="miao-admin-stat-box-lbl">涉及模型数</div>
          <div className="miao-admin-stat-box-v" style={{ fontSize: 20 }}>{summary.modelCount}</div>
        </div>
      </div>

      {/* 最近调用明细 */}
      <h4 className="miao-admin-sub-panel-title" style={{ marginTop: 24 }}>最近调用</h4>
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

  // 筛选
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Drawer 状态
  const [drawerUser, setDrawerUser] = useState<AdminUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Stepper 临时值
  const [stepperValues, setStepperValues] = useState<Record<number, number | null>>({});

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
      if (enabled) { await enableUser(user.id); message.success('已启用'); }
      else { await disableUser(user.id); message.success('已禁用'); }
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
    if (value === null || value === undefined) return;
    try {
      await setUserRateLimit(userId, value);
      message.success('限流已设置');
    } catch {
      message.error('设置限流失败');
    }
  };

  // 前端搜索过滤
  const filteredUsers = users.filter((u) => {
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!u.username.toLowerCase().includes(q) && !(u.email || '').toLowerCase().includes(q)) return false;
    }
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter === 'enabled' && !u.isEnabled) return false;
    if (statusFilter === 'disabled' && u.isEnabled) return false;
    return true;
  });

  const columns: ColumnsType<AdminUser> = [
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      render: (_: string, user: AdminUser) => (
        <div className="miao-admin-user-cell">
          <UserAvatar username={user.username} size="sm" />
          <div className="miao-admin-user-cell-stack">
            <span
              className="miao-admin-user-name"
              onClick={() => { setDrawerUser(user); setDrawerOpen(true); }}
            >
              {user.username}
            </span>
            <span className="miao-admin-user-email">@{user.username}</span>
          </div>
        </div>
      ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (v: string | null) => (
        <span style={{ color: 'var(--miao-text-secondary)', fontSize: 13 }}>{v || '—'}</span>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: string, user: AdminUser) => (
        <button
          className={`miao-admin-role-pill ${role === 'ADMIN' ? 'miao-admin-role-pill--admin' : 'miao-admin-role-pill--user'}`}
          onClick={() => {
            if (role === 'USER') handleRoleChange(user, 'ADMIN');
            else handleRoleChange(user, 'USER');
          }}
        >
          {role}
        </button>
      ),
    },
    {
      title: '状态',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      width: 90,
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
      width: 140,
      render: (_: unknown, user: AdminUser) => {
        const currentValue = stepperValues[user.id] ?? null;
        return (
          <div className="miao-admin-stepper">
            <button
              className="miao-admin-stepper-btn"
              onClick={() => {
                const next = currentValue === null ? 1 : Math.max(1, currentValue - 10);
                setStepperValues((prev) => ({ ...prev, [user.id]: next }));
              }}
            >
              −
            </button>
            <input
              className="miao-admin-stepper-input"
              type="number"
              value={currentValue ?? ''}
              placeholder="默认"
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setStepperValues((prev) => ({ ...prev, [user.id]: isNaN(val) ? null : val }));
              }}
              onBlur={() => {
                if (currentValue !== null && currentValue > 0) {
                  handleSetRateLimit(user.id, currentValue);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && currentValue !== null && currentValue > 0) {
                  handleSetRateLimit(user.id, currentValue);
                }
              }}
              aria-label={`设置限流 ${user.username}`}
            />
            <button
              className="miao-admin-stepper-btn"
              onClick={() => {
                const next = currentValue === null ? 10 : currentValue + 10;
                setStepperValues((prev) => ({ ...prev, [user.id]: next }));
              }}
            >
              +
            </button>
          </div>
        );
      },
    },
    {
      title: '最后登录',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 130,
      render: (v: string | null) => (
        <span className="miao-admin-relative-time">
          {v ? <><span className="num">{formatRelativeTime(v).split(' ')[0]}</span> {formatRelativeTime(v).split(' ').slice(1).join(' ')}</> : '从未登录'}
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: 32 }}>
      <AdminPageHeader
        eyebrow={`USER BASE · ${total.toLocaleString()} 位成员`}
        title={<>用户 <em>管理</em></>}
        description="管理用户角色、启用状态与每分钟调用上限。点击用户名查看 AI 用量明细。"
      />

      {/* 筛选条 */}
      <div className="miao-admin-filters">
        <Input
          placeholder="搜索用户名 / 邮箱..."
          prefix={<SearchOutlined style={{ color: 'var(--miao-text-tertiary)' }} />}
          style={{ width: 280 }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
        />

        <div className="miao-admin-chip-group">
          <button
            className={`miao-admin-chip ${roleFilter === 'all' ? 'active' : ''}`}
            onClick={() => setRoleFilter('all')}
          >
            全部
          </button>
          <button
            className={`miao-admin-chip ${roleFilter === 'ADMIN' ? 'active' : ''}`}
            onClick={() => setRoleFilter('ADMIN')}
          >
            管理员
          </button>
          <button
            className={`miao-admin-chip ${roleFilter === 'USER' ? 'active' : ''}`}
            onClick={() => setRoleFilter('USER')}
          >
            普通用户
          </button>
        </div>

        <div className="miao-admin-chip-group">
          <button
            className={`miao-admin-chip ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            全部
          </button>
          <button
            className={`miao-admin-chip ${statusFilter === 'enabled' ? 'active' : ''}`}
            onClick={() => setStatusFilter('enabled')}
          >
            启用
          </button>
          <button
            className={`miao-admin-chip ${statusFilter === 'disabled' ? 'active' : ''}`}
            onClick={() => setStatusFilter('disabled')}
          >
            已禁用
          </button>
        </div>

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
        <Table<AdminUser>
          rowKey="id"
          columns={columns}
          dataSource={filteredUsers}
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
          locale={{
            emptyText: (
              <EmptyState
                icon={<WarningOutlined />}
                title="暂无用户"
                description="尝试调整筛选条件"
              />
            ),
          }}
        />
      </div>

      {/* 用户详情 Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerUser(null); }}
        width={720}
        styles={{
          header: { display: 'none' },
          body: { padding: 0, background: 'var(--miao-bg)' },
        }}
      >
        {drawerUser && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Profile Hero */}
            <div style={{
              padding: '24px 28px',
              borderBottom: '1px solid var(--miao-border)',
              background: 'var(--miao-bg-elevated)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="miao-admin-drawer-profile" style={{ marginBottom: 0 }}>
                  <UserAvatar username={drawerUser.username} size="lg" />
                  <div>
                    <h2 className="miao-admin-drawer-name">{drawerUser.username}</h2>
                    <div className="miao-admin-drawer-meta">
                      <span className={`miao-admin-role-pill ${drawerUser.role === 'ADMIN' ? 'miao-admin-role-pill--admin' : 'miao-admin-role-pill--user'}`}>
                        {drawerUser.role}
                      </span>
                      <StatusDot
                        status={drawerUser.isEnabled ? 'success' : 'warning'}
                        label={drawerUser.isEnabled ? '启用中' : '已禁用'}
                      />
                      <span style={{ color: 'var(--miao-text-tertiary)' }}>
                        · 注册于 {new Date(drawerUser.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  type="text"
                  onClick={() => { setDrawerOpen(false); setDrawerUser(null); }}
                  style={{ color: 'var(--miao-text-secondary)' }}
                >
                  ✕
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ flex: 1, overflow: 'auto', padding: '28px' }}>
              <Tabs
                items={[
                  {
                    key: 'info',
                    label: '基本信息',
                    children: (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div className="miao-admin-stat-box">
                          <div className="miao-admin-stat-box-lbl">用户名</div>
                          <div style={{ color: 'var(--miao-text-primary)', fontWeight: 500 }}>
                            {drawerUser.username}
                          </div>
                        </div>
                        <div className="miao-admin-stat-box">
                          <div className="miao-admin-stat-box-lbl">邮箱</div>
                          <div style={{ color: 'var(--miao-text-primary)' }}>
                            {drawerUser.email || '—'}
                          </div>
                        </div>
                        <div className="miao-admin-stat-box">
                          <div className="miao-admin-stat-box-lbl">角色</div>
                          <div>
                            <span className={`miao-admin-role-pill ${drawerUser.role === 'ADMIN' ? 'miao-admin-role-pill--admin' : 'miao-admin-role-pill--user'}`}>
                              {drawerUser.role}
                            </span>
                          </div>
                        </div>
                        <div className="miao-admin-stat-box">
                          <div className="miao-admin-stat-box-lbl">状态</div>
                          <div>
                            <StatusDot
                              status={drawerUser.isEnabled ? 'success' : 'warning'}
                              label={drawerUser.isEnabled ? '启用' : '禁用'}
                            />
                          </div>
                        </div>
                        <div className="miao-admin-stat-box">
                          <div className="miao-admin-stat-box-lbl">最后登录</div>
                          <div style={{ color: 'var(--miao-text-primary)', fontSize: 13 }}>
                            {drawerUser.lastLoginAt ? new Date(drawerUser.lastLoginAt).toLocaleString() : '从未登录'}
                          </div>
                        </div>
                        <div className="miao-admin-stat-box">
                          <div className="miao-admin-stat-box-lbl">注册时间</div>
                          <div style={{ color: 'var(--miao-text-primary)', fontSize: 13 }}>
                            {new Date(drawerUser.createdAt).toLocaleString()}
                          </div>
                        </div>
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
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default UserManagePage;
