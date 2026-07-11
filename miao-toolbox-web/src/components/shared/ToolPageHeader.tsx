import React from 'react';
import { motion } from 'framer-motion';
import './ToolPageHeader.css';

interface ToolPageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}

const ToolPageHeader: React.FC<ToolPageHeaderProps> = ({ icon, title, subtitle }) => (
  <header className="tph">
    <motion.div
      className="tph-inner"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <motion.div
        className="tph-icon"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <div className="tph-icon-glow" />
        <div className="tph-icon-body">
          <span className="tph-icon-inner">{icon}</span>
        </div>
      </motion.div>

      <motion.div
        className="tph-text"
        initial={{ x: -6, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <h2 className="tph-title">{title}</h2>
        <div className="tph-meta">
          <span className="tph-status">
            <span className="tph-status-dot" />
            运行中
          </span>
          <span className="tph-desc">{subtitle}</span>
        </div>
      </motion.div>
    </motion.div>

    <motion.div
      className="tph-rule"
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
    />
  </header>
);

export default ToolPageHeader;
