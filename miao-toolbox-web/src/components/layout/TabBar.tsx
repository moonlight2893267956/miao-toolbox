/** @jsxImportSource react */
import React, { useRef, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CloseOutlined, PushpinOutlined, EllipsisOutlined } from '@ant-design/icons';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useTabs, isTabbable } from '../../contexts/TabContext';
import type { TabItem } from '../../contexts/TabContext';
import './tabbar.css';

const TabBar: React.FC = () => {
  const { state, closeTab, switchTab, pinTab, closeOtherTabs, closeRightTabs, closeLeftTabs, closeAllTabs } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [offscreenTabs, setOffscreenTabs] = useState<TabItem[]>([]);
  const tabElsRef = useRef<Map<string, HTMLDivElement>>(new Map());

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

  /** 计算当前滚动视口外（左/右侧被隐藏）的 tab 列表 */
  const updateOffscreen = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || state.tabs.length === 0) {
      setOffscreenTabs([]);
      return;
    }
    const left = scrollEl.scrollLeft;
    const right = left + scrollEl.clientWidth;
    const offscreen: TabItem[] = [];
    for (const tab of state.tabs) {
      const el = tabElsRef.current.get(tab.key);
      if (!el) continue;
      const elLeft = el.offsetLeft;
      const elRight = elLeft + el.offsetWidth;
      // 允许 1px 浮点容差
      if (elRight > right + 1 || elLeft < left - 1) {
        offscreen.push(tab);
      }
    }
    setOffscreenTabs(offscreen);
  }, [state.tabs]);

  // 滚动容器尺寸变化 → 重新测量视口外 tab
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateOffscreen());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateOffscreen]);

  // 滚动时实时更新 offscreen
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => updateOffscreen();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [updateOffscreen]);

  // tab 集合/尺寸变化时重新计算视口外 tab
  useLayoutEffect(() => {
    updateOffscreen();
  }, [updateOffscreen]);

  // 激活 tab 变化（含刷新后恢复）时，若不在可视区则平滑滚动入视
  useEffect(() => {
    const scrollEl = scrollRef.current;
    const activeEl = state.activeKey ? tabElsRef.current.get(state.activeKey) : undefined;
    if (!scrollEl || !activeEl) return;
    const scrollLeft = scrollEl.scrollLeft;
    const containerWidth = scrollEl.clientWidth;
    const elLeft = activeEl.offsetLeft;
    const elRight = elLeft + activeEl.offsetWidth;
    const padding = 8;
    if (elLeft < scrollLeft) {
      scrollEl.scrollTo({ left: Math.max(0, elLeft - padding), behavior: 'smooth' });
    } else if (elRight > scrollLeft + containerWidth) {
      scrollEl.scrollTo({ left: elRight - containerWidth + padding, behavior: 'smooth' });
    }
  }, [state.activeKey]);

  // 「更多」下拉：只列当前视口外（被滚动隐藏）的 tab
  const moreMenuItems: MenuProps['items'] = offscreenTabs.map((tab) => ({
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
          {state.tabs.map((tab) => {
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
                  ref={(node) => {
                    if (node) tabElsRef.current.set(tab.key, node);
                    else tabElsRef.current.delete(tab.key);
                  }}
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

        {offscreenTabs.length > 0 && (
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
                (offscreenTabs.some((t) => t.key === state.activeKey) ? ' is-active-hidden' : '')
              }
              type="button"
              aria-label="更多标签"
            >
              <EllipsisOutlined />
              <span className="miao-tabbar-more-count">{offscreenTabs.length}</span>
            </button>
          </Dropdown>
        )}
      </div>
    </div>
  );
};

export default TabBar;
