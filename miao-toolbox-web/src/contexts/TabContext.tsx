import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import {
  DashboardOutlined,
  PartitionOutlined,
  RobotOutlined,
  SafetyOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { toolsRegistry } from '../modules/tools/registry';
import { resolveNetworkIconFromPath } from '../modules/tools/network/utils/iconMap';
import { clearPageStates } from '../shared/utils/tabPageStorage';

/** 单个 Tab 元数据 */
export interface TabItem {
  key: string;
  label: string;
  path: string;
  icon?: ReactNode;
  /** 是否可关闭（固定标签 / 特殊页为 false） */
  closable: boolean;
  /** 固定在前；固定时 closable 强制为 false */
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
  | { type: 'CLOSE_LEFT_TABS'; key: string }
  | { type: 'CLOSE_ALL_TABS' }
  | { type: 'UPDATE_TAB'; key: string; updates: Partial<Omit<TabItem, 'key'>> };

const initialState: TabState = {
  tabs: [],
  activeKey: '',
  history: [],
};

function isProtectedTab(t: TabItem): boolean {
  return !t.closable || !!t.pinned;
}

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case 'OPEN_TAB': {
      const exists = state.tabs.find((t) => t.key === action.tab.key);
      if (exists) {
        // 已存在：仅在缺 icon/label 时补齐，避免无意义的 tabs 新引用触发整栏重渲染闪烁
        const patch: Partial<TabItem> = {};
        if (!exists.icon && action.tab.icon) patch.icon = action.tab.icon;
        if ((!exists.label || exists.label === exists.path) && action.tab.label) {
          patch.label = action.tab.label;
        }
        const needActivate = state.activeKey !== action.tab.key;
        if (Object.keys(patch).length === 0 && !needActivate) {
          return state;
        }
        const tabs =
          Object.keys(patch).length > 0
            ? state.tabs.map((t) => (t.key === action.tab.key ? { ...t, ...patch } : t))
            : state.tabs;
        return {
          ...state,
          tabs,
          activeKey: action.tab.key,
          history: needActivate
            ? pushHistory(state.history, action.tab.key)
            : state.history,
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
      const target = state.tabs.find((t) => t.key === action.key);
      if (!target || isProtectedTab(target)) {
        return state;
      }
      const tabs = state.tabs.filter((t) => t.key !== action.key);
      if (state.activeKey !== action.key) {
        return {
          ...state,
          tabs,
          history: state.history.filter((k) => k !== action.key),
        };
      }
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
        history: action.key ? pushHistory(state.history, action.key) : state.history,
      };
    }
    case 'PIN_TAB': {
      // Pin = 不可关闭（IDE 风格）：固定时 closable=false，取消固定恢复 closable=true
      const tabs = state.tabs.map((t) =>
        t.key === action.key
          ? { ...t, pinned: action.pinned, closable: action.pinned ? false : true }
          : t,
      );
      return {
        ...state,
        tabs: [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)],
      };
    }
    case 'CLOSE_OTHER_TABS': {
      const keep = state.tabs.filter(
        (t) => t.key === action.key || isProtectedTab(t),
      );
      const activeKey = keep.some((t) => t.key === action.key)
        ? action.key
        : (keep[0]?.key ?? '');
      return {
        ...state,
        tabs: keep,
        activeKey,
        history: activeKey ? pushHistory([], activeKey) : [],
      };
    }
    case 'CLOSE_RIGHT_TABS': {
      const idx = state.tabs.findIndex((t) => t.key === action.key);
      if (idx === -1) return state;
      const left = state.tabs.slice(0, idx + 1);
      const rightKeep = state.tabs.slice(idx + 1).filter(isProtectedTab);
      const tabs = [...left, ...rightKeep];
      const activeKey = tabs.some((t) => t.key === state.activeKey)
        ? state.activeKey
        : findFallback(state.history, state.activeKey, tabs);
      return {
        ...state,
        tabs,
        activeKey,
        history: state.history.filter((k) => tabs.some((t) => t.key === k)),
      };
    }
    case 'CLOSE_LEFT_TABS': {
      const idx = state.tabs.findIndex((t) => t.key === action.key);
      if (idx <= 0) return state;
      const leftKeep = state.tabs.slice(0, idx).filter(isProtectedTab);
      const right = state.tabs.slice(idx);
      const tabs = [...leftKeep, ...right];
      const activeKey = tabs.some((t) => t.key === action.key)
        ? action.key
        : findFallback(state.history, state.activeKey, tabs);
      return {
        ...state,
        tabs,
        activeKey,
        history: state.history.filter((k) => tabs.some((t) => t.key === k)),
      };
    }
    case 'CLOSE_ALL_TABS': {
      // 仅关闭可关标签，保留 pinned / 不可关闭
      const keep = state.tabs.filter(isProtectedTab);
      if (keep.length === 0) {
        return { tabs: [], activeKey: '', history: [] };
      }
      const activeKey = keep.some((t) => t.key === state.activeKey)
        ? state.activeKey
        : keep[0].key;
      return {
        tabs: keep,
        activeKey,
        history: pushHistory([], activeKey),
      };
    }
    case 'UPDATE_TAB': {
      return {
        ...state,
        tabs: state.tabs.map((t) => {
          if (t.key !== action.key) return t;
          const next = { ...t, ...action.updates };
          // pinned 优先：固定标签始终不可关
          if (next.pinned) {
            next.closable = false;
          }
          return next;
        }),
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
  const firstUnclosable = remaining.find((t) => !t.closable);
  return firstUnclosable?.key ?? remaining[0]?.key ?? '';
}

// ── 持久化（刷新后保留 Tab） ─────────────────────────────
const TAB_STORAGE_KEY = 'miao-tabs-v1';

interface PersistedTab {
  key: string;
  label: string;
  path: string;
  closable: boolean;
  pinned?: boolean;
}

function sanitizePersistedTabs(raw: unknown[]): TabItem[] {
  const tabs: TabItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Partial<PersistedTab>;
    if (typeof t.key !== 'string' || !t.key) continue;
    if (typeof t.path !== 'string' || !t.path.startsWith('/')) continue;
    const pinned = !!t.pinned;
    tabs.push({
      key: t.key,
      label: typeof t.label === 'string' && t.label ? t.label : tabTitleFromPath(t.path),
      path: t.path,
      closable: pinned ? false : t.closable !== false,
      pinned: pinned || undefined,
    });
  }
  // pinned 在前
  return [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];
}

/** 从 localStorage 恢复 Tab 状态；icon 无法序列化，刷新后由 AppLayout 重新补回 */
function loadInitialState(): TabState {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as { tabs?: unknown[]; activeKey?: string };
    if (!parsed || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0) {
      return initialState;
    }
    const tabs = sanitizePersistedTabs(parsed.tabs);
    if (tabs.length === 0) return initialState;
    const activeKey =
      typeof parsed.activeKey === 'string' && tabs.some((t) => t.key === parsed.activeKey)
        ? parsed.activeKey
        : tabs[0].key;
    return {
      tabs,
      activeKey,
      history: [activeKey],
    };
  } catch {
    return initialState;
  }
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
  closeLeftTabs: (key: string) => void;
  closeAllTabs: () => void;
  updateTab: (key: string, updates: Partial<Omit<TabItem, 'key'>>) => void;
}

const TabContext = createContext<TabContextValue | null>(null);

export const TabProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(tabReducer, undefined, loadInitialState);
  /** 用于检测被关闭的 Tab，同步清理页面工作数据 */
  const prevTabKeysRef = useRef<string[]>(state.tabs.map((t) => t.key));

  /* 状态变化即写入 localStorage（icon 为 ReactNode，序列化时剔除） */
  useEffect(() => {
    try {
      const data = {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        tabs: state.tabs.map(({ icon: _icon, ...rest }) => rest),
        activeKey: state.activeKey,
      };
      localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* 忽略隐私模式 / 配额超限等异常 */
    }
  }, [state.tabs, state.activeKey]);

  /* 关闭 Tab 时清除对应页面数据（刷新不清除，仅关闭时清除） */
  useEffect(() => {
    const prevKeys = prevTabKeysRef.current;
    const currKeys = new Set(state.tabs.map((t) => t.key));
    const removed = prevKeys.filter((k) => !currKeys.has(k));
    if (removed.length > 0) {
      clearPageStates(removed);
    }
    prevTabKeysRef.current = state.tabs.map((t) => t.key);
  }, [state.tabs]);

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

  const closeLeftTabs = useCallback((key: string) => {
    dispatch({ type: 'CLOSE_LEFT_TABS', key });
  }, []);

  const closeAllTabs = useCallback(() => {
    dispatch({ type: 'CLOSE_ALL_TABS' });
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
      closeLeftTabs,
      closeAllTabs,
      updateTab,
    }),
    [state, openTab, closeTab, switchTab, pinTab, closeOtherTabs, closeRightTabs, closeLeftTabs, closeAllTabs, updateTab],
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
    'email-header': 'Email Header',
    'log-parser': '日志解析',
    'diff-checker': 'Diff 检查器',
    dashboard: '仪表盘',
    invocations: 'AI 调用',
    users: '用户管理',
    roles: '角色管理',
    routes: '路由管理',
  };
  return map[last] || last || '页面';
}

/** 网络工具子路径 title 兜底（与 YAML name 对齐的常用项） */
const NETWORK_TAB_LABELS: Record<string, string> = {
  'base64-codec': '编码解码全家桶',
  'data-format': '数据格式转换器',
  'file-hash': '文件哈希计算器',
  'http-status': 'HTTP 状态码参考',
  'ip-format': 'IP 格式转换器',
  'mime-type': 'MIME 类型参考',
  timestamp: '时间戳转换器',
  'cookie-analyzer': 'Cookie 分析器',
  'url-parser': 'URL 解析器',
  'openapi-viewer': 'OpenAPI/Swagger 查看器',
  'email-header': 'Email Header 分析器',
  'log-parser': '日志解析/分析器',
  'diff-checker': 'Diff 检查器',
  'cors-checker': 'CORS 策略检查器',
  'docker-network': 'Docker 网络配置生成器',
  'cidr-calculator': 'CIDR/子网计算器',
  'curl-generator': 'Curl 命令生成器',
  'jwt-debugger': 'JWT 构建器/调试器',
  'hmac-signer': 'HMAC 签名生成/验证',
  'http-api-sign': 'HTTP API 签名计算器',
  'nginx-config': 'Nginx 配置生成器',
  'dns-query': 'DNS 查询工具',
  'tcp-ping': 'TCP Ping 检查器',
  whois: 'WHOIS 查询',
  'ssl-analyzer': 'SSL/TLS 证书分析器',
  'http-header': 'HTTP Header 分析器',
  'ip-reputation': 'IP 信誉检查器',
  'websocket-tester': 'WebSocket 测试器',
  'network-assistant': '网络排障 AI 助手',
};

/** 解析 Tab 标题（工具注册表优先） */
export function resolveTabLabel(path: string): string {
  const tool = toolsRegistry.find((t) => t.path === path);
  if (tool?.title) return tool.title;
  if (path === '/tools/network' || path === '/tools/network/') return '网络工具箱';
  if (path.startsWith('/tools/network/')) {
    const id = path.split('/').filter(Boolean).pop() ?? '';
    if (NETWORK_TAB_LABELS[id]) return NETWORK_TAB_LABELS[id];
  }
  return tabTitleFromPath(path);
}

/**
 * 按路径解析 Tab 图标。
 * toolsRegistry → 网络子工具 icon 表 → admin / settings
 */
export function resolveTabIcon(path: string): ReactNode | undefined {
  const tool = toolsRegistry.find((t) => t.path === path);
  if (tool?.icon) {
    const Icon = tool.icon;
    return <Icon />;
  }

  // 网络工具箱列表 + 各子工具（刷新后 localStorage 无 ReactNode，靠此补回）
  if (path.startsWith('/tools/network')) {
    return resolveNetworkIconFromPath(path);
  }

  if (path === '/admin/dashboard') return <DashboardOutlined />;
  if (path === '/admin/invocations' || path.startsWith('/admin/invocations')) {
    return <RobotOutlined />;
  }
  if (path === '/admin/users' || path.startsWith('/admin/users')) return <TeamOutlined />;
  if (path === '/admin/roles' || path.startsWith('/admin/roles')) return <SafetyOutlined />;
  if (path === '/admin/routes' || path.startsWith('/admin/routes')) {
    return <PartitionOutlined />;
  }
  if (path === '/settings') return <SettingOutlined />;
  return undefined;
}
