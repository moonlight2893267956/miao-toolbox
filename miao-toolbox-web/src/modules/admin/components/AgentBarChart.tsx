import React from 'react';

interface AgentBarChartProps {
  data: { label: string; value: number }[];
  maxItems?: number;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

/**
 * 横向 bar 图表
 * 替代原 HorizontalBarChart，支持渐变 bar + 大数字右对齐
 */
const AgentBarChart: React.FC<AgentBarChartProps> = ({
  data,
  maxItems,
  title,
  subtitle,
  action,
}) => {
  const displayData = maxItems ? data.slice(0, maxItems) : data;
  const maxVal = Math.max(...displayData.map((d) => d.value), 1);

  return (
    <div className="miao-admin-panel">
      {(title || action) && (
        <div className="miao-admin-panel-head">
          <div>
            {title && <h3 className="miao-admin-panel-title">{title}</h3>}
            {subtitle && <div className="miao-admin-panel-sub">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div className="miao-admin-bar-chart">
        {displayData.map((d, i) => (
          <div key={i} className="miao-admin-bar-row">
            <span className="miao-admin-bar-name">{d.label}</span>
            <div className="miao-admin-bar-track">
              <div
                className="miao-admin-bar-fill"
                style={{ width: `${Math.max((d.value / maxVal) * 100, 2)}%` }}
              />
            </div>
            <span className="miao-admin-bar-value">
              {d.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgentBarChart;
