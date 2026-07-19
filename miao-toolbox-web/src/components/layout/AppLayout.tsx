import React, { useEffect, useRef, useState } from 'react';
import { useOutlet, useLocation } from 'react-router-dom';
import { Layout } from 'antd';
import Sidebar from './Sidebar';
import TabBar from './TabBar';
import { useTabs, isTabbable, makeTabKey, tabTitleFromPath } from '../../contexts/TabContext';
import { toolsRegistry } from '../../modules/tools/registry';

const { Content } = Layout;

const AppLayout: React.FC = () => {
  const location = useLocation();
  const { openTab, state } = useTabs();
  const outlet = useOutlet();
  const [elements, setElements] = useState<Record<string, React.ReactNode>>({});
  const elementsRef = useRef<Record<string, React.ReactNode>>({});

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  /* KeepAlive 缓存：当前路由 outlet 首次出现时存入缓存，
     后续切回同一 Tab 时复用缓存元素，不再重新挂载，保留页面状态 */
  useEffect(() => {
    if (outlet && !elementsRef.current[location.pathname]) {
      setElements((prev) => ({
        ...prev,
        [location.pathname]: outlet,
      }));
    }
  }, [outlet, location.pathname]);

  /* 页面刷新时自动为当前路由恢复 Tab */
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout className="miao-shell">
      <Sidebar />
      <Layout style={{ background: 'transparent' }}>
        <TabBar />
        <Content className="miao-content">
          {/* KeepAlive：缓存所有已渲染页面，只显示当前激活的，其余 display:none 保留状态 */}
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
                  overflow: 'hidden',
                }}
              >
                {element}
              </div>
            );
          })}
          {/* 首次访问时 outlet 尚未被缓存，直接渲染 */}
          {outlet && !elements[location.pathname] && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {outlet}
            </div>
          )}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
