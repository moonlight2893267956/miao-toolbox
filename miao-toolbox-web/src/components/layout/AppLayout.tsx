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
  const dur = reducedMotion ? 0 : 0.28;

  return (
    <Layout className="miao-shell">
      <Sidebar />
      <Layout style={{ background: 'transparent' }}>
        <Content className="miao-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 1 } : { opacity: 0, x: -8 }}
              transition={{ duration: dur, ease: [0.4, 0, 0.2, 1] }}
              style={{ minHeight: '100%', overflow: 'hidden' }}
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
