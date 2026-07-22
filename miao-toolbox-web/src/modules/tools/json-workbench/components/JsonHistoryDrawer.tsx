// JSON 工具台历史记录抽屉
// 通过 React Portal 渲染到 document.body，规避 .miao-content 的 stacking context 遮挡，
// 展示用户提交式操作自动保存的快照，支持一键回滚 / 单条删除 / 清空。

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HistoryOutlined, RollbackOutlined, DeleteOutlined, CloseOutlined, ClearOutlined } from '@ant-design/icons';
import type { JsonSnapshot } from '../utils/jsonWorkbenchHistory';

interface JsonHistoryDrawerProps {
  open: boolean;
  snapshots: JsonSnapshot[];
  onClose: () => void;
  onRestore: (rawJson: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function previewOf(raw: string): string {
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

export default function JsonHistoryDrawer({
  open,
  snapshots,
  onClose,
  onRestore,
  onDelete,
  onClear,
}: JsonHistoryDrawerProps) {
  // 打开时禁止背景滚动
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <div className={`jw-history-root ${open ? 'jw-history-root--open' : ''}`} aria-hidden={!open}>
      <div
        className="jw-history-backdrop"
        onClick={onClose}
        role="presentation"
      />
      <aside className="jw-history-drawer" role="dialog" aria-label="历史记录" aria-modal="true">
        <header className="jw-history-drawer__header">
          <div className="jw-history-drawer__title">
            <HistoryOutlined />
            <span>历史记录</span>
            {snapshots.length > 0 && <span className="jw-history-drawer__count">{snapshots.length}</span>}
          </div>
          <div className="jw-history-drawer__actions">
            {snapshots.length > 0 && (
              <button className="jw-history-clear" onClick={onClear} title="清空全部历史">
                <ClearOutlined />
                <span>清空</span>
              </button>
            )}
            <button className="jw-history-close" onClick={onClose} title="关闭" aria-label="关闭">
              <CloseOutlined />
            </button>
          </div>
        </header>

        <div className="jw-history-drawer__body">
          {snapshots.length === 0 ? (
            <div className="jw-history-empty">
              <HistoryOutlined className="jw-history-empty__icon" />
              <p className="jw-history-empty__title">暂无历史记录</p>
              <p className="jw-history-empty__hint">点击工具栏的「保存」按钮，即可把当前内容保存为一份历史快照</p>
            </div>
          ) : (
            <ul className="jw-history-list">
              {snapshots.map((s) => (
                <li className="jw-history-item" key={s.id}>
                  <div className="jw-history-item__meta">
                    <span className="jw-history-item__label">{s.label}</span>
                    <span className="jw-history-item__time">{formatTime(s.createdAt)}</span>
                    <span className="jw-history-item__chars">{s.charCount} 字符</span>
                  </div>
                  <pre className="jw-history-item__preview">{previewOf(s.rawJson)}</pre>
                  <div className="jw-history-item__ops">
                    <button
                      className="jw-history-restore"
                      onClick={() => onRestore(s.rawJson)}
                      title="恢复到此版本"
                    >
                      <RollbackOutlined />
                      <span>恢复</span>
                    </button>
                    <button
                      className="jw-history-delete"
                      onClick={() => onDelete(s.id)}
                      title="删除此快照"
                    >
                      <DeleteOutlined />
                      <span>删除</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
