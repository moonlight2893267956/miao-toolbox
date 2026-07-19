import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

/** 单个 Tab 元数据 */
export interface TabItem {
  key: string;
  label: string;
  path: string;
  icon?: ReactNode;
  /** 是否可关闭（工作台首页不可关闭） */
  closable: boolean;
  /** 固定在前 */
  pinned?: boolean;
}

/** Tab 状态 */
interface TabState {
  tabs: TabItem[];
  activeKey: string;
  /** 访问栈：用于关闭后回退到最近使用的 Tab */
  history: string[];
}

type TabAction =
  | { type: 'OPEN_TAB'; tab: TabItem }
  | { type: 'CLOSE_TAB'; key: string }
  | { type: 'SWITCH_TAB'; key: string }
  | { type: 'PIN_TAB'; key: string; pinned: boolean }
  | { type: 'CLOSE_OTHER_TABS'; key: string }
  | { type: 'CLOSE_RIGHT_TABS'; key: string }
  | { type: 'UPDATE_TAB'; key: string; updates: Partial<Omit<TabItem, 'key'>> };

const initialState: TabState = {
  tabs: [],
  activeKey: '',
  history: [],
};

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case 'OPEN_TAB': {
      const exists = state.tabs.find((t) => t.key === action.tab.key);
      if (exists) {
        return {
          ...state,
          activeKey: action.tab.key,
          history: pushHistory(state.history, action.tab.key),
        };
      }
      return {
        ...state,
        tabs: [...state.tabs, action.tab],
        activeKey: action.tab.key,
        history: pushHistory(state.history, action.tab.key),
      };
    }
    case 'CLOSE_TAB': {
      const tabs = state.tabs.filter((t) => t.key !== action.key);
      if (state.activeKey !== action.key) {
        return { ...state, tabs };
      }
      // 关闭的是当前活跃 Tab：回退到最近访问的 Tab
      const fallback = findFallback(state.history, action.key, tabs);
      return {
        ...state,
        tabs,
        activeKey: fallback,
        history: state.history.filter((k) => k !== action.key),
      };
    }
    case 'SWITCH_TAB': {
      return {
        ...state,
        activeKey: action.key,
        history: pushHistory(state.history, action.key),
      };
    }
    case 'PIN_TAB': {
      const tabs = state.tabs.map((t) =>
        t.key === action.key ? { ...t, pinned: action.pinned } : t,
      );
      // pinned 的排前面
      return {
        ...state,
        tabs: [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)],
      };
    }
    case 'CLOSE_OTHER_TABS': {
      const keep = state.tabs.filter(
        (t) => t.key === action.key || !t.closable,
      );
      return {
        ...state,
        tabs: keep,
        activeKey: action.key,
        history: pushHistory([], action.key),
      };
    }
    case 'CLOSE_RIGHT_TABS': {
      const idx = state.tabs.findIndex((t) => t.key === action.key);
      if (idx === -1) return state;
      const left = state.tabs.slice(0, idx + 1);
      return {
        ...state,
        tabs: left,
        activeKey: state.activeKey,
        history: state.history.filter((k) => left.some((t) => t.key === k)),
      };
    }
    case 'UPDATE_TAB': {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.key === action.key ? { ...t, ...action.updates } : t,
        ),
      };
    }
    default:
      return state;
  }
}

/** 将 key 加入访问栈，最多保留最近 20 个 */
function pushHistory(history: string[], key: string): string[] {
  const filtered = history.filter((k) => k !== key);
  return [...filtered, key].slice(-20);
}

/** 关闭当前 Tab 后，从访问栈找最近一个仍存在的 Tab */
function findFallback(history: string[], closedKey: string, remaining: TabItem[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const key = history[i];
    if (key !== closedKey && remaining.some((t) => t.key === key)) {
      return key;
    }
  }
  // 回退到第一个不可关闭的或剩余的第一个
  const firstUnclosable = remaining.find((t) => !t.closable);
  return firstUnclosable?.key ?? remaining[0]?.key ?? '';
}

// ── Context ───────────────────────────────────────────

interface TabContextValue {
  state: TabState;
  openTab: (tab: TabItem) => void;
  closeTab: (key: string) => void;
  switchTab: (key: string) => void;
  pinTab: (key: string, pinned: boolean) => void;
  closeOtherTabs: (key: string) => void;
  closeRightTabs: (key: string) => void;
  updateTab: (key: string, updates: Partial<Omit<TabItem, 'key'>>) => void;
}

const TabContext = createContext<TabContextValue | null>(null);

export const TabProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(tabReducer, initialState);

  const openTab = useCallback((tab: TabItem) => {
    dispatch({ type: 'OPEN_TAB', tab });
  }, []);

  const closeTab = useCallback((key: string) => {
    dispatch({ type: 'CLOSE_TAB', key });
  }, []);

  const switchTab = useCallback((key: string) => {
    dispatch({ type: 'SWITCH_TAB', key });
  }, []);

  const pinTab = useCallback((key: string, pinned: boolean) => {
    dispatch({ type: 'PIN_TAB', key, pinned });
  }, []);

  const updateTab = useCallback((key: string, updates: Partial<Omit<TabItem, 'key'>>) => {
    dispatch({ type: 'UPDATE_TAB', key, updates });
  }, []);

  const closeOtherTabs = useCallback((key: string) => {
    dispatch({ type: 'CLOSE_OTHER_TABS', key });
  }, []);

  const closeRightTabs = useCallback((key: string) => {
    dispatch({ type: 'CLOSE_RIGHT_TABS', key });
  }, []);

  const value = useMemo(
    () => ({
      state,
      openTab,
      closeTab,
      switchTab,
      pinTab,
      closeOtherTabs,
      closeRightTabs,
      updateTab,
    }),
    [state, openTab, closeTab, switchTab, pinTab, closeOtherTabs, closeRightTabs, updateTab],
  );

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
};

export function useTabs(): TabContextValue {
  const ctx = useContext(TabContext);
  if (!ctx) {
    throw new Error('useTabs must be used within <TabProvider>');
  }
  return ctx;
}

/** 从路径生成 Tab key */
export function makeTabKey(path: string): string {
  // /tools/regex-tester → tools-regex-tester
  return path.replace(/^\//, '').replace(/\//g, '-');
}

/** 判断路径是否应纳入 Tab */
export function isTabbable(path: string): boolean {
  // 工作台首页不纳入 Tab；/tools/* 子路径纳入；admin 纳入；settings 纳入
  if (path === '/tools' || path === '/tools/') return false;
  if (path.startsWith('/tools/')) return true;
  if (path.startsWith('/admin/')) return true;
  if (path === '/settings') return true;
  return false;
}

/** 提取路径的标题，用于兜底 */
export function tabTitleFromPath(path: string): string {
  if (path === '/settings') return '设置';
  const parts = path.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  const map: Record<string, string> = {
    'text-compare': '文本对照',
    'json-workbench': 'JSON 工作台',
    crypto: '加解密',
    translate: '翻译',
    'regex-tester': '正则测试',
    'cron-editor': 'Cron 编辑器',
    network: '网络工具',
    dashboard: '仪表盘',
    invocations: 'AI 调用',
    users: '用户管理',
    roles: '角色管理',
    routes: '路由管理',
  };
  return map[last] || last || '页面';
}
