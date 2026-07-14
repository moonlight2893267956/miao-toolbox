import React, { useMemo } from 'react';
import { FireOutlined } from '@ant-design/icons';
import { useRegexContext } from '../useRegexContext';
import type { MatchResult } from '../types';

interface Segment {
  text: string;
  isMatch: boolean;
  matchIndex: number;
}

/** 将测试文本按匹配/非匹配分段（架构 Decision 1：分段 <span> 渲染） */
function buildSegments(testText: string, matches: MatchResult[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  matches.forEach((m, idx) => {
    if (m.index > cursor) {
      segments.push({ text: testText.slice(cursor, m.index), isMatch: false, matchIndex: -1 });
    }
    segments.push({ text: testText.slice(m.index, m.endIndex), isMatch: true, matchIndex: idx });
    cursor = m.endIndex;
  });
  if (cursor < testText.length) {
    segments.push({ text: testText.slice(cursor), isMatch: false, matchIndex: -1 });
  }
  return segments;
}

const MatchHighlight: React.FC = () => {
  const { state, setActiveMatch } = useRegexContext();
  const segments = useMemo(
    () => buildSegments(state.testText, state.matches),
    [state.testText, state.matches],
  );

  if (state.testText.length === 0) {
    return (
      <div className="rt-empty-state">
        <FireOutlined className="rt-empty-state-icon" />
        <p className="rt-empty-state-title">暂无测试文本</p>
        <p className="rt-empty-state-hint">在左侧输入测试文本后，匹配结果将在此高亮展示。</p>
      </div>
    );
  }

  return (
    <pre className="rt-highlight-preview" aria-live="polite">
      {segments.map((seg, i) =>
        seg.isMatch ? (
          <span
            key={i}
            className={`rt-match rt-match--${seg.matchIndex % 6} ${seg.matchIndex === state.activeMatchIndex ? 'rt-match--active' : ''}`}
            onClick={() => setActiveMatch(seg.matchIndex)}
            title="点击查看该匹配的捕获组"
            role="button"
          >
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </pre>
  );
};

export default MatchHighlight;
