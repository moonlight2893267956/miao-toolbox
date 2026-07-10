import React, { useEffect, useMemo, useRef } from 'react';
import { Button, Tooltip } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { buildSubtitles, formatTime } from './subtitle';

interface SubtitleViewProps {
  /** 识别原文（sourceText） */
  source: string;
  /** 翻译译文（translatedText） */
  target: string;
  /** 录音时长（秒），用于推导近似时间码 */
  durationSec?: number;
  /** 复制单句对照的回调 */
  onCopySegment?: (text: string) => void;
}

/** 格式化时间区间：单点时只显示 start，有区间时显示 start - end */
const formatTimeRange = (start: number, end: number): string => {
  if (end > start) {
    return `${formatTime(start)} - ${formatTime(end)}`;
  }
  return formatTime(start);
};

/**
 * 字幕式译文展示（FR-13，story-3.3）。
 *
 * 以「原文 → 译文」字幕段纵向滚动呈现：每段带近似时间区间与序号，加载时顺序浮现，
 * 并自动滚动到底部，模拟视频字幕的滚动观感。时间码由录音时长均摊推导（百度无真实时间戳）。
 */
const SubtitleView: React.FC<SubtitleViewProps> = ({
  source,
  target,
  durationSec,
  onCopySegment,
}) => {
  const segments = useMemo(
    () => buildSubtitles(source, target, durationSec ?? 0),
    [source, target, durationSec],
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 结果加载后自动滚动到底部，呈现「字幕滚动」观感
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [segments]);

  if (segments.length === 0) {
    return <div className="tt-subtitle-empty">（未识别到可展示的字幕）</div>;
  }

  const multi = segments.length > 1;

  return (
    <div className="tt-subtitle" ref={scrollRef}>
      {segments.map((seg, i) => (
        <div
          key={i}
          className="tt-subtitle-line"
          // 限制最大延迟，避免长字幕浮现间隔过久
          style={{ animationDelay: `${Math.min(i, 16) * 80}ms` }}
        >
          <div className="tt-subtitle-meta">
            <span className="tt-subtitle-time">{formatTimeRange(seg.start, seg.end)}</span>
            {multi && (
              <span className="tt-subtitle-index">
                {i + 1}/{segments.length}
              </span>
            )}
            {onCopySegment && (seg.src || seg.dst) && (
              <Tooltip title="复制本句对照">
                <Button
                  size="small"
                  type="text"
                  icon={<CopyOutlined />}
                  className="tt-subtitle-copy"
                  onClick={() =>
                    onCopySegment(`【原文】\n${seg.src}\n\n【译文】\n${seg.dst}`)
                  }
                />
              </Tooltip>
            )}
          </div>
          <div className="tt-subtitle-src">
            {seg.src && seg.src.trim() ? seg.src : '（无原文）'}
          </div>
          <div className="tt-subtitle-dst">
            {seg.dst && seg.dst.trim() ? seg.dst : '（无译文）'}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SubtitleView;
