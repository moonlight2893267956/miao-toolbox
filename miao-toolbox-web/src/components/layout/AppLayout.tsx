import React, { useEffect, useRef, useState } from 'react';
import { useOutlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Layout } from 'antd';
import Sidebar from './Sidebar';
import TabBar from './TabBar';
import { useTabs, isTabbable, makeTabKey, tabTitleFromPath } from '../../contexts/TabContext';
import { toolsRegistry } from '../../modules/tools/registry';

const { Content } = Layout;

/** 根据当前路由设置 data-active-page，避免 KeepAlive 下 :has() 误匹配隐藏页 */
function resolveActivePage(pathname: string): string {
  if (pathname === '/tools' || pathname === '/tools/') return 'home';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/tools/network')) return 'network';
  return 'tool';
}

const AppLayout: React.FC = () => {
  const location = useLocation();
  const { openTab, updateTab, state } = useTabs();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const [elements, setElements] = useState<Record<string, React.ReactNode>>({});
  const elementsRef = useRef<Record<string, React.ReactNode>>({});

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  /* KeepAlive 缓存：当前路由 outlet 首次出现时存入缓存 */
  useEffect(() => {
    if (outlet && !elementsRef.current[location.pathname]) {
      setElements((prev) => ({
        ...prev,
        [location.pathname]: outlet,
      }));
    }
  }, [outlet, location.pathname]);

  /* 关闭 Tab 时驱逐 KeepAlive 缓存，避免内存泄漏与「关了再开仍是旧状态」 */
  useEffect(() => {
    const openPaths = new Set(state.tabs.map((t) => t.path));
    setElements((prev) => {
      let changed = false;
      const next: Record<string, React.ReactNode> = {};
      for (const [path, el] of Object.entries(prev)) {
        if (openPaths.has(path)) {
          next[path] = el;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [state.tabs]);

  /* 刷新时补齐图标（仅 mount 一次） */
  useEffect(() => {
    state.tabs.forEach((t) => {
      if (!t.icon) {
        const tool = toolsRegistry.find((tool) => tool.path === t.path);
        if (tool) {
          updateTab(t.key, { icon: <tool.icon /> });
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 路由进入可 tab 路径时确保有对应 Tab（地址栏优先，含侧栏/深链/刷新） */
  useEffect(() => {
    const path = location.pathname;
    if (!isTabbable(path)) return;
    const key = makeTabKey(path);
    if (state.tabs.find((t) => t.key === key)) return;
    const tool = toolsRegistry.find((t) => t.path === path);
    openTab({
      key,
      label: tool?.title ?? tabTitleFromPath(path),
      path,
      icon: tool ? <tool.icon /> : undefined,
      closable: true,
    });
  }, [location.pathname, state.tabs, openTab]);

  /* 当标签从「有」变为「无」（关闭最后一个 / 关闭全部）时，返回首页 */
  const prevTabsLenRef = useRef(state.tabs.length);
  const hasHadTabsRef = useRef(false);
  useEffect(() => {
    if (state.tabs.length > 0) hasHadTabsRef.current = true;
  }, [state.tabs]);
  useEffect(() => {
    const prevLen = prevTabsLenRef.current;
    prevTabsLenRef.current = state.tabs.length;
    if (prevLen > 0 && state.tabs.length === 0 && location.pathname !== '/tools') {
      navigate('/tools', { replace: true });
    }
  }, [state.tabs, location.pathname, navigate]);

  const activePage = resolveActivePage(location.pathname);

  return (
    <Layout className="miao-shell" data-active-page={activePage}>
      <Sidebar />
      <Layout style={{ background: 'transparent' }}>
        <TabBar />
        <Content className="miao-content">
          {state.tabs.length === 0 ? (
            /* 没有 Tab：仅渲染一次 outlet，避免双重挂载 */
            hasHadTabsRef.current && isTabbable(location.pathname) ? (
              <Navigate to="/tools" replace />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
                {outlet}
              </div>
            )
          ) : (
            <>
              {Object.entries(elements).map(([path, element]) => {
                const isActive = path === location.pathname;
                return (
                  <div
                    key={path}
                    style={{
                      display: isActive ? 'flex' : 'none',
                      flexDirection: 'column',
                      flex: 1,
                      minHeight: 0,
                      overflow: 'auto',
                    }}
                  >
                    {element}
                  </div>
                );
              })}
              {/* 首次访问：outlet 尚未入缓存时直接渲染（仅在有 Tab 时，避免与空分支双挂载） */}
              {outlet && !elements[location.pathname] && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
                  {outlet}
                </div>
              )}
            </>
          )}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
