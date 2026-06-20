import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 响应用户系统级动效偏好 `prefers-reduced-motion: reduce`。
 *
 * 初始值同步读取 matchMedia，避免首屏闪烁；
 * 通过 'change' 事件监听运行时切换；
 * 组件卸载时移除监听，避免泄漏。
 */
const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setReduced(event.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return reduced;
};

export default useReducedMotion;
