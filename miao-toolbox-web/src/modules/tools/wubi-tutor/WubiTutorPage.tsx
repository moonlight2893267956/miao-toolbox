/**
 * 五笔练习室 — 主页面
 *
 * 职责：
 * - 持有 useReducer 全局状态（WubiState）
 * - 渲染共享页头 + 工具条 + 工作台 + 内容区
 * - Tab 切换由 WT_SET_TAB 驱动
 * - 全局挂载 SplitDemo 弹层与 CheatSheetDrawer
 *
 * 布局对齐其他工具：全屏工作台外壳 + 圆角卡片 + 共享 ToolPageHeader。
 */

import React, { useReducer, useCallback, useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MOTION } from './utils/wubi/motion';
import { KeyOutlined, BookOutlined } from '@ant-design/icons';
import './wubi-tutor.css';
import ToolPageHeader from '../../../components/shared/ToolPageHeader';
import {
  WUBI_TABS,
  createInitialWubiState,
  wubiReducer,
  type WubiTabKey,
} from './types';
import LearnTab from './tabs/LearnTab';
import PracticeTab from './tabs/PracticeTab';
import ReviewTab from './tabs/ReviewTab';
import StatsTab from './tabs/StatsTab';
import LookupTab from './tabs/LookupTab';
import SplitDemo from './components/SplitDemo';
import CheatSheetDrawer from './components/CheatSheetDrawer';
import { useReview } from './utils/wubi/useReview';
import { useWubiData } from './utils/wubi/useWubiData';
import { useWubiStorage } from './utils/wubi/useWubiStorage';

const TAB_COMPONENTS: Record<WubiTabKey, React.FC<any>> = {
  learn: LearnTab,
  practice: PracticeTab,
  review: ReviewTab,
  stats: StatsTab,
  lookup: LookupTab,
};

/** 轻量提示条（不依赖 AntD message 的静态上下文） */
const NoticeToast: React.FC<{ text: string | null; onDone: () => void }> = ({ text, onDone }) => {
  useEffect(() => {
    if (!text) return;
    const timer = setTimeout(onDone, 2600);
    return () => clearTimeout(timer);
  }, [text, onDone]);

  if (!text) return null;
  return (
    // 右上角：与练习 Tab 右下角的成就 Toast 错开，避免重叠
    <div className="wt-ach-toasts wt-ach-toasts--upper">
      <div className="wt-ach-toast wt-ach-toast--plain" role="status" aria-live="polite">
        <div className="wt-ach-toast__body">
          <span className="wt-ach-toast__title">{text}</span>
        </div>
      </div>
    </div>
  );
};

const WubiTutorPage: React.FC = () => {
  const [notice, setNotice] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const { addManual } = useReview();
  const { state: dataState, loadChars, charsReady } = useWubiData();
  /** 读取 / 写入「上次停留的 Tab」，让刷新后回到原处 */
  const { loadSettings, updateSettings } = useWubiStorage();

  /*
   * 初始 Tab 直接读持久化值（惰性初始化），**不要**改成挂载后再用 effect 纠正：
   * effect 要等首帧之后才跑，用户会先看到一次学习页、再被切走 —— 闪一下更难受。
   */
  const [state, dispatch] = useReducer(wubiReducer, null, () =>
    createInitialWubiState(loadSettings().lastTab),
  );

  /*
   * Tab 变更后落盘。首次挂载也会写一次（写入的值与刚读出来的一致），无害；
   * 顺带起到「把非法旧值修正回 'learn'」的作用。
   */
  useEffect(() => {
    updateSettings({ lastTab: state.activeTab });
  }, [state.activeTab, updateSettings]);

  /*
   * 拆分演示需要码表，但只在**弹层真正打开时**才加载 ——
   * 用户只看教程/速查卡时不应付出 13 万条码表的下载与解析成本。
   */
  useEffect(() => {
    if (state.splitDemoChar && !charsReady) loadChars();
  }, [state.splitDemoChar, charsReady, loadChars]);

  const handleTabChange = useCallback((key: WubiTabKey) => {
    dispatch({ type: 'WT_SET_TAB', payload: key });
  }, []);

  const handleOpenSplitDemo = useCallback((char: string) => {
    dispatch({ type: 'WT_OPEN_SPLIT_DEMO', payload: char });
  }, []);

  const handleCloseSplitDemo = useCallback(() => {
    dispatch({ type: 'WT_CLOSE_SPLIT_DEMO' });
  }, []);

  const handleToggleCheatSheet = useCallback(() => {
    dispatch({ type: 'WT_TOGGLE_CHEAT_SHEET' });
  }, []);

  /** 学习 Tab「去练习」：切到练习 Tab 并携带练习范围 */
  const handlePracticeNavigate = useCallback((scope: string) => {
    dispatch({ type: 'WT_START_PRACTICE', payload: scope });
  }, []);

  const handleClearPracticeScope = useCallback(() => {
    dispatch({ type: 'WT_CLEAR_PRACTICE_SCOPE' });
  }, []);

  /** 跳转到复习 Tab（今日计划的复习任务入口） */
  const handleGotoReview = useCallback(() => {
    dispatch({ type: 'WT_SET_TAB', payload: 'review' });
  }, []);

  /** 拆字演示弹层「加入难字本」（Story 4.3 手动入口） */
  const handleAddToReview = useCallback((char: string) => {
    const added = addManual(char);
    setNotice(added ? `「${char}」已加入难字本` : `「${char}」已在难字本中`);
    dispatch({ type: 'WT_CLOSE_SPLIT_DEMO' });
  }, [addManual]);

  const handleNoticeDone = useCallback(() => setNotice(null), []);

  const ActiveTabComponent = TAB_COMPONENTS[state.activeTab];

  return (
    <motion.div
      className="wt-page"
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: prefersReducedMotion ? 0 : MOTION.slow }}
    >
      {/* 共享页头 */}
      <ToolPageHeader
        icon={<KeyOutlined />}
        title="五笔练习室"
        subtitle="字根拆解 · 交互练习 · 拆字演示"
      />

      {/* 工具条：Tab 导航 + 速查卡 */}
      <div className="wt-toolbar">
        <nav className="wt-nav" role="tablist">
          {WUBI_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={state.activeTab === tab.key}
              className={`wt-nav__tab${state.activeTab === tab.key ? ' wt-nav__tab--active' : ''}`}
              onClick={() => handleTabChange(tab.key)}
            >
              <span className="wt-nav__tab-icon">
                <tab.icon />
              </span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          className={`wt-toolbar__action${state.cheatSheetOpen ? ' wt-toolbar__action--active' : ''}`}
          onClick={handleToggleCheatSheet}
          aria-label="规则速查卡"
        >
          <BookOutlined />
          <span>速查卡</span>
        </button>
      </div>

      {/* 工作台：内容区 */}
      <main className="wt-workspace">
        <div className="wt-workspace__panel">
          <ActiveTabComponent
            onOpenSplitDemo={handleOpenSplitDemo}
            onPracticeNavigate={handlePracticeNavigate}
            practiceScope={state.practiceScope}
            onPracticeScopeHandled={handleClearPracticeScope}
            onGotoReview={handleGotoReview}
          />
        </div>
      </main>

      {/* 全局拆字演示弹层 */}
      <SplitDemo
        open={state.splitDemoChar !== null}
        char={state.splitDemoChar}
        onClose={handleCloseSplitDemo}
        onAddToReview={handleAddToReview}
        charMap={dataState.chars}
      />

      {/* 全局规则速查卡 */}
      <CheatSheetDrawer
        open={state.cheatSheetOpen}
        onClose={() => dispatch({ type: 'WT_TOGGLE_CHEAT_SHEET', payload: false })}
        onCharClick={handleOpenSplitDemo}
      />

      {/* 轻量提示（加入难字本等） */}
      <NoticeToast text={notice} onDone={handleNoticeDone} />
    </motion.div>
  );
};

export default WubiTutorPage;
