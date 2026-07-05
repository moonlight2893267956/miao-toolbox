import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, message } from 'antd';
import { SearchOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { toolsRegistry, getToolsByCategory } from './registry';
import type { ToolMeta } from './registry';
import { isSuperAdmin, useAuth } from '../../contexts/AuthContext';

const ToolsPage: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useAuth();
  const [search, setSearch] = useState('');
  const admin = isSuperAdmin(state.userInfo);
  const canAccessTool = (tool: ToolMeta) => (
    admin || !tool.routeCode || state.accessibleRoutes.includes(tool.routeCode)
  );

  const visibleTools = toolsRegistry.filter((tool) => tool.category !== 'available' || canAccessTool(tool));
  const filteredTools = visibleTools.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase())),
  );

  const availableTools = getToolsByCategory('available').filter((t) =>
    filteredTools.some((ft) => ft.key === t.key),
  );
  const comingSoonTools = getToolsByCategory('coming-soon').filter((t) =>
    filteredTools.some((ft) => ft.key === t.key),
  );

  const handleToolClick = (path: string | null, title: string) => {
    if (path) {
      navigate(path);
    } else {
      message.info(`${title} 正在接入中`);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  const ToolCard: React.FC<{ tool: ToolMeta; featured?: boolean }> = ({ tool, featured = false }) => {
    const cardRef = useRef<HTMLButtonElement>(null);
    const [transform, setTransform] = useState('perspective(1000px) rotateX(0deg) rotateY(0deg)');
    const Icon = tool.icon;

    const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = (y - centerY) / 20;
      const rotateY = (centerX - x) / 20;
      setTransform(`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`);
    };

    const handleMouseLeave = () => {
      setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');
    };

    return (
      <motion.button
        ref={cardRef}
        type="button"
        className={`miao-bento-card ${featured ? 'miao-bento-card--featured' : ''} ${tool.available ? '' : 'miao-bento-card--soon'}`}
        style={{ transform, transition: 'transform 0.15s ease-out' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={() => handleToolClick(tool.path, tool.title)}
        variants={itemVariants}
        whileTap={{ scale: 0.98 }}
      >
        <div className="miao-bento-card-glow" style={{ '--glow-color': tool.accentColor } as React.CSSProperties} />
        <div className="miao-bento-card-content">
          <div className="miao-bento-card-header">
            <span className="miao-bento-icon" style={{ background: tool.iconBg }}>
              <Icon />
            </span>
            <span className={`miao-bento-status ${tool.available ? 'miao-bento-status--live' : 'miao-bento-status--soon'}`}>
              {tool.available ? 'LIVE' : 'SOON'}
            </span>
          </div>
          <div className="miao-bento-card-body">
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
            <div className="miao-bento-tags">
              {tool.tags.map((tag) => (
                <span key={tag} className="miao-bento-tag">{tag}</span>
              ))}
            </div>
          </div>
          <div className="miao-bento-card-footer">
            <span className="miao-bento-action">
              {tool.available ? '打开工具' : '敬请期待'}
              <ArrowRightOutlined className="miao-bento-arrow" />
            </span>
          </div>
        </div>
      </motion.button>
    );
  };

  return (
    <div className="miao-editorial-page">
      {/* Hero Section */}
      <section className="miao-editorial-hero">
        <div className="miao-editorial-hero-bg" aria-hidden="true">
          <div className="miao-editorial-noise" />
          <div className="miao-editorial-gradient-orb orb-1" />
          <div className="miao-editorial-gradient-orb orb-2" />
        </div>
        
        <div className="miao-editorial-hero-content">
          <motion.div 
            className="miao-editorial-hero-label"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <span className="miao-editorial-pill">AI TOOLBOX</span>
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            探索 AI
            <br />
            <span className="miao-editorial-highlight">无限可能</span>
          </motion.h1>
          
          <motion.p 
            className="miao-editorial-hero-subtitle"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
          >
            精心策划的 AI 工具集合，
            <br />
            让创意与效率触手可及。
          </motion.p>
          
          <motion.div 
            className="miao-editorial-search"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <SearchOutlined className="miao-editorial-search-icon" />
            <Input
              allowClear
              placeholder="搜索工具..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="miao-editorial-search-input"
              variant="borderless"
            />
          </motion.div>
        </div>

        <motion.div 
          className="miao-editorial-stats"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
        >
          <div className="miao-editorial-stat">
            <span className="miao-editorial-stat-number">{String(visibleTools.length).padStart(2, '0')}</span>
            <span className="miao-editorial-stat-label">工具</span>
          </div>
          <div className="miao-editorial-stat-divider" />
          <div className="miao-editorial-stat">
            <span className="miao-editorial-stat-number">{String(getToolsByCategory('available').filter(canAccessTool).length).padStart(2, '0')}</span>
            <span className="miao-editorial-stat-label">可用</span>
          </div>
          <div className="miao-editorial-stat-divider" />
          <div className="miao-editorial-stat">
            <span className="miao-editorial-stat-number">01</span>
            <span className="miao-editorial-stat-label">平台</span>
          </div>
        </motion.div>
      </section>

      {/* Bento Grid Section */}
      <AnimatePresence mode="wait">
        {filteredTools.length > 0 && (
          <motion.section 
            className="miao-bento-section"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
          >
            {availableTools.length > 0 && (
              <div className="miao-bento-category">
                <motion.h2 variants={itemVariants} className="miao-bento-category-title">
                  <span className="miao-bento-category-indicator" />
                  已上线
                </motion.h2>
                <div className="miao-bento-grid">
                  {availableTools.map((tool) => (
                    <ToolCard key={tool.key} tool={tool} featured={tool.key === 'text-compare'} />
                  ))}
                </div>
              </div>
            )}

            {comingSoonTools.length > 0 && (
              <div className="miao-bento-category">
                <motion.h2 variants={itemVariants} className="miao-bento-category-title">
                  <span className="miao-bento-category-indicator miao-bento-category-indicator--soon" />
                  即将推出
                </motion.h2>
                <div className="miao-bento-grid miao-bento-grid--soon">
                  {comingSoonTools.map((tool) => (
                    <ToolCard key={tool.key} tool={tool} />
                  ))}
                </div>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {filteredTools.length === 0 && (
        <motion.div 
          className="miao-editorial-empty"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <p>未找到匹配的工具</p>
          <button onClick={() => setSearch('')} className="miao-editorial-empty-btn">
            清除搜索
          </button>
        </motion.div>
      )}
    </div>
  );
};

export default ToolsPage;
