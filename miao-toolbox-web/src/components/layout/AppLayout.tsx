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
  const dur = reducedMotion ? 0 : 0.18;

  return (
    <Layout className="miao-shell">
      <Sidebar />
      <Layout style={{ background: 'transparent' }}>
        <Content className="miao-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: dur, ease: [0.25, 0.1, 0.25, 1] }}
              style={{ minHeight: '100%' }}
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
