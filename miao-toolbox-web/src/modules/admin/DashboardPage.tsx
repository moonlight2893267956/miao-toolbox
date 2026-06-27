import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Spin, Empty, Button, message, Tag } from 'antd';
import { ReloadOutlined, ThunderboltOutlined, WarningOutlined, UserOutlined, TeamOutlined, RobotOutlined, ApiOutlined, LineChartOutlined, PieChartOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats, type DashboardStats } from '../../services/adminService';
import { getDashboardAiStats, type DashboardAiStats } from '../../services/aiInvocationService';

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

/** 简易柱状图（纯 CSS，横向） */
const HorizontalBarChart: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 100, fontSize: 13, textAlign: 'right', color: 'var(--miao-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.label}
          </div>
          <div style={{ flex: 1, height: 20, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.max((d.value / maxVal) * 100, 2)}%`,
              background: 'var(--miao-primary)',
              borderRadius: 4,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ width: 50, fontSize: 13, fontWeight: 600 }}>{d.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
};

/** 简易饼图（纯 CSS，环形） */
const SimplePieChart: React.FC<{ data: { label: string; value: number; color: string }[] }> = ({ data }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <Empty description="暂无数据" />;

  const colors = ['#5C4FD0', '#7B68EE', '#9B89F5', '#B8A9F7', '#D4C5F9', '#d9d9d9'];

  // CSS conic-gradient
  let gradientParts: string[] = [];
  let currentPercent = 0;
  const items = data.slice(0, 5);
  const otherValue = data.slice(5).reduce((s, d) => s + d.value, 0);
  if (otherValue > 0) items.push({ label: '其他', value: otherValue, color: '#d9d9d9' });

  items.forEach((d, i) => {
    const percent = (d.value / total) * 100;
    gradientParts.push(`${colors[i % colors.length]} ${currentPercent}% ${currentPercent + percent}%`);
    currentPercent += percent;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 120,
        height: 120,
        borderRadius: '50%',
        background: `conic-gradient(${gradientParts.join(', ')})`,
        flexShrink: 0,
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: colors[i % colors.length], flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--miao-text-secondary)' }}>{d.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{d.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** 简易折线图（纯 CSS SVG） */
const SimpleLineChart: React.FC<{ data: { date: string; value: number }[] }> = ({ data }) => {
  if (data.length === 0) return <Empty description="暂无数据" />;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const width = 300;
  const height = 120;
  const padding = 20;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = data.map((d, i) => ({
    x: padding + (i / Math.max(data.length - 1, 1)) * chartWidth,
    y: padding + chartHeight - (d.value / maxVal) * chartHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding + chartHeight} L ${points[0].x} ${padding + chartHeight} Z`;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxHeight: 140 }}>
        <path d={areaPath} fill="var(--miao-primary)" opacity={0.1} />
        <path d={linePath} fill="none" stroke="var(--miao-primary)" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--miao-primary)" />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px', marginTop: 4 }}>
        {data.map((d, i) => (
          <span key={i} style={{ fontSize: 10, color: 'var(--miao-text-secondary)' }}>
            {d.date.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
};

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

  if (loading && !stats) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  if (!stats) {
    return <Empty description="暂无数据" />;
  }

  const failureRatePercent = aiStats ? (aiStats.failureRate * 100).toFixed(1) : '0.0';
  const isFailureRateHigh = aiStats && aiStats.failureRate > 0.05;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>管理仪表盘</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
      </div>

      {/* 原有统计卡片 */}
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

      {/* ===== AI 用量区块 ===== */}
      <h3 style={{ margin: '24px 0 12px', color: 'var(--miao-text-secondary)' }}>
        <RobotOutlined style={{ marginRight: 8 }} />AI 调用量（近 7 天）
      </h3>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 10, textAlign: 'center' }}>
            <div style={{ color: 'var(--miao-text-secondary)', fontSize: 13, marginBottom: 4 }}>总调用量</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{aiStats?.totalCalls ?? 0}</div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 10, textAlign: 'center' }}>
            <div style={{ color: 'var(--miao-text-secondary)', fontSize: 13, marginBottom: 4 }}>总 Token 用量</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{(aiStats?.totalTokens ?? 0).toLocaleString()}</div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 10, textAlign: 'center' }}>
            <div style={{ color: 'var(--miao-text-secondary)', fontSize: 13, marginBottom: 4 }}>失败率</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: isFailureRateHigh ? '#ff4d4f' : undefined }}>
              {failureRatePercent}%
            </div>
            {isFailureRateHigh && <Tag color="red" style={{ marginTop: 4 }}>异常</Tag>}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Agent 调用量分布 */}
        <Col xs={24} lg={12}>
          <Card title={<><ApiOutlined style={{ marginRight: 6 }} />Agent 调用量分布</>} style={{ borderRadius: 10 }}>
            {!aiStats || aiStats.agentDistribution.length === 0 ? (
              <Empty description="暂无数据" />
            ) : (
              <HorizontalBarChart
                data={aiStats.agentDistribution.map(a => ({ label: a.agentName, value: a.count }))}
              />
            )}
          </Card>
        </Col>

        {/* 模型分布 */}
        <Col xs={24} lg={12}>
          <Card title={<><PieChartOutlined style={{ marginRight: 6 }} />模型分布</>} style={{ borderRadius: 10 }}>
            {!aiStats || aiStats.modelDistribution.length === 0 ? (
              <Empty description="暂无数据" />
            ) : (
              <SimplePieChart
                data={aiStats.modelDistribution.map(m => ({ label: m.model, value: m.count, color: '' }))}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Token 用量趋势 */}
        <Col xs={24} lg={12}>
          <Card title={<><LineChartOutlined style={{ marginRight: 6 }} />Token 用量趋势（近 7 天）</>} style={{ borderRadius: 10 }}>
            {!aiStats || aiStats.tokenTrend7d.length === 0 ? (
              <Empty description="暂无数据" />
            ) : (
              <SimpleLineChart
                data={aiStats.tokenTrend7d.map(t => ({ date: t.date, value: t.tokens }))}
              />
            )}
          </Card>
        </Col>

        {/* 原有工具调用量分布 + 异常趋势 */}
        <Col xs={24} lg={12}>
          <Card title="近7天异常请求趋势" style={{ borderRadius: 10 }}>
            {stats.errorTrend7d.length === 0 ? (
              <Empty description="暂无数据" />
            ) : (
              <HorizontalBarChart
                data={stats.errorTrend7d.map(d => ({
                  label: d.date,
                  value: d.count,
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
