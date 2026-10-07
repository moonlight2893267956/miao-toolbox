/**
 * 规则速查卡 — 抽屉浮层
 *
 * 以 Drawer 形式呈现，不打断当前练习。
 * 支持关键字搜索，表内汉字/字根可点击 → 唤起拆字演示。
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  CHEAT_SHEET_SECTIONS,
  searchCheatSheet,
  type CheatSheetItem,
} from '../data/cheatSheet';

interface CheatSheetDrawerProps {
  open: boolean;
  onClose: () => void;
  onCharClick: (char: string) => void;
}

const CheatSheetDrawer: React.FC<CheatSheetDrawerProps> = ({
  open,
  onClose,
  onCharClick,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const searchResults = useMemo(() => {
    return searchQuery ? searchCheatSheet(searchQuery) : [];
  }, [searchQuery]);

  const handleItemClick = useCallback(
    (item: CheatSheetItem) => {
      if (item.clickable) {
        onCharClick(item.clickable);
      }
    },
    [onCharClick],
  );

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div className="wt-cheat-sheet__overlay" onClick={onClose} />

      {/* 抽屉 */}
      <div className="wt-cheat-sheet__drawer">
        <div className="wt-cheat-sheet__header">
          <h3>规则速查卡</h3>
          <button className="wt-cheat-sheet__close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* 搜索框 */}
        <div className="wt-cheat-sheet__search">
          <input
            type="text"
            className="wt-cheat-sheet__search-input"
            placeholder="搜索偏旁、汉字、规则…（如输入「衤」）"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="wt-cheat-sheet__search-clear"
              onClick={() => setSearchQuery('')}
            >
              清除
            </button>
          )}
        </div>

        {/* 内容区 */}
        <div className="wt-cheat-sheet__body">
          {searchQuery ? (
            // 搜索结果
            <div className="wt-cheat-sheet__search-results">
              <p className="wt-cheat-sheet__search-count">
                找到 {searchResults.length} 条结果
              </p>
              {searchResults.length === 0 ? (
                <p className="wt-cheat-sheet__no-results">未找到匹配内容</p>
              ) : (
                <ul className="wt-cheat-sheet__list">
                  {searchResults.map((item, idx) => (
                    <li
                      key={idx}
                      className={`wt-cheat-sheet__item${
                        item.clickable ? ' wt-cheat-sheet__item--clickable' : ''
                      }`}
                      onClick={() => handleItemClick(item)}
                    >
                      {item.clickable && (
                        <span className="wt-cheat-sheet__item-glyph">
                          {item.clickable}
                        </span>
                      )}
                      <span className="wt-cheat-sheet__item-desc">
                        {item.description}
                      </span>
                      {item.key && (
                        <span className="wt-cheat-sheet__item-key">
                          {item.key.toUpperCase()}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            // 全部分类展示
            CHEAT_SHEET_SECTIONS.map((section) => (
              <div key={section.id} className="wt-cheat-sheet__section">
                <h4 className="wt-cheat-sheet__section-title">{section.title}</h4>
                <ul className="wt-cheat-sheet__list">
                  {section.items.map((item, idx) => (
                    <li
                      key={idx}
                      className={`wt-cheat-sheet__item${
                        item.clickable ? ' wt-cheat-sheet__item--clickable' : ''
                      }`}
                      onClick={() => handleItemClick(item)}
                    >
                      {item.clickable && (
                        <span className="wt-cheat-sheet__item-glyph">
                          {item.clickable}
                        </span>
                      )}
                      <span className="wt-cheat-sheet__item-desc">
                        {item.description}
                      </span>
                      {item.key && (
                        <span className="wt-cheat-sheet__item-key">
                          {item.key.toUpperCase()}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default CheatSheetDrawer;
