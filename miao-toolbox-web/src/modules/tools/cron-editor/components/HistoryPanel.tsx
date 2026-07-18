// Cron 表达式编辑器 — 本地历史记录面板（FR-18 / Story 2.3）
// 按钮 + Modal 浮窗：列出最近使用的表达式（localStorage，最多 50 条，时间倒序），
// 支持点击回填主编辑器、单条删除、一键清空。
import React, { useEffect, useState } from 'react';
import { HistoryOutlined, DeleteOutlined } from '@ant-design/icons';
import { Modal, Popconfirm, Empty, Button } from 'antd';
import dayjs from 'dayjs';
import { useCronContext } from '../useCronContext';
import { humanizeCron } from '../utils/cronHumanizer';
import {
  loadHistory,
  removeHistoryItem,
  clearHistory,
  type CronHistoryItem,
} from '../utils/cronHistory';

const DIALECT_LABEL: Record<CronHistoryItem['dialect'], string> = {
  linux5: '5 位',
  spring6: '6 位',
};

const HistoryPanel: React.FC = () => {
  const { setExpression, setDialect } = useCronContext();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CronHistoryItem[]>([]);

  // Modal 打开时从 localStorage 重新载入，保证反映「自动存入」的最新结果
  useEffect(() => {
    if (open) setItems(loadHistory());
  }, [open]);

  const handlePick = (item: CronHistoryItem) => {
    // 配对回填：表达式与方言同时落位（React 18+ 批处理，最终态一致）
    setExpression(item.expression);
    setDialect(item.dialect);
    setOpen(false);
  };

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setItems(removeHistoryItem(id));
  };

  const handleClear = () => {
    setItems(clearHistory());
  };

  return (
    <>
      <button
        type="button"
        className="ce-action-btn"
        onClick={() => setOpen(true)}
        aria-label="查看历史记录"
        title="查看历史记录"
      >
        <HistoryOutlined /> 历史记录
      </button>

      <Modal
        title={null}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={680}
        destroyOnHidden
        className="ce-history-modal"
        closable
      >
        <div className="ce-history">
          <div className="ce-history-rule" aria-hidden="true" />

          <header className="ce-history-head">
            <div className="ce-history-head-left">
              <span className="ce-history-ornament" aria-hidden="true">
                <HistoryOutlined />
              </span>
              <h3 className="ce-history-title">历史记录</h3>
              <span className="ce-history-sub">LOCAL · 最近使用</span>
            </div>
            <div className="ce-history-head-right">
              {items.length > 0 && (
                <Popconfirm
                  title="清空全部历史记录？"
                  description="此操作不可恢复"
                  okText="清空"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={handleClear}
                >
                  <Button size="small" danger type="text">
                    清空
                  </Button>
                </Popconfirm>
              )}
            </div>
          </header>

          <div className="ce-history-body">
            {items.length === 0 ? (
              <Empty
                className="ce-history-empty"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无历史记录"
              />
            ) : (
              <ul className="ce-history-list" role="list">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="ce-history-item"
                    role="listitem"
                    tabIndex={0}
                    onClick={() => handlePick(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handlePick(item);
                      }
                    }}
                  >
                    <div className="ce-history-item-main">
                      <div className="ce-history-item-top">
                        <code className="ce-history-expr">{item.expression}</code>
                        <span className="ce-history-dialect">{DIALECT_LABEL[item.dialect]}</span>
                      </div>
                      <div className="ce-history-desc">
                        {humanizeCron(item.expression, item.dialect)}
                      </div>
                    </div>
                    <div className="ce-history-item-meta">
                      <span className="ce-history-time">
                        {dayjs(item.ts).format('MM-DD HH:mm')}
                      </span>
                      <button
                        type="button"
                        className="ce-history-del"
                        aria-label="删除该记录"
                        title="删除"
                        onClick={(e) => handleRemove(e, item.id)}
                      >
                        <DeleteOutlined />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="ce-history-foot">
            <span className="ce-history-foot-line" aria-hidden="true" />
            <span className="ce-history-foot-text">
              校验通过的表达式会自动记录，最多保留 50 条
            </span>
            <span className="ce-history-foot-line" aria-hidden="true" />
          </footer>
        </div>
      </Modal>
    </>
  );
};

export default HistoryPanel;
