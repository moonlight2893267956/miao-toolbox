import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Spin, Empty, Button, message } from 'antd';
import { ReloadOutlined, ThunderboltOutlined, WarningOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats, type DashboardStats } from '../../services/adminService';

/** 管理统计卡片 */
const AdminStatCard: React.FC<{
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
  ariaLabel: string;
}> = ({ title, value, icon, color, onClick, ariaLabel }) => (
  <Card
    hoverable={!!onClick}
    onClick={onClick}
    style={{ borderRadius: 10, cursor: onClick ? 'pointer' : 'default' }}
    role="button"
    tabIndex={0}
    aria-label={ariaLabel}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 10,
        background: `${color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        color,
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ color: 'var(--miao-text-secondary)', fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      </div>
    </div>
  </Card>
);

/** 简易柱状图（纯 CSS） */
const SimpleBarChart: React.FC<{ data: { label: string; value: number; highlight?: boolean }[] }> = ({ data }) => {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, padding: '8px 0' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--miao-text-secondary)' }}>{d.value}</div>
          <div style={{
            width: '100%',
            minHeight: 4,
            height: Math.max((d.value / maxVal) * 100, 4),
            borderRadius: 4,
            background: d.highlight ? '#D97020' : 'var(--miao-primary)',
            transition: 'height 0.3s ease',
          }} />
          <div style={{ fontSize: 11, color: 'var(--miao-text-secondary)', whiteSpace: 'nowrap' }}>
            {d.label.slice(5)}
          </div>
        </div>
      ))}
    </div>
  );
};

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch {
      message.error('加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !stats) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  if (!stats) {
    return <Empty description="暂无数据" />;
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>管理仪表盘</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <AdminStatCard
            title="今日总调用量"
            value={stats.todayTotalCalls}
            icon={<ThunderboltOutlined />}
            color="var(--miao-primary)"
            ariaLabel={`今日总调用量: ${stats.todayTotalCalls}`}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <AdminStatCard
            title="异常请求数"
            value={stats.todayErrorCalls}
            icon={<WarningOutlined />}
            color="#D97020"
            onClick={() => navigate('/admin/logs')}
            ariaLabel={`异常请求数: ${stats.todayErrorCalls}`}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <AdminStatCard
            title="在线用户"
            value={stats.onlineUsers}
            icon={<UserOutlined />}
            color="#52c41a"
            ariaLabel={`在线用户数: ${stats.onlineUsers}`}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <AdminStatCard
            title="总用户数"
            value={stats.totalUsers}
            icon={<TeamOutlined />}
            color="#1890ff"
            ariaLabel={`总用户数: ${stats.totalUsers}`}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* 工具调用量分布 */}
        <Col xs={24} lg={12}>
          <Card title="工具调用量分布" style={{ borderRadius: 10 }}>
            {stats.toolCallDistribution.length === 0 ? (
              <Empty description="暂无数据" />
            ) : (
              <SimpleBarChart
                data={stats.toolCallDistribution.map(t => ({
                  label: t.toolId,
                  value: t.count,
                }))}
              />
            )}
          </Card>
        </Col>

        {/* 近7天异常趋势 */}
        <Col xs={24} lg={12}>
          <Card title="近7天异常请求趋势" style={{ borderRadius: 10 }}>
            {stats.errorTrend7d.length === 0 ? (
              <Empty description="暂无数据" />
            ) : (
              <SimpleBarChart
                data={stats.errorTrend7d.map(d => ({
                  label: d.date,
                  value: d.count,
                  highlight: d.count > 0,
                }))}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* 速率限制 */}
      <Card title="速率限制" style={{ borderRadius: 10, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <WarningOutlined style={{ fontSize: 20, color: '#D97020' }} />
          <span>今日速率限制触发次数：</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: stats.rateLimitHits > 0 ? '#D97020' : '#52c41a' }}>
            {stats.rateLimitHits}
          </span>
        </div>
      </Card>
    </div>
  );
};

export default DashboardPage;
