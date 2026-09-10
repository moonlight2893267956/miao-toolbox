import React from 'react';

interface SchedulerPanelProps {
  label: string;
  /** 面板头右侧元信息 */
  meta?: React.ReactNode;
  /** 强调色变体（面板头圆点颜色） */
  tone?: 'accent' | 'schedule' | 'target' | 'notify';
  /** 入场动画错峰序号 */
  index?: number;
  /** 内容区去掉内边距（表格类内容自带宽边距时用） */
  flush?: boolean;
  /** 撑满剩余高度（列表页表格占满工作台，内容区内部滚动） */
  fill?: boolean;
  children: React.ReactNode;
}

/**
 * 工作室面板（与 regex-tester 的 `.rt-panel` 同语言）：
 * 面板头（强调色圆点 + 标题 + 元信息）+ 内容区，带错峰入场动效。
 */
const SchedulerPanel: React.FC<SchedulerPanelProps> = ({
  label,
  meta,
  tone = 'accent',
  index = 0,
  flush = false,
  fill = false,
  children,
}) => (
  <section
    className={
      `ts-panel`
      + (tone === 'accent' ? '' : ` ts-panel--${tone}`)
      + (fill ? ' ts-panel--fill' : '')
    }
    style={{ '--ts-i': index } as unknown as React.CSSProperties}
  >
    <div className="ts-panel-head">
      <span className="ts-panel-label">{label}</span>
      {meta != null ? <span className="ts-panel-meta">{meta}</span> : null}
    </div>
    <div className={`ts-panel-body${flush ? ' ts-panel-body--flush' : ''}`}>{children}</div>
  </section>
);

export default SchedulerPanel;
