/** @jsxImportSource react */
import React, { useRef, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CloseOutlined, PushpinOutlined } from '@ant-design/icons';
import { Dropdown, Menu } from 'antd';
import { useTabs } from '../../contexts/TabContext';
import './tabbar.css';

const TabBar: React.FC = () => {
  const { state, closeTab, switchTab, pinTab, closeOtherTabs, closeRightTabs } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const onClose = useCallback(
    (e: React.MouseEvent, key: string) => {
      e.stopPropagation();
      closeTab(key);
    },
    [closeTab],
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

  const handleContextMenu = useCallback(
    (key: string) => {
      return (
        <Menu>
          <Menu.Item key="close" onClick={() => closeTab(key)}>
            关闭标签
          </Menu.Item>
          <Menu.Item key="close-other" onClick={() => closeOtherTabs(key)}>
            关闭其他标签
          </Menu.Item>
          <Menu.Item key="close-right" onClick={() => closeRightTabs(key)}>
            关闭右侧标签
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            key="pin"
            onClick={() => {
              const tab = state.tabs.find((t) => t.key === key);
              pinTab(key, !tab?.pinned);
            }}
          >
            {state.tabs.find((t) => t.key === key)?.pinned ? '取消固定' : '固定标签'}
          </Menu.Item>
        </Menu>
      );
    },
    [closeTab, closeOtherTabs, closeRightTabs, pinTab, state.tabs],
  );

  // 当路由变化（通过回退/前进等）时同步激活 Tab
  useEffect(() => {
    const currentTab = state.tabs.find((t) => t.path === location.pathname);
    if (currentTab && currentTab.key !== state.activeKey) {
      switchTab(currentTab.key);
    }
  }, [location.pathname, state.tabs, state.activeKey, switchTab]);

  // 关闭 Tab 后自动导航到新的 activeTab
  useEffect(() => {
    const activeTab = state.tabs.find((t) => t.key === state.activeKey);
    if (activeTab && location.pathname !== activeTab.path) {
      navigate(activeTab.path, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeKey, state.tabs]);

  if (state.tabs.length === 0) return null;

  return (
    <div className="miao-tabbar">
      <div className="miao-tabbar-scroll" ref={scrollRef} onWheel={onWheel}>
        {state.tabs.map((tab) => {
          const isActive = tab.key === state.activeKey;

          return (
            <Dropdown
              key={tab.key}
              overlay={handleContextMenu(tab.key)}
              trigger={['contextMenu']}
              overlayClassName="miao-tabbar-dropdown"
            >
              <div
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
                  if (e.key === 'Delete' && tab.closable) {
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
                {tab.closable && (
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
    </div>
  );
};

export default TabBar;
