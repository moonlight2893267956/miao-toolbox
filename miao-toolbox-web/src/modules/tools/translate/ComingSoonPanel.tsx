import React from 'react';
import { Empty } from 'antd';
import type { TranslateTabKey } from './types';

/** 各占位 Tab 的"即将上线"描述 */
const COMING_SOON_INFO: Record<
  Exclude<TranslateTabKey, 'text' | 'detect' | 'history'>,
  { title: string; desc: string }
> = {
  image: {
    title: '图片翻译',
    desc: '上传图片或粘贴截图，OCR 识别并保留版式译文。计划于 P1 上线。',
  },
  voice: {
    title: '语音翻译',
    desc: '录音经识别翻译，以字幕样式滚动展示原文→译文。计划于 P1 上线。',
  },
  ai: {
    title: 'AI 增强',
    desc: '在直译之上润色、风格化、上下文连贯与长文摘要。计划于 P1 上线。',
  },
};

/**
 * P1/P2 占位面板（框架预留挂载点）。
 * 点击 Tab 可切换且不报错，提示对应能力"即将上线"。
 */
const ComingSoonPanel: React.FC<{
  tab: Exclude<TranslateTabKey, 'text' | 'detect' | 'history'>;
}> = ({ tab }) => {
  const info = COMING_SOON_INFO[tab];
  return (
    <div className="tt-panel">
      <Empty
        className="tt-coming-soon"
        image={Empty.PRESENTED_IMAGE_DEFAULT}
        description={
          <div className="tt-coming-soon-text">
            <div className="tt-coming-soon-title">{info.title} · 即将上线</div>
            <div className="tt-coming-soon-desc">{info.desc}</div>
          </div>
        }
      />
    </div>
  );
};

export default ComingSoonPanel;
