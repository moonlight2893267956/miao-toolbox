import React from 'react';

interface SparklineProps {
  data: number[];
  height?: number;
  strokeColor?: string;
  fillGradient?: [string, string];
  className?: string;
}

/**
 * 纯 SVG sparkline 组件
 * 接收数字数组，绘制带渐变填充的折线图
 */
const Sparkline: React.FC<SparklineProps> = ({
  data,
  height = 38,
  strokeColor = 'var(--miao-primary)',
  fillGradient,
  className,
}) => {
  if (data.length < 2) return null;

  const width = 220;
  const padding = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const linePath = `M${points.join(' L')}`;
  const fillPath = `${linePath} L${width - padding},${height} L${padding},${height} Z`;

  const gradId = `sp-grad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0%"
            stopColor={fillGradient ? fillGradient[0] : strokeColor}
            stopOpacity={0.3}
          />
          <stop
            offset="100%"
            stopColor={fillGradient ? fillGradient[1] : strokeColor}
            stopOpacity={0}
          />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={strokeColor} strokeWidth={2} />
    </svg>
  );
};

export default Sparkline;
