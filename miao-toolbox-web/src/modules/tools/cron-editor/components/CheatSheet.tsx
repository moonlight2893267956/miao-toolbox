// Cron 表达式编辑器 — 语法速查表（FR-17 / Story 2.2）
// 编辑级参考手册样式：水平版式（符号栏｜细线分隔｜内容栏），角标序号，字段点列，卡片渐入。
// 仅渲染静态数据，不读取表达式状态、不写回，可独立复用。
import React, { useState } from 'react';
import { BookOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { CRON_CHEAT_SHEET } from '../cheatSheetData';

const TOTAL = CRON_CHEAT_SHEET.length;
const pad = (n: number) => String(n).padStart(2, '0');

const CheatSheet: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="ce-action-btn"
        onClick={() => setOpen(true)}
        aria-label="查看 Cron 语法速查表"
        title="查看 Cron 语法速查表"
      >
        <BookOutlined /> 语法速查
      </button>

      <Modal
        title={null}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={760}
        destroyOnHidden
        className="ce-cheat-modal"
        closable
      >
        <div className="ce-cheat">
          {/* 顶部细线（teal 渐隐收尾） */}
          <div className="ce-cheat-rule" aria-hidden="true" />

          <header className="ce-cheat-head">
            <div className="ce-cheat-head-left">
              <span className="ce-cheat-ornament" aria-hidden="true">
                <svg viewBox="0 0 12 12" width="12" height="12">
                  <path
                    d="M6 0 L7.2 4.8 L12 6 L7.2 7.2 L6 12 L4.8 7.2 L0 6 L4.8 4.8 Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <h3 className="ce-cheat-title">语法速查表</h3>
              <span className="ce-cheat-sub">CRON · SPECIAL CHARACTERS</span>
            </div>
            <div className="ce-cheat-head-right">
              <span className="ce-cheat-count">
                <span className="ce-cheat-count-num">{pad(TOTAL)}</span>
                <span className="ce-cheat-count-label">个特殊字符</span>
              </span>
            </div>
          </header>

          <div className="ce-cheat-body">
            <div className="ce-cheat-grid" role="list">
              {CRON_CHEAT_SHEET.map((entry, idx) => (
                <article
                  key={entry.symbol}
                  className="ce-cheat-card"
                  role="listitem"
                  style={{ animationDelay: `${idx * 45}ms` }}
                >
                  <div className="ce-cheat-rail">
                    <div className="ce-cheat-symbol" aria-hidden="true">
                      {entry.symbol}
                    </div>
                    <div className="ce-cheat-ordinal">
                      {pad(idx + 1)}
                      <span className="ce-cheat-ordinal-sep">/</span>
                      {pad(TOTAL)}
                    </div>
                  </div>
                  <div className="ce-cheat-divider" aria-hidden="true" />
                  <div className="ce-cheat-main">
                    <p className="ce-cheat-meaning">{entry.meaning}</p>
                    <div className="ce-cheat-specimen">
                      <span className="ce-cheat-specimen-mark" aria-hidden="true">
                        cron
                      </span>
                      <code className="ce-cheat-example">{entry.example}</code>
                      <span className="ce-cheat-example-desc">
                        — {entry.exampleDesc}
                      </span>
                    </div>
                    <div className="ce-cheat-fields">
                      <span className="ce-cheat-fields-label">适用字段</span>
                      <span className="ce-cheat-fields-list">
                        {entry.applicableFields.map((f, i) => (
                          <React.Fragment key={f}>
                            {i > 0 && (
                              <span className="ce-cheat-fields-sep" aria-hidden="true">
                                ·
                              </span>
                            )}
                            <span className="ce-cheat-field">{f}</span>
                          </React.Fragment>
                        ))}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <footer className="ce-cheat-foot">
            <span className="ce-cheat-foot-line" aria-hidden="true" />
            <span className="ce-cheat-foot-text">
              提示：可与上方表达式输入框对照查阅
            </span>
            <span className="ce-cheat-foot-line" aria-hidden="true" />
          </footer>
        </div>
      </Modal>
    </>
  );
};

export default CheatSheet;
