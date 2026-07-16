import React from 'react';
import { HistoryOutlined, DeleteOutlined, ClearOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import type { HistoryEntry } from '../hooks/useHistory';
import { useRegexContext } from '../useRegexContext';

/**
 * 匹配历史 Modal（FR-10）：
 * - localStorage 保存最近使用的正则+测试文本组合
 * - 点击回填，支持删除与清空
 */
const HistoryPanel: React.FC<{
  entries: HistoryEntry[];
  onRemove: (idx: number) => void;
  onClear: () => void;
  onClose: () => void;
}> = ({ entries, onRemove, onClear, onClose }) => {
  const { setPattern, setFlags, setTestText, state } = useRegexContext();

  const handleLoad = (entry: HistoryEntry) => {
    setPattern(entry.pattern);
    setFlags(entry.flags);
    setTestText(entry.testText);
    onClose();
  };

  return (
    <Modal
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <HistoryOutlined /> 匹配历史
        </span>
      }
      open={state.showHistory}
      onCancel={onClose}
      footer={
        entries.length > 0 ? (
          <button
            type="button"
            className="rt-history-modal-clear"
            onClick={onClear}
          >
            <ClearOutlined /> 清空全部
          </button>
        ) : null
      }
      width={560}
      destroyOnHidden
      className="rt-history-modal"
      closable
    >
      {entries.length === 0 ? (
        <div className="rt-history-empty">暂无历史记录</div>
      ) : (
        <ul className="rt-history-list">
          {entries.map((entry, i) => (
            <li key={entry.ts} className="rt-history-item">
              <button
                type="button"
                className="rt-history-item-main"
                onClick={() => handleLoad(entry)}
              >
                <code className="rt-history-pattern">/{entry.pattern}/{entry.flags}</code>
                <span className="rt-history-text">{entry.testText.slice(0, 60)}{entry.testText.length > 60 ? '…' : ''}</span>
                <span className="rt-history-time">{new Date(entry.ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </button>
              <button
                type="button"
                className="rt-history-item-del"
                onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                title="删除"
              >
                <DeleteOutlined />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

export default HistoryPanel;
