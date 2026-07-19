/** @jsxImportSource react */
import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CloseOutlined, PushpinOutlined, EllipsisOutlined } from '@ant-design/icons';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useTabs, isTabbable } from '../../contexts/TabContext';
import './tabbar.css';

/** Tab 栏最多展示的 tab 数量，超出部分收入「更多」下拉（顺序与 state.tabs 一致，不做视觉交换） */
const MAX_VISIBLE_TABS = 7;

const TabBar: React.FC = () => {
  const { state, closeTab, switchTab, pinTab, closeOtherTabs, closeRightTabs, closeLeftTabs, closeAllTabs } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const onClose = useCallback(
    (e: React.MouseEvent, key: string) => {
      e.stopPropagation();
      e.preventDefault();
      const closing = state.tabs.find((t) => t.key === key);
      // 先算出关闭后的回退路径，避免 URL 仍停在已关页签上被 AppLayout 重新 openTab
      let fallbackPath: string | null = null;
      if (closing && (state.activeKey === key || location.pathname === closing.path)) {
        const remaining = state.tabs.filter((t) => t.key !== key);
        // 与 reducer 一致：优先 history 中仍存在的 key
        for (let i = state.history.length - 1; i >= 0; i--) {
          const h = state.history[i];
          if (h !== key && remaining.some((t) => t.key === h)) {
            fallbackPath = remaining.find((t) => t.key === h)!.path;
            break;
          }
        }
        if (!fallbackPath) {
          fallbackPath = remaining[remaining.length - 1]?.path ?? '/tools';
        }
      }
      closeTab(key);
      if (fallbackPath != null && fallbackPath !== location.pathname) {
        navigate(fallbackPath, { replace: true });
      } else if (fallbackPath === '/tools' && location.pathname !== '/tools') {
        navigate('/tools', { replace: true });
      }
    },
    [closeTab, state.tabs, state.activeKey, state.history, location.pathname, navigate],
  );

  const onClick = useCallback(
    (key: string, path: string) => {
      if (state.activeKey === key) return;
      switchTab(key);
      navigate(path);
    },
    [state.activeKey, switchTab, navigate],
  );

  const onWheel = useCallback((e: React.WheelEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    el.scrollBy({ left: e.deltaY, behavior: 'smooth' });
  }, []);

  /** 构建右键菜单项（antd v6 使用 items API，避免旧版 Menu.Item 崩溃白屏） */
  const buildMenuItems = useCallback(
    (key: string): MenuProps['items'] => {
      const idx = state.tabs.findIndex((t) => t.key === key);
      const tab = state.tabs[idx];
      const total = state.tabs.length;
      const pinned = tab?.pinned;
      const canClose = !!tab?.closable && !tab?.pinned;
      return [
        { key: 'close', label: '关闭标签', disabled: !canClose },
        { key: 'close-other', label: '关闭其他标签', disabled: total <= 1 },
        { key: 'close-right', label: '关闭右侧标签', disabled: idx >= total - 1 },
        { key: 'close-left', label: '关闭左侧标签', disabled: idx <= 0 },
        { key: 'close-all', label: '关闭全部标签' },
        { type: 'divider' },
        {
          key: 'pin',
          label: pinned ? '取消固定' : '固定标签页',
          icon: <PushpinOutlined />,
        },
      ];
    },
    [state.tabs],
  );

  const handleMenuClick = useCallback(
    (menuKey: string, tabKey: string) => {
      switch (menuKey) {
        case 'close':
          closeTab(tabKey);
          break;
        case 'close-other':
          closeOtherTabs(tabKey);
          break;
        case 'close-right':
          closeRightTabs(tabKey);
          break;
        case 'close-left':
          closeLeftTabs(tabKey);
          break;
        case 'close-all':
          closeAllTabs();
          break;
        case 'pin': {
          const tab = state.tabs.find((t) => t.key === tabKey);
          pinTab(tabKey, !tab?.pinned);
          break;
        }
      }
    },
    [closeTab, closeOtherTabs, closeRightTabs, closeLeftTabs, closeAllTabs, pinTab, state.tabs],
  );

  // 地址栏优先：路由变化时同步激活 Tab；在非 tab 路径（如工作台）仅取消高亮
  useEffect(() => {
    const currentTab = state.tabs.find((t) => t.path === location.pathname);
    if (currentTab) {
      if (currentTab.key !== state.activeKey) switchTab(currentTab.key);
    } else if (state.activeKey && !isTabbable(location.pathname)) {
      switchTab('');
    }
  }, [location.pathname, state.tabs, state.activeKey, switchTab]);

  // 仅当「当前 URL 对应的 Tab 刚被关掉」时，才 navigate 到新的 activeTab。
  // 切勿在「用户导航到尚未建 Tab 的新路径」时回跳旧 Tab（否则会劫持 page.goto / 侧栏跳转）。
  const prevTabPathsRef = useRef<Set<string>>(new Set(state.tabs.map((t) => t.path)));
  useEffect(() => {
    const nextPaths = new Set(state.tabs.map((t) => t.path));
    const path = location.pathname;
    const wasOpen = prevTabPathsRef.current.has(path);
    const stillOpen = nextPaths.has(path);
    prevTabPathsRef.current = nextPaths;

    if (!isTabbable(path)) return;
    // 仅：该 path 之前在 tabs 里、现在没了 → 视为关闭导致
    if (!(wasOpen && !stillOpen)) return;

    const activeTab = state.tabs.find((t) => t.key === state.activeKey);
    if (activeTab && path !== activeTab.path) {
      navigate(activeTab.path, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeKey, state.tabs, location.pathname]);

  /* 可见 / 隐藏分割：若激活 tab 在隐藏区，将其与可见区末尾交换，确保当前 tab 始终可见 */
  const { visibleTabs, hiddenTabs } = useMemo(() => {
    const all = state.tabs;
    if (all.length <= MAX_VISIBLE_TABS) {
      return { visibleTabs: all, hiddenTabs: [] as typeof all };
    }
    const activeIdx = all.findIndex((t) => t.key === state.activeKey);
    // 激活 tab 在隐藏区（≥ MAX_VISIBLE_TABS），与可见区末尾交换
    if (activeIdx >= MAX_VISIBLE_TABS) {
      const arr = [...all];
      const lastVisibleIdx = MAX_VISIBLE_TABS - 1;
      [arr[lastVisibleIdx], arr[activeIdx]] = [arr[activeIdx], arr[lastVisibleIdx]];
      return {
        visibleTabs: arr.slice(0, MAX_VISIBLE_TABS),
        hiddenTabs: arr.slice(MAX_VISIBLE_TABS),
      };
    }
    return {
      visibleTabs: all.slice(0, MAX_VISIBLE_TABS),
      hiddenTabs: all.slice(MAX_VISIBLE_TABS),
    };
  }, [state.tabs, state.activeKey]);

  // 「更多」下拉：隐藏 tab + 关闭按钮（可关时）
  const moreMenuItems: MenuProps['items'] = hiddenTabs.map((tab) => ({
    key: tab.key,
    className: tab.key === state.activeKey ? 'is-active-item' : undefined,
    label: (
      <div className="miao-tabbar-more-row">
        <span className="miao-tabbar-more-label">
          {tab.icon && <span className="miao-tab-icon">{tab.icon}</span>}
          {tab.label}
          {tab.pinned && <PushpinOutlined className="miao-tabbar-more-pin" />}
        </span>
        {tab.closable && !tab.pinned && (
          <button
            type="button"
            className="miao-tabbar-more-close"
            aria-label={`关闭 ${tab.label}`}
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.key);
            }}
          >
            <CloseOutlined />
          </button>
        )}
      </div>
    ),
  }));

  const handleMoreClick = useCallback(
    (info: { key: string }) => {
      const tab = state.tabs.find((t) => t.key === info.key);
      if (tab) {
        onClick(tab.key, tab.path);
      }
      setMoreOpen(false);
    },
    [state.tabs, onClick],
  );

  if (state.tabs.length === 0) return null;

  return (
    <div className="miao-tabbar-shell">
      <div className="miao-tabbar" role="tablist">
        <div className="miao-tabbar-scroll" ref={scrollRef} onWheel={onWheel}>
          {visibleTabs.map((tab) => {
            const isActive = tab.key === state.activeKey;
            const canClose = tab.closable && !tab.pinned;

            return (
              <Dropdown
                key={tab.key}
                trigger={['contextMenu']}
                menu={{
                  items: buildMenuItems(tab.key),
                  onClick: ({ key: menuKey }) => handleMenuClick(menuKey, tab.key),
                }}
                overlayClassName="miao-tabbar-dropdown"
              >
                <div
                  data-tab-key={tab.key}
                  className={
                    'miao-tab' +
                    (isActive ? ' is-active' : '') +
                    (tab.pinned ? ' is-pinned' : '')
                  }
                  onClick={() => onClick(tab.key, tab.path)}
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onClick(tab.key, tab.path);
                    }
                    if (e.key === 'Delete' && canClose) {
                      closeTab(tab.key);
                    }
                  }}
                >
                  {tab.icon && <span className="miao-tab-icon">{tab.icon}</span>}
                  <span className="miao-tab-label">{tab.label}</span>
                  {tab.pinned && (
                    <span className="miao-tab-pin">
                      <PushpinOutlined />
                    </span>
                  )}
                  {canClose && (
                    <button
                      className="miao-tab-close"
                      onClick={(e) => onClose(e, tab.key)}
                      title="关闭标签"
                      aria-label="关闭标签"
                      type="button"
                    >
                      <CloseOutlined />
                    </button>
                  )}
                </div>
              </Dropdown>
            );
          })}
        </div>

        {hiddenTabs.length > 0 && (
          <Dropdown
            menu={{ items: moreMenuItems, onClick: handleMoreClick }}
            trigger={['click']}
            open={moreOpen}
            onOpenChange={setMoreOpen}
            overlayClassName="miao-tabbar-more-dropdown"
          >
            <button
              className={
                'miao-tabbar-more' +
                (hiddenTabs.some((t) => t.key === state.activeKey) ? ' is-active-hidden' : '')
              }
              type="button"
              aria-label="更多标签"
            >
              <EllipsisOutlined />
              <span className="miao-tabbar-more-count">{hiddenTabs.length}</span>
            </button>
          </Dropdown>
        )}
      </div>
    </div>
  );
};

export default TabBar;
