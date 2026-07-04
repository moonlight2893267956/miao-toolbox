/**
 * 操作历史面板
 *
 * 展示所有操作记录，支持清空、重新加载。
 */

import React from 'react';
import { DeleteOutlined, HistoryOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import type { HistoryEntry, CryptoTabKey } from '../types';
import { CRYPTO_TABS } from '../types';

export interface HistoryPanelProps {
  history: HistoryEntry[];
  onClear: () => void;
  onSelect: (entry: HistoryEntry) => void;
}

const TAB_LABELS = Object.fromEntries(
  CRYPTO_TABS.map((t) => [t.key, t.label]),
) as Record<CryptoTabKey, string>;

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, onClear, onSelect }) => {
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (isToday) return time;
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
  };

  const allEntries = history.length > 0 ? history : [];

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}>
        <span style={{ fontSize: 13, color: 'var(--crypto-text-secondary)' }}>
          {allEntries.length > 0 ? `共 ${allEntries.length} 条记录` : '暂无操作记录'}
        </span>
        {allEntries.length > 0 && (
          <button
            className="crypto-mode-btn"
            onClick={onClear}
            style={{ width: 'auto', padding: '4px 12px', fontSize: 12, color: '#ef4444', borderColor: '#fca5a5' }}
          >
            <DeleteOutlined style={{ marginRight: 4 }} />
            清空
          </button>
        )}
      </div>

      <div className="crypto-history-list">
        <AnimatePresence>
          {allEntries.length === 0 ? (
            <motion.div
              key="empty"
              className="crypto-history-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="crypto-history-empty-icon"><HistoryOutlined /></div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>暂无历史记录</div>
              <div style={{ fontSize: 12 }}>使用其他工具时的操作会自动记录在这里</div>
            </motion.div>
          ) : (
            allEntries.map((entry, i) => (
              <motion.div
                key={entry.id}
                className="crypto-history-item"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                onClick={() => onSelect(entry)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelect(entry)}
              >
                <div className="crypto-history-icon">
                  {CRYPTO_TABS.find((t) => t.key === entry.tabKey)?.icon || '📋'}
                </div>
                <div className="crypto-history-body">
                  <div className="crypto-history-title">
                    {TAB_LABELS[entry.tabKey] ?? entry.tabKey} · {entry.action}
                  </div>
                  <div className="crypto-history-preview">
                    {entry.input.length > 60 ? entry.input.slice(0, 60) + '...' : entry.input}
                  </div>
                </div>
                <div className="crypto-history-time">{formatTime(entry.timestamp)}</div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default HistoryPanel;
