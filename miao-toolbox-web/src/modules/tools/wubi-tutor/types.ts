/**
 * 五笔练习室 — 类型定义与初始状态
 *
 * 命名规范：
 * - Action 类型统一 `WT_` 前缀
 * - CSS 类统一 `wt-` 前缀
 * - 纯函数置于 `utils/wubi/`，co-located `*.test.ts`
 */

import type { ComponentType } from 'react';
import {
  ReadOutlined,
  EditOutlined,
  SyncOutlined,
  BarChartOutlined,
  SearchOutlined,
} from '@ant-design/icons';

// ─── Tab 定义 ────────────────────────────────────────────

export type WubiTabKey = 'learn' | 'practice' | 'review' | 'stats' | 'lookup';

export interface WubiTabConfig {
  key: WubiTabKey;
  label: string;
  /** 图标组件（AntD 图标，与全局图标体系一致；尺寸由 CSS 控制） */
  icon: ComponentType;
  description: string;
}

/** 5 个顶层 Tab 配置（顺序决定导航排列） */
export const WUBI_TABS: WubiTabConfig[] = [
  { key: 'learn',    label: '学习', icon: ReadOutlined,     description: '教程、字根图、拆字演示' },
  { key: 'practice', label: '练习', icon: EditOutlined,     description: '键位、字根、单字、简码、词组、短文' },
  { key: 'review',   label: '复习', icon: SyncOutlined,     description: '错题本与间隔重复' },
  { key: 'stats',    label: '成绩', icon: BarChartOutlined, description: '进度、趋势与成就' },
  { key: 'lookup',   label: '查码', icon: SearchOutlined,   description: '汉字 ↔ 编码互查' },
];

// ─── 状态与 Action ──────────────────────────────────────

export interface WubiState {
  /** 当前激活的 Tab */
  activeTab: WubiTabKey;
  /** 拆字演示弹层：目标汉字（null = 关闭） */
  splitDemoChar: string | null;
  /** 速查卡抽屉是否展开 */
  cheatSheetOpen: boolean;
  /**
   * 从学习 Tab「去练习」跳转时携带的练习范围。
   * 练习 Tab 消费后应回传 null 清空，避免重复触发。
   */
  practiceScope: string | null;
}

export const INITIAL_WUBI_STATE: WubiState = {
  activeTab: 'learn',
  splitDemoChar: null,
  cheatSheetOpen: false,
  practiceScope: null,
};

/**
 * 校验一个持久化的值是否是合法 Tab key，非法值回退默认。
 *
 * 以 `WUBI_TABS` 为唯一事实来源：将来增删 Tab 时这里自动跟随，
 * 不会留下「能通过校验、但界面上并不存在」的 key —— 那种 key 会让
 * 内容区渲染成空白，而用户看到的只是一个白屏。
 */
export function normalizeTabKey(value: unknown): WubiTabKey {
  return WUBI_TABS.some((tab) => tab.key === value)
    ? (value as WubiTabKey)
    : INITIAL_WUBI_STATE.activeTab;
}

/**
 * 由持久化的 Tab 值构造初始状态。
 *
 * **只有 activeTab 来自持久化**：其余字段都是瞬时状态（浮层开关、
 * 跨 Tab 跳转载荷）。刷新后若把速查卡或拆字弹层一并恢复，用户会看到
 * 一个自己并没有打开过的浮层。
 */
export function createInitialWubiState(persistedTab?: unknown): WubiState {
  return { ...INITIAL_WUBI_STATE, activeTab: normalizeTabKey(persistedTab) };
}

export type WubiAction =
  | { type: 'WT_SET_TAB'; payload: WubiTabKey }
  | { type: 'WT_OPEN_SPLIT_DEMO'; payload: string }
  | { type: 'WT_CLOSE_SPLIT_DEMO' }
  | { type: 'WT_TOGGLE_CHEAT_SHEET'; payload?: boolean }
  /** 切到练习 Tab 并携带练习范围 */
  | { type: 'WT_START_PRACTICE'; payload: string }
  /** 练习范围已被消费，清空 */
  | { type: 'WT_CLEAR_PRACTICE_SCOPE' };

// ─── Reducer ────────────────────────────────────────────

export function wubiReducer(state: WubiState, action: WubiAction): WubiState {
  switch (action.type) {
    case 'WT_SET_TAB':
      return { ...state, activeTab: action.payload };
    case 'WT_OPEN_SPLIT_DEMO':
      return { ...state, splitDemoChar: action.payload };
    case 'WT_CLOSE_SPLIT_DEMO':
      return { ...state, splitDemoChar: null };
    case 'WT_TOGGLE_CHEAT_SHEET':
      return { ...state, cheatSheetOpen: action.payload ?? !state.cheatSheetOpen };
    case 'WT_START_PRACTICE':
      return { ...state, activeTab: 'practice', practiceScope: action.payload };
    case 'WT_CLEAR_PRACTICE_SCOPE':
      return { ...state, practiceScope: null };
    default:
      return state;
  }
}
