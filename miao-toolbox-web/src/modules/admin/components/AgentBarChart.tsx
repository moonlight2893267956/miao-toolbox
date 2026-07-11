import React, { useState } from 'react';

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
 * 当数据条数超过 maxItems 时，标题栏自动出现「展开全部 / 收起」按钮
 */
const AgentBarChart: React.FC<AgentBarChartProps> = ({
  data,
  maxItems,
  title,
  subtitle,
  action,
}) => {
  const [showAll, setShowAll] = useState(false);
  const capped = maxItems != null && !showAll;
  const displayData = capped ? data.slice(0, maxItems) : data;
  const maxVal = Math.max(...displayData.map((d) => d.value), 1);
  const canExpand = maxItems != null && data.length > maxItems;

  return (
    <div className="miao-admin-panel">
      {(title || action || canExpand) && (
        <div className="miao-admin-panel-head">
          <div>
            {title && <h3 className="miao-admin-panel-title">{title}</h3>}
            {subtitle && <div className="miao-admin-panel-sub">{subtitle}</div>}
          </div>
          {canExpand ? (
            <button
              type="button"
              className="miao-admin-btn-ghost"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? '收起' : `展开全部 (${data.length})`} →
            </button>
          ) : (
            action
          )}
        </div>
      )}
      <div className="miao-admin-bar-chart">
        {displayData.map((d) => (
          <div key={d.label} className="miao-admin-bar-row">
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
