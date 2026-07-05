import React from 'react';
import Sparkline from './Sparkline';

type TrendDirection = 'up' | 'down' | 'neutral';

interface AdminStatCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  icon?: React.ReactNode;
  iconVariant?: 'primary' | 'amber' | 'green' | 'blue' | 'red';
  trend?: {
    direction: TrendDirection;
    text: string;
  };
  sparklineData?: number[];
  barPercent?: number;
  barColor?: string;
  ringPercent?: number;
  ringColor?: string;
  feature?: boolean;
  compact?: boolean;
  onClick?: () => void;
  ariaLabel: string;
}

const iconVariantMap: Record<string, string> = {
  primary: 'miao-admin-stat-icon--primary',
  amber: 'miao-admin-stat-icon--amber',
  green: 'miao-admin-stat-icon--green',
  blue: 'miao-admin-stat-icon--blue',
  red: 'miao-admin-stat-icon--red',
};

const trendClassMap: Record<TrendDirection, string> = {
  up: 'miao-admin-trend--up',
  down: 'miao-admin-trend--down',
  neutral: 'miao-admin-trend',
};

const RingProgress: React.FC<{ percent: number; color?: string }> = ({ percent, color }) => {
  const safe = Math.min(Math.max(percent, 0), 100);
  const radius = 24;
  const stroke = 5;
  const normalizedRadius = radius - stroke * 0.5;
  const circumference = normalizedRadius * 2 * Math.PI;
  const dashoffset = circumference - (safe / 100) * circumference;

  return (
    <div className="miao-admin-stat-ring">
      <svg width={radius * 2} height={radius * 2} viewBox={`0 0 ${radius * 2} ${radius * 2}`}>
        <circle
          className="miao-admin-stat-ring-track"
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          strokeWidth={stroke}
        />
        <circle
          className="miao-admin-stat-ring-fill"
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashoffset}
          style={{ stroke: color || undefined }}
        />
      </svg>
      <span className="miao-admin-stat-ring-text" style={{ color: color || undefined }}>
        {Math.round(safe)}%
      </span>
    </div>
  );
};

/**
 * Hero 统计卡
 * - feature 模式：首张放大 + 渐变背景
 * - sparklineData: 纯 SVG 折线图
 * - barPercent: 进度条模式
 * - ringPercent: 环形进度模式
 * - trend: 趋势文字（涨/跌/中性）
 */
const AdminStatCard: React.FC<AdminStatCardProps> = ({
  label,
  value,
  suffix,
  icon,
  iconVariant = 'primary',
  trend,
  sparklineData,
  barPercent,
  barColor,
  ringPercent,
  ringColor,
  feature = false,
  compact = false,
  onClick,
  ariaLabel,
}) => (
  <div
    className={[
      'miao-admin-stat-card',
      feature && 'miao-admin-stat-card--feature',
      compact && 'miao-admin-stat-card--compact',
      onClick && 'miao-admin-stat-card--clickable',
    ]
      .filter(Boolean)
      .join(' ')}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    aria-label={ariaLabel}
  >
    <div className="miao-admin-stat-head">
      <span className="miao-admin-stat-label">{label}</span>
      {icon && (
        <span className={`miao-admin-stat-icon ${iconVariantMap[iconVariant] || ''}`}>
          {icon}
        </span>
      )}
    </div>

    <div className="miao-admin-stat-body">
      <div className="miao-admin-stat-value">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix && <span className="miao-admin-stat-suffix">{suffix}</span>}
      </div>

      {ringPercent !== undefined && (
        <RingProgress percent={ringPercent} color={ringColor} />
      )}
    </div>

    {sparklineData && sparklineData.length > 1 && (
      <Sparkline data={sparklineData} height={38} className="miao-admin-stat-sparkline" />
    )}

    {barPercent !== undefined && (
      <div className="miao-admin-stat-bar">
        <div
          className="miao-admin-stat-bar-fill"
          style={{
            width: `${Math.min(Math.max(barPercent, 0), 100)}%`,
            background: barColor || undefined,
          }}
        />
      </div>
    )}

    {trend && (
      <div className="miao-admin-stat-foot">
        <span className={trendClassMap[trend.direction]}>{trend.text}</span>
      </div>
    )}
  </div>
);

export default AdminStatCard;
