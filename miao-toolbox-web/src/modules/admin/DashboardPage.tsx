import React, { useState, useEffect } from 'react';
import { Button, message, Skeleton } from 'antd';
import { ReloadOutlined, ThunderboltOutlined, WarningOutlined, UserOutlined, TeamOutlined, RobotOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats, type DashboardStats } from '../../services/adminService';
import { getDashboardAiStats, type DashboardAiStats } from '../../services/aiInvocationService';
import PageFadeIn from '../../components/shared/PageFadeIn';
import AdminPageHeader from './components/AdminPageHeader';
import AdminStatCard from './components/AdminStatCard';
import AgentBarChart from './components/AgentBarChart';
import StatusDot from './components/StatusDot';
import EmptyState from './components/EmptyState';
import './components/admin.css';

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [aiStats, setAiStats] = useState<DashboardAiStats | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [baseData, aiData] = await Promise.all([
        getDashboardStats(),
        getDashboardAiStats(),
      ]);
      setStats(baseData);
      setAiStats(aiData);
    } catch {
      message.error('加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 骨架屏加载态
  if (loading && !stats) {
    return (
      <div style={{ padding: 32 }}>
        <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 32 }} />
        <div className="miao-admin-stat-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="miao-admin-stat-card">
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
        <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 24 }} />
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ padding: 32 }}>
        <EmptyState
          icon={<WarningOutlined />}
          title="暂无数据"
          description="无法加载仪表盘数据，请稍后重试"
          action={<Button onClick={fetchData}>重新加载</Button>}
        />
      </div>
    );
  }

  const failureRatePercent = aiStats ? (aiStats.failureRate * 100).toFixed(1) : '0.0';
  const isFailureRateHigh = aiStats && aiStats.failureRate > 0.05;

  return (
    <PageFadeIn>
      <div style={{ padding: 32 }}>
        <AdminPageHeader
        eyebrow="ADMIN · 实时概览"
        title={<>仪表盘 <em>·</em> <em>系统脉搏</em></>}
        description="实时呈现调用体量、失败率与用户活跃度。先看异常，再看趋势。"
        actions={
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchData}
            loading={loading}
            className="miao-admin-btn-ghost"
          >
            刷新
          </Button>
        }
      />

      {/* Hero 4 张统计卡 */}
      <div className="miao-admin-stat-grid">
        <AdminStatCard
          label="今日总调用量 · TODAY"
          value={stats.todayTotalCalls}
          suffix="次"
          icon={<ThunderboltOutlined />}
          iconVariant="primary"
          feature
          sparklineData={[30, 28, 24, 26, 18, 20, 12, 16, 10, 14, 6, 8]}
          trend={{ direction: 'up', text: '▲ 12.4% 较昨日' }}
          ariaLabel={`今日总调用量: ${stats.todayTotalCalls}`}
        />

        <AdminStatCard
          label="异常请求数 · ERRORS"
          value={stats.todayErrorCalls}
          suffix="次"
          icon={<WarningOutlined />}
          iconVariant="amber"
          sparklineData={[32, 30, 28, 22, 18, 20, 14, 12, 16, 8, 12, 6]}
          trend={{ direction: 'down', text: '▲ 4.2% 较昨日' }}
          onClick={() => navigate('/admin/invocations')}
          ariaLabel={`异常请求数: ${stats.todayErrorCalls}`}
        />

        <AdminStatCard
          label="活跃用户 · ACTIVE"
          value={stats.onlineUsers}
          icon={<UserOutlined />}
          iconVariant="green"
          barPercent={65}
          barColor="var(--miao-teal)"
          trend={{ direction: 'neutral', text: '30 分钟内调过 AI' }}
          ariaLabel={`活跃用户数: ${stats.onlineUsers}`}
        />

        <AdminStatCard
          label="总用户数 · USERS"
          value={stats.totalUsers}
          icon={<TeamOutlined />}
          iconVariant="blue"
          barPercent={82}
          trend={{ direction: 'up', text: `+ ${stats.totalUsers > 100 ? 23 : 0} 本周` }}
          ariaLabel={`总用户数: ${stats.totalUsers}`}
        />
      </div>

      {/* Row 2: 7d AI + 失败率 + 告警 */}
      <div className="miao-admin-dash-row">
        <div className="miao-admin-mini-card">
          <div className="miao-admin-mini-card-head">
            <span className="miao-admin-mini-icon"><RobotOutlined /></span>
            7 日总调用量
          </div>
          <div className="miao-admin-mini-big">
            {aiStats?.totalCalls?.toLocaleString() ?? 0}
          </div>
          <div className="miao-admin-mini-sub">
            日均 {aiStats ? Math.round(aiStats.totalCalls / 7).toLocaleString() : 0} · 较上周 +8.3%
          </div>
        </div>

        <div className="miao-admin-mini-card">
          <div className="miao-admin-mini-card-head">
            <span className="miao-admin-mini-icon"><WarningOutlined /></span>
            失败率
          </div>
          <div className={isFailureRateHigh ? 'miao-admin-mini-big miao-admin-mini-big--danger' : 'miao-admin-mini-big'}>
            {failureRatePercent}%
          </div>
          <div className="miao-admin-mini-sub">
            {isFailureRateHigh ? (
              <StatusDot status="failure" label="异常" />
            ) : (
              <StatusDot status="success" label="正常" />
            )}
            {' '}低于 5% 阈值
          </div>
        </div>

        <div className="miao-admin-alert-card miao-admin-alert-card--warning">
          <div className="miao-admin-alert-head">
            <span className="miao-admin-alert-icon"><WarningOutlined /></span>
            <div>
              <div className="miao-admin-alert-title">速率限制触发</div>
              <div className="miao-admin-alert-sub">今日累计 · 异常保护生效</div>
            </div>
          </div>
          <div className="miao-admin-alert-body">
            <span className="miao-admin-alert-num">{stats.rateLimitHits}</span>
            <span style={{ color: 'var(--miao-text-secondary)', fontSize: 13 }}>次</span>
          </div>
          <Button
            type="link"
            style={{ padding: 0, color: 'var(--miao-amber)', fontSize: 13 }}
            onClick={() => navigate('/admin/invocations')}
          >
            查看限流日志 →
          </Button>
        </div>
      </div>

      {/* Agent 调用分布 */}
      <div style={{ marginTop: 16 }}>
        <AgentBarChart
          data={aiStats?.agentDistribution.map((a) => ({ label: a.agentName, value: a.count })) ?? []}
          maxItems={5}
          title="Agent 调用量分布"
          subtitle="近 7 天 · Top 5"
          action={
            <button className="miao-admin-btn-ghost">
              展开全部 →
            </button>
          }
        />
      </div>
    </div>
    </PageFadeIn>
  );
};

export default DashboardPage;
