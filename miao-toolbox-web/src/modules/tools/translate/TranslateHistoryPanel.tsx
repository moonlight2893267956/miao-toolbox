import React, { useMemo, useState } from 'react';
import { Button, Tooltip, Segmented, message } from 'antd';
import {
  HistoryOutlined,
  StarOutlined,
  StarFilled,
  DeleteOutlined,
} from '@ant-design/icons';
import { useTranslateHistory } from './useTranslateHistory';
import { useTranslateContext } from './useTranslateContext';
import { LANGUAGE_OPTIONS, type LanguageCode } from './types';
import type { TranslateHistoryEntry } from './useTranslateHistory';

/**
 * 历史记录 Tab —— 实现 FR-21。
 *
 * - 列表展示每次翻译记录（原文/译文预览、语种对、时间）。
 * - 支持收藏切换（星标）与「全部 / 收藏」筛选（AC3）。
 * - 单条删除与清空全部（AC5）。
 * - 点击记录加载到文本翻译面板：经 TranslateContext 的 prefill 跨面板联动（AC4，复用 FR-7 通道）。
 */

const langLabel = (code: string): string =>
  LANGUAGE_OPTIONS.find((l) => l.code === code)?.label ?? code;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

// 容错：历史记录可能含旧的脏数据（target/source 缺失），避免 undefined.length 崩溃整列表
const truncate = (s: string | undefined | null, n = 80) => {
  const str = s ?? '';
  return str.length > n ? `${str.slice(0, n)}…` : str;
};

const TranslateHistoryPanel: React.FC = () => {
  const { list, clear, remove, toggleFavorite } = useTranslateHistory();
  const { dispatch } = useTranslateContext();
  const [onlyFav, setOnlyFav] = useState(false);

  const shown = useMemo(
    () => (onlyFav ? list.filter((e) => e.favorite) : list),
    [list, onlyFav],
  );

  const handleLoad = (e: TranslateHistoryEntry) => {
    // 图片翻译记录无可用原文（或仅 [图片] 占位），不支持载入文本面板重编辑
    if (e.mode === 'image' || e.source === '[图片]') {
      message.info('图片翻译记录暂不支持重新编辑');
      return;
    }
    dispatch({
      type: 'SET_PREFILL',
      payload: { text: e.source, target: e.target, from: e.from as LanguageCode, to: e.to as LanguageCode },
    });
    dispatch({ type: 'SET_ACTIVE_TAB', payload: 'text' });
  };

  return (
    <div className="tt-panel tt-history-panel">
      <div className="tt-history-toolbar">
        <Segmented
          className="tt-segmented"
          value={onlyFav ? 'fav' : 'all'}
          onChange={(v) => setOnlyFav(v === 'fav')}
          options={[
            { label: '全部', value: 'all' },
            { label: '收藏', value: 'fav' },
          ]}
        />
        <span className="tt-history-count">{list.length} 条记录</span>
        {list.length > 0 && (
          <Button
            size="small"
            danger
            type="text"
            icon={<DeleteOutlined />}
            onClick={clear}
            className="tt-history-clear"
          >
            清空
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="tt-output tt-output--placeholder tt-output--detect">
          <HistoryOutlined className="tt-output-icon" />
          <span>{onlyFav ? '暂无收藏记录' : '暂无历史记录，翻译后将自动保存'}</span>
        </div>
      ) : (
        <div className="tt-history-list">
          {shown.map((e) => (
            <div
              className={`tt-history-item${e.mode === 'image' ? ' tt-history-item--image' : ''}`}
              key={e.id}
              role="button"
              tabIndex={0}
              onClick={() => handleLoad(e)}
              onKeyDown={(ev) => ev.key === 'Enter' && handleLoad(e)}
            >
              <div className="tt-history-meta">
                <span className="tt-history-lang">
                  {langLabel(e.from)} → {langLabel(e.to)}
                  {e.mode === 'image' && <span className="tt-history-badge">图片</span>}
                </span>
                <span className="tt-history-time">{formatTime(e.timestamp)}</span>
              </div>
              <div className="tt-history-src">{truncate(e.source)}</div>
              <div className="tt-history-dst">{truncate(e.target)}</div>
              <div
                className="tt-history-actions"
                onClick={(ev) => ev.stopPropagation()}
                onKeyDown={(ev) => ev.stopPropagation()}
              >
                <Tooltip title={e.favorite ? '取消收藏' : '收藏'}>
                  <Button
                    size="small"
                    type="text"
                    icon={e.favorite ? <StarFilled className="tt-star-active" /> : <StarOutlined />}
                    onClick={() => toggleFavorite(e.id)}
                  />
                </Tooltip>
                <Tooltip title="删除">
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => remove(e.id)}
                  />
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TranslateHistoryPanel;
