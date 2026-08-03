/** @jsxImportSource react */
import React, { useRef, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CloseOutlined, PushpinOutlined, EllipsisOutlined } from '@ant-design/icons';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'framer-motion';
import { useTabs, isTabbable } from '../../contexts/TabContext';
import type { TabItem } from '../../contexts/TabContext';
import './tabbar.css';

/* ─── 可排序的单个 Tab ─── */
interface SortableTabProps {
  tab: TabItem;
  isActive: boolean;
  canClose: boolean;
  onClick: (key: string, path: string) => void;
  onClose: (e: React.MouseEvent, key: string) => void;
  buildMenuItems: (key: string) => MenuProps['items'];
  handleMenuClick: (menuKey: string, tabKey: string) => void;
  tabElsRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

const SortableTab: React.FC<SortableTabProps> = ({
  tab,
  isActive,
  canClose,
  onClick,
  onClose,
  buildMenuItems,
  handleMenuClick,
  tabElsRef,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tab.key,
    strategy: horizontalListSortingStrategy,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <Dropdown
      trigger={['contextMenu']}
      menu={{
        items: buildMenuItems(tab.key),
        onClick: ({ key: menuKey }) => handleMenuClick(menuKey, tab.key),
      }}
      overlayClassName="miao-tabbar-dropdown"
    >
      <div
        ref={(node) => {
          setNodeRef(node);
          if (node) tabElsRef.current.set(tab.key, node);
          else tabElsRef.current.delete(tab.key);
        }}
        data-tab-key={tab.key}
        className={
          'miao-tab' +
          (isActive ? ' is-active' : '') +
          (tab.pinned ? ' is-pinned' : '') +
          (isDragging ? ' is-dragging' : '')
        }
        style={style}
        onClick={() => onClick(tab.key, tab.path)}
        aria-selected={isActive}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(tab.key, tab.path);
          }
          if (e.key === 'Delete' && canClose) {
            onClose(e as unknown as React.MouseEvent, tab.key);
          }
        }}
        {...attributes}
        {...listeners}
        role="tab"
        tabIndex={0}
      >
        {/* 拖拽手柄区域：icon + label 可拖拽，close 按钮不触发拖拽 */}
        <span className="miao-tab-drag-handle" ref={setActivatorNodeRef}>
          {tab.icon && <span className="miao-tab-icon">{tab.icon}</span>}
          <span className="miao-tab-label">{tab.label}</span>
        </span>
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
};

/* ─── DragOverlay 中渲染的「浮动 Tab」─── */
interface DragOverlayTabProps {
  tab: TabItem;
  isActive: boolean;
}

const DragOverlayTab: React.FC<DragOverlayTabProps> = ({ tab, isActive }) => (
  <div
    className={
      'miao-tab miao-tab-drag-overlay' +
      (isActive ? ' is-active' : '') +
      (tab.pinned ? ' is-pinned' : '')
    }
  >
    {tab.icon && <span className="miao-tab-icon">{tab.icon}</span>}
    <span className="miao-tab-label">{tab.label}</span>
    {tab.pinned && (
      <span className="miao-tab-pin">
        <PushpinOutlined />
      </span>
    )}
  </div>
);

/* ─── 主 TabBar 组件 ─── */
const TabBar: React.FC = () => {
  const { state, closeTab, switchTab, pinTab, closeOtherTabs, closeRightTabs, closeLeftTabs, closeAllTabs, reorderTabs } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [offscreenTabs, setOffscreenTabs] = useState<TabItem[]>([]);
  const tabElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const indicatorRef = useRef<HTMLSpanElement>(null);

  // dnd-kit 状态
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTab = activeId ? state.tabs.find((t) => t.key === activeId) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onClose = useCallback(
    (e: React.MouseEvent, key: string) => {
      e.stopPropagation();
      e.preventDefault();
      const closing = state.tabs.find((t) => t.key === key);
      let fallbackPath: string | null = null;
      if (closing && (state.activeKey === key || location.pathname === closing.path)) {
        const remaining = state.tabs.filter((t) => t.key !== key);
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

  // 地址栏优先：路由变化时同步激活 Tab
  useEffect(() => {
    const currentTab = state.tabs.find((t) => t.path === location.pathname);
    if (currentTab) {
      if (currentTab.key !== state.activeKey) switchTab(currentTab.key);
    } else if (state.activeKey && !isTabbable(location.pathname)) {
      switchTab('');
    }
  }, [location.pathname, state.tabs, state.activeKey, switchTab]);

  const prevTabPathsRef = useRef<Set<string>>(new Set(state.tabs.map((t) => t.path)));
  useEffect(() => {
    const nextPaths = new Set(state.tabs.map((t) => t.path));
    const path = location.pathname;
    const wasOpen = prevTabPathsRef.current.has(path);
    const stillOpen = nextPaths.has(path);
    prevTabPathsRef.current = nextPaths;

    if (!isTabbable(path)) return;
    if (!(wasOpen && !stillOpen)) return;

    const activeTab = state.tabs.find((t) => t.key === state.activeKey);
    if (activeTab && path !== activeTab.path) {
      navigate(activeTab.path, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeKey, state.tabs, location.pathname]);

  const getOffsetLeft = useCallback((el: HTMLElement, container: HTMLElement): number => {
    let left = 0;
    let node: HTMLElement | null = el;
    while (node && node !== container) {
      left += node.offsetLeft;
      node = node.offsetParent as HTMLElement | null;
    }
    return left;
  }, []);

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
      const elLeft = getOffsetLeft(el, scrollEl);
      const elRight = elLeft + el.offsetWidth;
      if (elRight > right + 1 || elLeft < left - 1) {
        offscreen.push(tab);
      }
    }
    setOffscreenTabs(offscreen);
  }, [state.tabs, getOffsetLeft]);

  const updateIndicator = useCallback(() => {
    const el = indicatorRef.current;
    const activeEl = state.activeKey ? tabElsRef.current.get(state.activeKey) : undefined;
    const scrollEl = scrollRef.current;
    if (!el || !activeEl || !scrollEl) {
      if (el) el.style.opacity = '0';
      return;
    }
    const left = getOffsetLeft(activeEl, scrollEl);
    const width = activeEl.offsetWidth;
    el.style.left = `${left}px`;
    el.style.width = `${width}px`;
    el.style.opacity = '1';
  }, [state.activeKey, getOffsetLeft]);

  // 保持最新引用，供 AnimatePresence onExitComplete 使用
  const updateIndicatorRef = useRef(updateIndicator);
  const updateOffscreenRef = useRef(updateOffscreen);
  updateIndicatorRef.current = updateIndicator;
  updateOffscreenRef.current = updateOffscreen;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      updateOffscreen();
      updateIndicator();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateOffscreen, updateIndicator]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => updateOffscreen();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [updateOffscreen]);

  useLayoutEffect(() => {
    updateOffscreen();
    updateIndicator();
  }, [updateOffscreen, updateIndicator]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const activeEl = state.activeKey ? tabElsRef.current.get(state.activeKey) : undefined;
    if (!scrollEl || !activeEl) return;
    const scrollLeft = scrollEl.scrollLeft;
    const containerWidth = scrollEl.clientWidth;
    const elLeft = getOffsetLeft(activeEl, scrollEl);
    const elRight = elLeft + activeEl.offsetWidth;
    const padding = 8;
    if (elLeft < scrollLeft) {
      scrollEl.scrollTo({ left: Math.max(0, elLeft - padding), behavior: 'smooth' });
    } else if (elRight > scrollLeft + containerWidth) {
      scrollEl.scrollTo({ left: elRight - containerWidth + padding, behavior: 'smooth' });
    }
  }, [state.activeKey, getOffsetLeft]);

  // dnd-kit 事件处理
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const fromIndex = state.tabs.findIndex((t) => t.key === active.id);
      const toIndex = state.tabs.findIndex((t) => t.key === over.id);
      if (fromIndex === -1 || toIndex === -1) return;

      // 分区约束：pinned 只能在 pinned 区内排序，非 pinned 只能在非 pinned 区内排序
      const fromTab = state.tabs[fromIndex];
      const toTab = state.tabs[toIndex];
      if (fromTab.pinned !== toTab.pinned) return;

      reorderTabs(fromIndex, toIndex);
    },
    [state.tabs, reorderTabs],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

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

  const tabKeys = state.tabs.map((t) => t.key);

  return (
    <div className="miao-tabbar-shell">
      <div className="miao-tabbar" role="tablist">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={tabKeys} strategy={horizontalListSortingStrategy}>
            <div className="miao-tabbar-scroll" ref={scrollRef} onWheel={onWheel}>
              <AnimatePresence
                initial={false}
                onExitComplete={() => {
                  // 退出动画结束后 tab 真正移除，剩余 tab 位移，需重新计算指示条位置
                  requestAnimationFrame(() => {
                    updateIndicatorRef.current();
                    updateOffscreenRef.current();
                  });
                }}
              >
                {state.tabs.map((tab) => {
                  const isActive = tab.key === state.activeKey;
                  const canClose = tab.closable && !tab.pinned;

                  return (
                    <motion.div
                      key={tab.key}
                      layout
                      initial={false}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{
                        layout: { type: 'spring', stiffness: 350, damping: 30 },
                        opacity: { duration: 0.15 },
                        scale: { duration: 0.15 },
                      }}
                      className="miao-tab-motion-wrapper"
                    >
                      <SortableTab
                        tab={tab}
                        isActive={isActive}
                        canClose={canClose}
                        onClick={onClick}
                        onClose={onClose}
                        buildMenuItems={buildMenuItems}
                        handleMenuClick={handleMenuClick}
                        tabElsRef={tabElsRef}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {/* 滑动指示条 */}
              <span ref={indicatorRef} className="miao-tab-indicator" />
            </div>
          </SortableContext>

          {/* DragOverlay：拖拽时浮在原位上方的「幽灵 Tab」 */}
          <DragOverlay dropAnimation={{
            duration: 250,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          }}>
            {activeId && activeTab ? (
              <DragOverlayTab tab={activeTab} isActive={activeTab.key === state.activeKey} />
            ) : null}
          </DragOverlay>
        </DndContext>

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
