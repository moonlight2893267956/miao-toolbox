import React from 'react';
import { useRegexContext } from '../useRegexContext';

/** 原子结构 SVG：3 个节点 + 2 段连接线，象征「无捕获组 → 仅整体匹配」 */
const AtomIcon: React.FC = () => (
  <svg className="rt-success-empty-icon" viewBox="0 0 96 96" fill="none" aria-hidden>
    <defs>
      <linearGradient id="rt-atom-core" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--tool-accent)" stopOpacity="0.9" />
        <stop offset="100%" stopColor="var(--tool-accent)" stopOpacity="0.5" />
      </linearGradient>
      <linearGradient id="rt-atom-line" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--tool-accent)" stopOpacity="0.7" />
        <stop offset="100%" stopColor="var(--tool-accent)" stopOpacity="0.25" />
      </linearGradient>
    </defs>
    <line x1="32" y1="32" x2="64" y2="32" stroke="url(#rt-atom-line)" strokeWidth="2" strokeLinecap="round" />
    <line x1="48" y1="32" x2="48" y2="64" stroke="url(#rt-atom-line)" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 4" />
    <line x1="32" y1="32" x2="48" y2="64" stroke="url(#rt-atom-line)" strokeWidth="2" strokeLinecap="round" />
    <line x1="64" y1="32" x2="48" y2="64" stroke="url(#rt-atom-line)" strokeWidth="2" strokeLinecap="round" />
    <circle cx="32" cy="32" r="6" fill="url(#rt-atom-core)" />
    <circle cx="64" cy="32" r="6" fill="url(#rt-atom-core)" />
    <circle cx="48" cy="64" r="7" fill="url(#rt-atom-core)" />
  </svg>
);

const MatchGroups: React.FC = () => {
  const { state } = useRegexContext();
  const total = state.matchDetails.length;

  if (total === 0) {
    return (
      <div className="rt-groups-empty">
        <AtomIcon />
        <div className="rt-success-empty-text">
          <p className="rt-success-empty-title">等待首次匹配</p>
          <p className="rt-success-empty-desc">
            匹配成功后，将在此展示捕获组的<strong>位置</strong>、<strong>内容</strong>与<strong>命名组</strong>。
            带 <code>g</code> 标志有多处匹配时，点击上方高亮片段可切换查看。
          </p>
        </div>
      </div>
    );
  }

  const detail = state.matchDetails[state.activeMatchIndex] ?? state.matchDetails[0];

  if (detail.groups.length === 0) {
    return (
      <div className="rt-groups">
        <div className="rt-groups-head">
          <span className="rt-groups-label">分组详情</span>
          <span className="rt-groups-counter">匹配 #{detail.matchIndex + 1} / 共 {total}</span>
        </div>

        <div className="rt-group-row rt-group-row--full">
          <span className="rt-group-tag rt-group-tag--full">完整匹配</span>
          <code className="rt-group-value">{detail.fullMatch.length ? detail.fullMatch : '（空匹配）'}</code>
          <span className="rt-group-pos">[{detail.start}, {detail.end})</span>
        </div>

        <div className="rt-success-empty">
          <AtomIcon />
          <div className="rt-success-empty-text">
            <p className="rt-success-empty-title">仅整体匹配 · 无捕获组</p>
            <p className="rt-success-empty-desc">
              当前正则只命中整体，不包含任何 <code>( )</code> 捕获组。
              需要查看子组时，可改写为 <code>(\w+)</code> 形式；命名组用 <code>{`(?<name>…)`}</code>。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rt-groups">
      <div className="rt-groups-head">
        <span className="rt-groups-label">分组详情</span>
        <span className="rt-groups-counter">匹配 #{detail.matchIndex + 1} / 共 {total}</span>
      </div>

      <div className="rt-group-row rt-group-row--full">
        <span className="rt-group-tag rt-group-tag--full">完整匹配</span>
        <code className="rt-group-value">{detail.fullMatch.length ? detail.fullMatch : '（空匹配）'}</code>
        <span className="rt-group-pos">[{detail.start}, {detail.end})</span>
      </div>

      {detail.groups.map((g) => (
        <div key={g.index} className="rt-group-row">
          <span className="rt-group-tag">
            {g.name ? (
              <>
                <span className="rt-group-name">{g.name}</span>
                <span className="rt-group-idx">#{g.index}</span>
              </>
            ) : (
              <span className="rt-group-idx">#{g.index}</span>
            )}
          </span>
          <code className="rt-group-value">{g.value.length ? g.value : '（空）'}</code>
          <span className="rt-group-pos">
            {g.start !== null && g.end !== null ? `[${g.start}, ${g.end})` : '位置不可用'}
          </span>
        </div>
      ))}
    </div>
  );
};

export default MatchGroups;
