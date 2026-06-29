import React from 'react';
import { motion } from 'framer-motion';
import useReducedMotion from '../../hooks/useReducedMotion';

interface PageFadeInProps {
  children: React.ReactNode;
  /** 动画方向：'up' 从下方滑入，'none' 仅淡入 */
  direction?: 'up' | 'none';
  /** 动画延迟（秒），用于 stagger 效果 */
  delay?: number;
  /** 自定义 className */
  className?: string;
  /** 自定义 style */
  style?: React.CSSProperties;
}

/**
 * 页面内容淡入动画包裹器。
 * 默认从下方 16px 上滑 + 淡入，适合包裹页面主体内容区域。
 */
const PageFadeIn: React.FC<PageFadeInProps> = ({
  children,
  direction = 'up',
  delay = 0,
  className,
  style,
}) => {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className} style={style}>{children}</div>;
  }

  const y = direction === 'up' ? 16 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
};

export default PageFadeIn;
