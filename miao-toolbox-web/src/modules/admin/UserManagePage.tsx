import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Switch, Button, Popconfirm, message, Input, Drawer, Tabs, Spin, Modal, Checkbox } from 'antd';
import { ReloadOutlined, RobotOutlined, SearchOutlined, WarningOutlined, TeamOutlined, CheckCircleOutlined, StopOutlined, ClockCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import {
  getAdminUsers,
  getAdminRoles,
  disableUser,
  enableUser,
  setUserRole,
  setUserRateLimit,
  type AdminUser,
  type AdminRole,
} from '../../services/adminService';
import {
  getUserUsageSummary,
  getAiInvocations,
  type UserUsageSummary,
  type AiInvocationItem,
} from '../../services/aiInvocationService';
import PageFadeIn from '../../components/shared/PageFadeIn';
import AdminPageHeader from './components/AdminPageHeader';
import StatusDot from './components/StatusDot';
import UserAvatar from './components/UserAvatar';
import Sparkline from './components/Sparkline';
import EmptyState from './components/EmptyState';
import AdminStatCard from './components/AdminStatCard';
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

  useEffect(() => { fetchData(); }, [fetchData]);

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

  return (
    <div>
      <div className="miao-admin-stat-row">
        <div className="miao-admin-stat-box">
          <div className="miao-admin-stat-box-lbl">总调用</div>
          <div className="miao-admin-stat-box-v">{summary.totalCalls.toLocaleString()}</div>
          <Sparkline data={[20, 18, 16, 14, 12, 14, 10, 8, 6, 8, 4]} height={28} strokeColor="var(--miao-primary)" className="miao-admin-stat-box-spark" />
        </div>
        <div className="miao-admin-stat-box">
          <div className="miao-admin-stat-box-lbl">累计 Token</div>
          <div className="miao-admin-stat-box-v">{tokenDisplay}</div>
          <Sparkline data={[22, 20, 16, 18, 12, 10, 8, 12, 8, 6, 4]} height={28} strokeColor="var(--miao-accent)" className="miao-admin-stat-box-spark" />
        </div>
        <div className="miao-admin-stat-box">
          <div className="miao-admin-stat-box-lbl">失败率</div>
          <div className="miao-admin-stat-box-v" style={summary.failureRate > 0.05 ? { color: '#C2362F' } : undefined}>{failureRate}%</div>
          <Sparkline data={[8, 10, 12, 10, 14, 12, 18, 16, 20, 18, 22]} height={28} strokeColor={summary.failureRate > 0.05 ? '#C2362F' : 'var(--miao-primary)'} className="miao-admin-stat-box-spark" />
        </div>
      </div>
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
      <h4 className="miao-admin-sub-panel-title" style={{ marginTop: 24 }}>最近调用</h4>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--miao-border)' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--miao-text-tertiary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>时间</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--miao-text-tertiary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Agent</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--miao-text-tertiary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>模型</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--miao-text-tertiary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tokens</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--miao-text-tertiary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>耗时</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--miao-text-tertiary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>状态</th>
          </tr>
        </thead>
        <tbody>
          {invocations.map(inv => (
            <tr key={inv.id} style={{ borderBottom: '1px solid var(--miao-border)' }}>
              <td style={{ padding: '8px 12px', color: 'var(--miao-text-secondary)', whiteSpace: 'nowrap' }}>{new Date(inv.createdAt).toLocaleString()}</td>
              <td style={{ padding: '8px 12px' }}>{inv.agentName}</td>
              <td style={{ padding: '8px 12px', color: 'var(--miao-text-secondary)' }}>{inv.model || '-'}</td>
              <td style={{ padding: '8px 12px', fontFamily: 'var(--miao-font-mono)', fontSize: 12 }}>{inv.totalTokens ?? '-'}</td>
              <td style={{ padding: '8px 12px', fontFamily: 'var(--miao-font-mono)', fontSize: 12 }}>{inv.latencyMs >= 1000 ? `${(inv.latencyMs / 1000).toFixed(1)}s` : `${inv.latencyMs}ms`}</td>
              <td style={{ padding: '8px 12px' }}><StatusDot status={inv.status === 'SUCCESS' ? 'success' : 'failure'} label={inv.status === 'SUCCESS' ? '成功' : '失败'} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > 10 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0', color: 'var(--miao-text-secondary)', fontSize: 12 }}>
          <Button type="link" size="small" onClick={() => setPage(p => p + 1)} loading={loading}>加载更多</Button>
        </div>
      )}
    </div>
  );
};

/** 用户卡片 — 信息丰富的卡片式行 */
const UserCard: React.FC<{
  user: AdminUser;
  index: number;
  onOpenDrawer: (user: AdminUser) => void;
  onOpenRoleModal: (user: AdminUser) => void;
  onToggleEnabled: (user: AdminUser, enabled: boolean) => void;
  stepperValue: number | null;
  onStepperChange: (userId: number, value: number | null) => void;
  onStepperBlur: (userId: number, value: number | null) => void;
}> = ({ user, index, onOpenDrawer, onOpenRoleModal, onToggleEnabled, stepperValue, onStepperChange, onStepperBlur }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.3) }}
      style={{
        background: 'var(--miao-bg-elevated)',
        border: `1px solid ${hovered ? 'var(--miao-border-strong)' : 'var(--miao-border)'}`,
        borderRadius: 'var(--miao-radius-lg)',
        padding: 18,
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        boxShadow: hovered ? '0 4px 12px rgba(33, 26, 82, 0.06)' : 'none',
        cursor: 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 上半部分：头像 + 名称 + 角色 + 状态 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        {/* 头像 */}
        <div
          onClick={() => onOpenDrawer(user)}
          style={{ cursor: 'pointer', flexShrink: 0 }}
        >
          <UserAvatar username={user.username} size="md" />
        </div>

        {/* 名称 + 邮箱 + 角色 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <span
              onClick={() => onOpenDrawer(user)}
              style={{
                fontWeight: 600,
                fontSize: 15,
                color: 'var(--miao-text-primary)',
                cursor: 'pointer',
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--miao-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--miao-text-primary)')}
            >
              {user.username}
            </span>
            {/* 状态点 */}
            <StatusDot
              status={user.isEnabled ? 'success' : 'warning'}
              label={user.isEnabled ? '启用' : '禁用'}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: 'var(--miao-text-tertiary)' }}>
              {user.email || `@${user.username}`}
            </span>
          </div>
        </div>

        {/* 角色标签 — 右侧 */}
        <div
          onClick={() => onOpenRoleModal(user)}
          style={{ cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: 4, flexShrink: 0 }}
          title="点击分配角色"
        >
          {user.roles?.map(r => (
            <span key={r.id} className={`miao-admin-role-pill ${r.code === 'SUPER_ADMIN' ? 'miao-admin-role-pill--admin' : 'miao-admin-role-pill--user'}`}>
              {r.name}
            </span>
          )) || <span style={{ color: 'var(--miao-text-tertiary)', fontSize: 12 }}>无角色</span>}
        </div>
      </div>

      {/* 下半部分：操作栏 — 最后登录 / 限流 / 启用开关 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        paddingTop: 12,
        borderTop: '1px solid var(--miao-border)',
        flexWrap: 'wrap',
      }}>
        {/* 最后登录 */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12.5,
          color: 'var(--miao-text-secondary)',
          minWidth: 100,
        }}>
          <ClockCircleOutlined style={{ fontSize: 13, color: 'var(--miao-text-tertiary)' }} />
          <span className="miao-admin-relative-time">
            {user.lastLoginAt ? (
              <><span className="num">{formatRelativeTime(user.lastLoginAt).split(' ')[0]}</span> {formatRelativeTime(user.lastLoginAt).split(' ').slice(1).join(' ')}</>
            ) : '从未登录'}
          </span>
        </div>

        {/* 限流 */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12.5,
        }}>
          <ThunderboltOutlined style={{ fontSize: 13, color: 'var(--miao-text-tertiary)' }} />
          <span style={{ color: 'var(--miao-text-tertiary)', fontSize: 11, fontFamily: 'var(--miao-font-mono)', fontWeight: 600, letterSpacing: '0.05em' }}>RPM</span>
          <div className="miao-admin-stepper">
            <button className="miao-admin-stepper-btn" onClick={() => onStepperChange(user.id, stepperValue === null ? 1 : Math.max(1, stepperValue - 10))}>−</button>
            <input
              className="miao-admin-stepper-input"
              type="number"
              value={stepperValue ?? ''}
              placeholder="默认"
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                onStepperChange(user.id, isNaN(val) ? null : val);
              }}
              onBlur={() => stepperValue !== null && stepperValue > 0 && onStepperBlur(user.id, stepperValue)}
              onKeyDown={(e) => e.key === 'Enter' && stepperValue !== null && stepperValue > 0 && onStepperBlur(user.id, stepperValue)}
              aria-label={`设置限流 ${user.username}`}
            />
            <button className="miao-admin-stepper-btn" onClick={() => onStepperChange(user.id, stepperValue === null ? 10 : stepperValue + 10)}>+</button>
          </div>
        </div>

        <span style={{ flex: 1 }} />

        {/* 启用/禁用开关 */}
        <Popconfirm
          title={user.isEnabled ? '确定禁用该用户？禁用后该用户将无法登录和使用任何工具。' : '确定启用该用户？'}
          onConfirm={() => onToggleEnabled(user, !user.isEnabled)}
          okText="确定"
          cancelText="取消"
        >
          <Switch
            checked={user.isEnabled}
            checkedChildren="启用"
            unCheckedChildren="禁用"
            aria-label={`禁用用户 ${user.username}`}
          />
        </Popconfirm>
      </div>
    </motion.div>
  );
};

// ============================================================
// Main Page
// ============================================================

const UserManagePage: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(false);
  const [allRoles, setAllRoles] = useState<AdminRole[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchText, setSearchText] = useState('');
  const roleFilterCode = searchParams.get('role') || 'all';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [drawerUser, setDrawerUser] = useState<AdminUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [stepperValues, setStepperValues] = useState<Record<number, number | null>>({});

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<AdminUser | null>(null);
  const [roleModalSelected, setRoleModalSelected] = useState<number[]>([]);
  const [roleSaving, setRoleSaving] = useState(false);

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

  const fetchRoles = useCallback(async () => {
    try {
      const data = await getAdminRoles(1, 100);
      setAllRoles(data.items);
    } catch { /* silent */ }
  }, []);

  const roleFilterOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [{ value: 'all', label: '全部' }];
    for (const role of allRoles) {
      options.push({ value: role.code, label: role.name });
    }
    return options;
  }, [allRoles]);

  useEffect(() => { fetchData(); fetchRoles(); }, [fetchData, fetchRoles]);

  const handleToggleEnabled = async (user: AdminUser, enabled: boolean) => {
    try {
      if (enabled) { await enableUser(user.id); message.success('已启用'); }
      else { await disableUser(user.id); message.success('已禁用'); }
      fetchData();
    } catch {
      message.error(enabled ? '启用失败' : '禁用失败');
    }
  };

  const handleOpenRoleModal = (user: AdminUser) => {
    setRoleModalUser(user);
    setRoleModalSelected(user.roles?.map(r => r.id) || []);
    setRoleModalOpen(true);
  };

  const handleSaveRoles = async () => {
    if (!roleModalUser || roleSaving) return;
    setRoleSaving(true);
    try {
      await setUserRole(roleModalUser.id, roleModalSelected);
      message.success('角色已变更');
      setRoleModalOpen(false);
      fetchData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '角色变更失败');
    } finally {
      setRoleSaving(false);
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

  const handleStepperChange = (userId: number, value: number | null) => {
    setStepperValues(prev => ({ ...prev, [userId]: value }));
  };

  const handleStepperBlur = (userId: number, value: number | null) => {
    if (value !== null && value > 0) handleSetRateLimit(userId, value);
  };

  const filteredUsers = users.filter((u) => {
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!u.username.toLowerCase().includes(q) && !(u.email || '').toLowerCase().includes(q)) return false;
    }
    if (roleFilterCode !== 'all' && !u.roles?.some(r => r.code === roleFilterCode)) return false;
    if (statusFilter === 'enabled' && !u.isEnabled) return false;
    if (statusFilter === 'disabled' && u.isEnabled) return false;
    return true;
  });

  const enabledCount = users.filter(u => u.isEnabled).length;
  const disabledCount = users.filter(u => !u.isEnabled).length;

  return (
    <PageFadeIn>
      <div style={{ padding: 32 }}>
        <AdminPageHeader
          eyebrow={`USER BASE · ${total.toLocaleString()} 位成员`}
          title={<>用户 <em>管理</em></>}
          description="管理用户角色、启用状态与每分钟调用上限。点击用户名查看 AI 用量明细。"
        />

        {/* 统计卡片 */}
        <div className="miao-admin-stat-grid--users">
          <AdminStatCard
            label="总用户"
            value={total}
            icon={<TeamOutlined />}
            iconVariant="primary"
            ariaLabel="总用户数"
            feature
            trend={{ direction: 'neutral', text: `${total > 0 ? '100%' : '0%'} 账户占比` }}
          />
          <AdminStatCard
            label="已启用"
            value={enabledCount}
            icon={<CheckCircleOutlined />}
            iconVariant="green"
            ariaLabel="已启用用户数"
            ringPercent={total > 0 ? (enabledCount / total) * 100 : 0}
            ringColor="var(--miao-teal)"
            trend={{ direction: 'up', text: `占比 ${total > 0 ? Math.round((enabledCount / total) * 100) : 0}%` }}
          />
          <AdminStatCard
            label="已禁用"
            value={disabledCount}
            icon={<StopOutlined />}
            iconVariant="amber"
            ariaLabel="已禁用用户数"
            ringPercent={total > 0 ? (disabledCount / total) * 100 : 0}
            ringColor="var(--miao-accent)"
            trend={{ direction: disabledCount > 0 ? 'down' : 'neutral', text: `占比 ${total > 0 ? Math.round((disabledCount / total) * 100) : 0}%` }}
          />
        </div>

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
            {roleFilterOptions.map(opt => (
              <button
                key={opt.value}
                className={`miao-admin-chip ${roleFilterCode === opt.value ? 'active' : ''}`}
                onClick={() => {
                  if (opt.value === 'all') setSearchParams({});
                  else setSearchParams({ role: opt.value });
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="miao-admin-chip-group">
            <button className={`miao-admin-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>全部</button>
            <button className={`miao-admin-chip ${statusFilter === 'enabled' ? 'active' : ''}`} onClick={() => setStatusFilter('enabled')}>启用</button>
            <button className={`miao-admin-chip ${statusFilter === 'disabled' ? 'active' : ''}`} onClick={() => setStatusFilter('disabled')}>已禁用</button>
          </div>

          <span style={{ flex: 1 }} />

          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} className="miao-admin-btn-ghost">
            刷新
          </Button>
        </div>

        {/* 用户卡片列表 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 56 }}><Spin /></div>
        ) : filteredUsers.length === 0 ? (
          <div style={{
            background: 'var(--miao-bg-elevated)',
            border: '1px solid var(--miao-border)',
            borderRadius: 'var(--miao-radius-lg)',
            padding: 56,
          }}>
            <EmptyState icon={<WarningOutlined />} title="暂无用户" description="尝试调整筛选条件" />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 12 }}>
            {filteredUsers.map((user, i) => (
              <UserCard
                key={user.id}
                user={user}
                index={i}
                onOpenDrawer={(u) => { setDrawerUser(u); setDrawerOpen(true); }}
                onOpenRoleModal={handleOpenRoleModal}
                onToggleEnabled={handleToggleEnabled}
                stepperValue={stepperValues[user.id] ?? null}
                onStepperChange={handleStepperChange}
                onStepperBlur={handleStepperBlur}
              />
            ))}
          </div>
        )}

        {/* 分页 */}
        {total > pageSize && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            marginTop: 24,
            fontSize: 13,
            color: 'var(--miao-text-secondary)',
          }}>
            <Button size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
            <span style={{ lineHeight: '32px' }}>第 {page} 页 · 共 {total} 条</span>
            <Button size="small" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>下一页</Button>
          </div>
        )}

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
                        {drawerUser.roles?.map(r => (
                          <span key={r.id} className={`miao-admin-role-pill ${r.code === 'SUPER_ADMIN' ? 'miao-admin-role-pill--admin' : 'miao-admin-role-pill--user'}`}>
                            {r.name}
                          </span>
                        )) || <span style={{ color: 'var(--miao-text-tertiary)' }}>—</span>}
                        <StatusDot status={drawerUser.isEnabled ? 'success' : 'warning'} label={drawerUser.isEnabled ? '启用中' : '已禁用'} />
                        <span style={{ color: 'var(--miao-text-tertiary)' }}>
                          · 注册于 {new Date(drawerUser.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button type="text" onClick={() => { setDrawerOpen(false); setDrawerUser(null); }} style={{ color: 'var(--miao-text-secondary)' }}>✕</Button>
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '28px' }}>
                <Tabs
                  items={[
                    {
                      key: 'info',
                      label: '基本信息',
                      children: (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                          <div className="miao-admin-stat-box"><div className="miao-admin-stat-box-lbl">用户名</div><div style={{ color: 'var(--miao-text-primary)', fontWeight: 500 }}>{drawerUser.username}</div></div>
                          <div className="miao-admin-stat-box"><div className="miao-admin-stat-box-lbl">邮箱</div><div style={{ color: 'var(--miao-text-primary)' }}>{drawerUser.email || '—'}</div></div>
                          <div className="miao-admin-stat-box"><div className="miao-admin-stat-box-lbl">角色</div><div>{drawerUser.roles?.map(r => (<span key={r.id} className={`miao-admin-role-pill ${r.code === 'SUPER_ADMIN' ? 'miao-admin-role-pill--admin' : 'miao-admin-role-pill--user'}`}>{r.name}</span>)) || <span style={{ color: 'var(--miao-text-tertiary)' }}>—</span>}</div></div>
                          <div className="miao-admin-stat-box"><div className="miao-admin-stat-box-lbl">状态</div><div><StatusDot status={drawerUser.isEnabled ? 'success' : 'warning'} label={drawerUser.isEnabled ? '启用' : '禁用'} /></div></div>
                          <div className="miao-admin-stat-box"><div className="miao-admin-stat-box-lbl">最后登录</div><div style={{ color: 'var(--miao-text-primary)', fontSize: 13 }}>{drawerUser.lastLoginAt ? new Date(drawerUser.lastLoginAt).toLocaleString() : '从未登录'}</div></div>
                          <div className="miao-admin-stat-box"><div className="miao-admin-stat-box-lbl">注册时间</div><div style={{ color: 'var(--miao-text-primary)', fontSize: 13 }}>{new Date(drawerUser.createdAt).toLocaleString()}</div></div>
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

      <Modal
        title={roleModalUser ? `分配角色 - ${roleModalUser.username}` : '分配角色'}
        open={roleModalOpen}
        onOk={handleSaveRoles}
        onCancel={() => setRoleModalOpen(false)}
        confirmLoading={roleSaving}
        okText="保存"
        cancelText="取消"
      >
        <Checkbox.Group value={roleModalSelected} onChange={v => setRoleModalSelected(v as number[])} style={{ width: '100%' }}>
          {allRoles.map(role => (
            <div key={role.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--miao-border)' }}>
              <Checkbox value={role.id}>
                <span style={{ fontWeight: 500 }}>{role.name}</span>
                <span style={{ color: 'var(--miao-text-tertiary)', fontSize: 12, marginLeft: 8 }}>
                  {role.code}{role.isSystem ? ' · 系统内置' : ''}
                </span>
              </Checkbox>
            </div>
          ))}
        </Checkbox.Group>
      </Modal>
    </PageFadeIn>
  );
};

export default UserManagePage;
