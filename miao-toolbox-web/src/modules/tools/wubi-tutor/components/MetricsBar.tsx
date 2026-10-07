/**
 * 实时指标条组件
 *
 * 常驻显示：已用时、当前速度、当前准确率、击键次数、连击正确数。
 * 会话结束后指标冻结。
 */

import React from 'react';
import { ClockCircleOutlined, ThunderboltOutlined, AimOutlined } from '@ant-design/icons';
import {
  formatTime,
  formatPercent,
  type MetricsSnapshot,
} from '../utils/wubi/metrics';

interface MetricsBarProps {
  metrics: MetricsSnapshot;
  frozen?: boolean;
  /**
   * 速度单位。
   *
   * `metrics.speedPerMinute` 的口径是「完成的字数/分钟」；
   * 键位 / 字根类练习不涉及汉字（charCount = 0），会回退成「题/分钟」，
   * 此时调用方需传 '题/分'，否则数字与单位对不上。
   */
  speedUnit?: string;
}

const MetricsBar: React.FC<MetricsBarProps> = ({
  metrics,
  frozen = false,
  speedUnit = '字/分',
}) => {
  return (
    <div className={`wt-metrics-bar${frozen ? ' wt-metrics-bar--frozen' : ''}`}>
      <div className="wt-metrics-bar__item">
        <ClockCircleOutlined className="wt-metrics-bar__icon" />
        <span className="wt-metrics-bar__label">用时</span>
        <span className="wt-metrics-bar__value">{formatTime(metrics.elapsedSec)}</span>
      </div>

      <div className="wt-metrics-bar__divider" />

      <div className="wt-metrics-bar__item">
        <ThunderboltOutlined className="wt-metrics-bar__icon" />
        <span className="wt-metrics-bar__label">速度</span>
        <span className="wt-metrics-bar__value">{metrics.speedPerMinute}</span>
        <span className="wt-metrics-bar__unit">{speedUnit}</span>
      </div>

      <div className="wt-metrics-bar__divider" />

      <div className="wt-metrics-bar__item">
        <AimOutlined className="wt-metrics-bar__icon" />
        <span className="wt-metrics-bar__label">准确率</span>
        <span className="wt-metrics-bar__value">{formatPercent(metrics.accuracy)}</span>
      </div>

      <div className="wt-metrics-bar__divider" />

      <div className="wt-metrics-bar__item">
        <span className="wt-metrics-bar__label">击键</span>
        <span className="wt-metrics-bar__value">{metrics.totalKeystrokes}</span>
        <span className="wt-metrics-bar__unit">
          ({metrics.errorKeystrokes} 错)
        </span>
      </div>

      <div className="wt-metrics-bar__divider" />

      <div className="wt-metrics-bar__item">
        <span className="wt-metrics-bar__label">连击</span>
        <span className="wt-metrics-bar__value wt-metrics-bar__value--combo">
          {metrics.combo}
        </span>
        {metrics.maxCombo > 0 && (
          <span className="wt-metrics-bar__unit">最高 {metrics.maxCombo}</span>
        )}
      </div>
    </div>
  );
};

export default MetricsBar;
