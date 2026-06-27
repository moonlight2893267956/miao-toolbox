import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ConfigProvider, theme } from 'antd';

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

// #11: 品牌主色 #5C4FD0，强调色 #D97020
const BRAND_PRIMARY = '#5C4FD0';
const BRAND_PRIMARY_DARK = '#A29BFE';
const BRAND_PRIMARY_DARK_ACTIVE = '#8B83F0';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // 持有"主题切换过渡"定时器,便于 effect 清理与快速连点时取消旧 timer
  const transitionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    // 临时给 <html> 加上 background-color/color 过渡,让主题切换更柔和。
    // 关键: 必须在动画结束后清除,否则会永久挂在 <html> 上,
    // 干扰 AntD Dropdown/Switch 等组件的内置动画(导致下拉菜单闪烁)。
    document.documentElement.style.transition = 'background-color 200ms ease, color 200ms ease';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = window.setTimeout(() => {
      document.documentElement.style.transition = '';
      transitionTimerRef.current = null;
    }, 250);

    return () => {
      if (transitionTimerRef.current !== null) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      document.documentElement.style.transition = '';
    };
  }, [isDark]);

  // 监听系统主题偏好变化（仅在用户未手动设置时跟随）
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // 仅在用户未手动设置主题时跟随系统
      if (!localStorage.getItem('theme')) {
        setIsDark(e.matches);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => !prev);
  }, []);

  const themeConfig = {
    token: {
      colorPrimary: isDark ? BRAND_PRIMARY_DARK : BRAND_PRIMARY,
      colorBgLayout: isDark ? '#171522' : '#F7F6FB',
      colorBgContainer: isDark ? '#211F2E' : '#FFFFFF',
      colorBgElevated: isDark ? '#29263A' : '#FFFFFF',
      colorBorder: isDark ? '#39354C' : '#E6E3F0',
      colorBorderSecondary: isDark ? '#302D40' : '#EFEAF7',
      colorText: isDark ? 'rgba(255,255,255,0.88)' : '#201C2D',
      colorTextSecondary: isDark ? 'rgba(255,255,255,0.62)' : 'rgba(32,28,45,0.64)',
      colorTextTertiary: isDark ? 'rgba(255,255,255,0.46)' : 'rgba(32,28,45,0.45)',
      colorFillSecondary: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(92,79,208,0.06)',
      borderRadius: 6,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    },
    components: {
      Button: {
        primaryShadow: 'none',
      },
      Card: {
        colorBgContainer: isDark ? '#211F2E' : '#FFFFFF',
      },
      Input: {
        activeBorderColor: isDark ? BRAND_PRIMARY_DARK : BRAND_PRIMARY,
        hoverBorderColor: isDark ? BRAND_PRIMARY_DARK_ACTIVE : BRAND_PRIMARY,
      },
    },
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      <ConfigProvider theme={themeConfig}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};
