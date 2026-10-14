/**
 * 排行榜面板：模式 × 榜单范围切换 + 榜单表格。
 *
 * 三态齐备（加载 / 空 / 失败可重试）：排行榜是**依赖网络**的功能，
 * 失败是常态而不是异常。失败时不能把整块区域变空白 ——
 * 用户会以为是页面坏了；必须给出原因与重试入口。
 *
 * ── 为什么 loading 是「派生」而不是一个 state ──
 *
 * 早期写法在 effect 里先 `setState({ status: 'loading' })` 再发请求，
 * 这会在挂载后立刻产生一次级联渲染（React 明确不建议，eslint 也会报
 * `set-state-in-effect`）。改成：把「这批数据属于哪一次查询」记下来，
 * 当前查询键与已到达的数据键不一致 → 就是加载中。于是只有异步回调里
 * 才 setState，且天然处理了「切模式时旧数据不会冒充新数据」。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { CHALLENGE_CONFIGS, CHALLENGE_ORDER, type ChallengeMode } from '../utils/wubi/challenge';
import { todayKey } from '../utils/wubi/statsAggregation';
import {
  fetchLeaderboard,
  describeChallengeApiError,
  type LeaderboardData,
} from '../utils/wubi/challengeApi';

type LeaderboardScope = 'all' | 'daily';

/** 一次查询的结果，`key` 标明它属于哪次查询 */
interface FetchedBoard {
  key: string;
  status: 'ready' | 'failed';
  data: LeaderboardData | null;
  error: string | null;
}

/** 前三名专属徽记 */
const MEDALS = ['gold', 'silver', 'bronze'] as const;

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`;
}

const LeaderboardPanel: React.FC = () => {
  const [mode, setMode] = useState<ChallengeMode>('sprint');
  const [scope, setScope] = useState<LeaderboardScope>('all');
  const [reloadKey, setReloadKey] = useState(0);
  const [fetched, setFetched] = useState<FetchedBoard | null>(null);

  const queryKey = `${mode}|${scope}|${reloadKey}`;

  useEffect(() => {
    let cancelled = false;

    fetchLeaderboard({
      mode,
      scope,
      date: scope === 'daily' ? todayKey() : undefined,
      limit: 50,
    })
      .then((data) => {
        if (cancelled) return;
        setFetched({ key: queryKey, status: 'ready', data, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[LeaderboardPanel] 榜单加载失败:', err);
        setFetched({
          key: queryKey,
          status: 'failed',
          data: null,
          error: describeChallengeApiError(err),
        });
      });

    return () => { cancelled = true; };
  }, [mode, scope, queryKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const loading = fetched === null || fetched.key !== queryKey;
  const failed = !loading && fetched?.status === 'failed';
  const data = !loading && fetched?.status === 'ready' ? fetched.data : null;
  const empty = data !== null && data.entries.length === 0;
  const showMyFooterRow = data !== null && data.myRank > data.entries.length && data.myScore !== null;

  /** 名字首字做头像字：中文取姓、英文取首字母 */
  const initialOf = (name: string) => name.trim().slice(0, 1).toUpperCase() || '?';

  return (
    <section className="wt-lb">
      <div className="wt-lb__bar">
        <div className="wt-lb__group" role="tablist" aria-label="挑战模式">
          {CHALLENGE_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`wt-lb__seg${mode === m ? ' wt-lb__seg--active' : ''}`}
              onClick={() => setMode(m)}
            >
              {CHALLENGE_CONFIGS[m].label}
            </button>
          ))}
        </div>

        {/* 总榜/日榜是**次级**筛选：做成下划线页签，别和主控件（模式）抢焦点 */}
        <div
          className="wt-lb__group wt-lb__group--right wt-lb__group--subtle"
          role="tablist"
          aria-label="榜单范围"
        >
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'all'}
            className={`wt-lb__seg${scope === 'all' ? ' wt-lb__seg--active' : ''}`}
            onClick={() => setScope('all')}
          >
            总榜
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'daily'}
            className={`wt-lb__seg${scope === 'daily' ? ' wt-lb__seg--active' : ''}`}
            onClick={() => setScope('daily')}
          >
            日榜
          </button>
        </div>
      </div>

      {data && (
        <div className="wt-lb__meta">
          <span className="wt-lb__meta-hint">
            {CHALLENGE_CONFIGS[mode].scoreHint}
            {scope === 'daily' && data.date ? ` · ${data.date}` : ''}
          </span>
          <span className="wt-lb__meta-count">共 {data.total} 人参与</span>
        </div>
      )}

      {loading && (
        <div className="wt-lb__skeleton" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="wt-lb__skeleton-row" />
          ))}
        </div>
      )}

      {failed && (
        <div className="wt-lb__empty">
          <p className="wt-lb__empty-text">{fetched?.error}</p>
          <button type="button" className="wt-challenge-btn" onClick={retry}>
            <ReloadOutlined /> 重试
          </button>
        </div>
      )}

      {empty && (
        <div className="wt-lb__empty">
          <p className="wt-lb__empty-text">还没有人挑战，来做第一个</p>
          <button type="button" className="wt-challenge-btn" onClick={retry}>
            <ReloadOutlined /> 刷新
          </button>
        </div>
      )}

      {data && data.entries.length > 0 && (
        <div className="wt-lb__table-wrap">
          <table className="wt-lb__table">
            <thead>
              <tr>
                <th className="wt-lb__col-rank">名次</th>
                <th>用户</th>
                <th className="wt-lb__col-score">成绩</th>
                <th className="wt-lb__col-num">准确率</th>
                <th className="wt-lb__col-num">连击</th>
                <th className="wt-lb__col-num">用时</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr
                  key={`${entry.rank}-${entry.username}`}
                  className={entry.isMe ? 'wt-lb__row--me' : undefined}
                >
                  <td className="wt-lb__col-rank">
                    <span
                      className={`wt-lb__rank${entry.rank <= 3 ? ` wt-lb__rank--${MEDALS[entry.rank - 1]}` : ''}`}
                    >
                      {entry.rank}
                    </span>
                  </td>
                  <td className="wt-lb__user">
                    <span
                      className={`wt-lb__avatar${entry.isMe ? ' wt-lb__avatar--me' : ''}`}
                      aria-hidden="true"
                    >
                      {initialOf(entry.username)}
                    </span>
                    <span className="wt-lb__name">{entry.username}</span>
                    {entry.isMe && <span className="wt-lb__me-tag">你</span>}
                  </td>
                  <td className="wt-lb__col-score">
                    <span className="wt-lb__score">{entry.score}</span>
                  </td>
                  <td className="wt-lb__col-num">
                    {entry.accuracyPercent}
                    <span className="wt-lb__unit">%</span>
                  </td>
                  <td className="wt-lb__col-num">{entry.maxCombo}</td>
                  <td className="wt-lb__col-num">{formatDuration(entry.durationSec)}</td>
                </tr>
              ))}
              {showMyFooterRow && (
                <tr className="wt-lb__row--me wt-lb__row--footer">
                  <td className="wt-lb__col-rank">
                    <span className="wt-lb__rank">{data.myRank}</span>
                  </td>
                  <td className="wt-lb__user">
                    <span className="wt-lb__avatar wt-lb__avatar--me" aria-hidden="true">
                      我
                    </span>
                    <span className="wt-lb__name">我的最好成绩</span>
                    <span className="wt-lb__me-tag">你</span>
                  </td>
                  <td className="wt-lb__col-score">
                    <span className="wt-lb__score">{data.myScore}</span>
                  </td>
                  <td className="wt-lb__col-num" colSpan={3}>不在前 50 名内</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default LeaderboardPanel;
