import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Layout } from 'antd';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import useReducedMotion from '../../hooks/useReducedMotion';

const { Content } = Layout;

const AppLayout: React.FC = () => {
  const location = useLocation();
  const reducedMotion = useReducedMotion();

  const yShift = reducedMotion ? 0 : 6;
  const duration = reducedMotion ? 0 : 0.22;

  return (
    <Layout className="miao-shell">
      <Sidebar />
      <Layout style={{ background: 'transparent' }}>
        <Content className="miao-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: yShift }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -yShift }}
              transition={{ duration, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
