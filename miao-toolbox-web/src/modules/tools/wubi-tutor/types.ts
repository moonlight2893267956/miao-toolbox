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
  TrophyOutlined,
} from '@ant-design/icons';

// ─── Tab 定义 ────────────────────────────────────────────

export type WubiTabKey = 'learn' | 'practice' | 'challenge' | 'review' | 'stats' | 'lookup';

export interface WubiTabConfig {
  key: WubiTabKey;
  label: string;
  /** 图标组件（AntD 图标，与全局图标体系一致；尺寸由 CSS 控制） */
  icon: ComponentType;
  description: string;
}

/** 6 个顶层 Tab 配置（顺序决定导航排列） */
export const WUBI_TABS: WubiTabConfig[] = [
  { key: 'learn',     label: '学习', icon: ReadOutlined,     description: '教程、字根图、拆字演示' },
  { key: 'practice',  label: '练习', icon: EditOutlined,     description: '键位、字根、单字、简码、词组、短文' },
  { key: 'challenge', label: '挑战', icon: TrophyOutlined,   description: '限时冲刺、生存挑战、每日打卡与排行榜' },
  { key: 'review',    label: '复习', icon: SyncOutlined,     description: '错题本与间隔重复' },
  { key: 'stats',     label: '成绩', icon: BarChartOutlined, description: '进度、趋势与成就' },
  { key: 'lookup',    label: '查码', icon: SearchOutlined,   description: '汉字 ↔ 编码互查' },
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
  /**
   * 「去讲解台追问」（Story 5.5）：携带要讲解的字并切到查码 Tab。
   *
   * `nonce` 是必需的：连续两次对同一个字发起请求时，只有 char 相同的话
   * React 的依赖比较看不出变化，第二次就不会触发。nonce 每次自增，
   * 保证「请求身份」每次都不同。
   */
  explainRequest: { char: string; nonce: number } | null;
}

export const INITIAL_WUBI_STATE: WubiState = {
  activeTab: 'learn',
  splitDemoChar: null,
  cheatSheetOpen: false,
  practiceScope: null,
  explainRequest: null,
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
  | { type: 'WT_CLEAR_PRACTICE_SCOPE' }
  /** 切到查码 Tab 并要求讲解台讲解某个字（拆字演示弹层的交接入口） */
  | { type: 'WT_EXPLAIN_CHAR'; payload: string }
  /** 讲解请求已被消费，清空 */
  | { type: 'WT_CLEAR_EXPLAIN_CHAR' };

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
    case 'WT_EXPLAIN_CHAR':
      return {
        // 关掉拆字弹层：交接完还在用户眼前挡着讲解台，就成了两个界面抢同一块地方
        ...state,
        activeTab: 'lookup',
        splitDemoChar: null,
        explainRequest: { char: action.payload, nonce: (state.explainRequest?.nonce ?? 0) + 1 },
      };
    case 'WT_CLEAR_EXPLAIN_CHAR':
      return { ...state, explainRequest: null };
    default:
      return state;
  }
}
