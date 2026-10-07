/**
 * 学习 Tab
 *
 * 集成教程渲染器 + 字根键盘图 + 拆字演示弹层
 *
 * 教程中的自定义标记 [[根:亻]] / [[字:照]] 可点击交互：
 * - 字根标记 → 跳转字根键盘图视图
 * - 汉字标记 → 唤起拆字演示弹层
 */

import React, { useState, useCallback } from 'react';
import { ReadOutlined, AppstoreOutlined } from '@ant-design/icons';
import Tutorial from '../components/Tutorial';
import RadicalChart from '../components/RadicalChart';

type LearnView = 'tutorial' | 'chart';

interface LearnTabProps {
  /** 跳转到练习 Tab 并携带练习范围 */
  onPracticeNavigate?: (scope: string) => void;
  /**
   * 唤起拆分演示。
   *
   * 统一走页面级的全局弹层：本组件此前自带一份 SplitDemo 副本，
   * 导致「加入难字本」是空实现（只有 console.log），页面的真实实现拿不到。
   */
  onOpenSplitDemo?: (char: string) => void;
}

const LearnTab: React.FC<LearnTabProps> = ({ onPracticeNavigate, onOpenSplitDemo }) => {
  const [view, setView] = useState<LearnView>('tutorial');

  // 只切视图，不消费具体字根 —— 因此不声明参数
  const handleRadicalClick = useCallback(() => {
    setView('chart');
  }, []);

  const handleCharClick = useCallback((char: string) => {
    onOpenSplitDemo?.(char);
  }, [onOpenSplitDemo]);

  const handlePracticeNavigate = useCallback((scope: string) => {
    onPracticeNavigate?.(scope);
  }, [onPracticeNavigate]);

  return (
    <div className="wt-learn">
      {/* 视图切换 */}
      <div className="wt-learn__switcher">
        <button
          className={`wt-learn__switch-btn${view === 'tutorial' ? ' wt-learn__switch-btn--active' : ''}`}
          onClick={() => setView('tutorial')}
        >
          <ReadOutlined />
          <span>图文教程</span>
        </button>
        <button
          className={`wt-learn__switch-btn${view === 'chart' ? ' wt-learn__switch-btn--active' : ''}`}
          onClick={() => setView('chart')}
        >
          <AppstoreOutlined />
          <span>字根键盘图</span>
        </button>
      </div>

      {/* 视图内容 */}
      {view === 'tutorial' ? (
        <Tutorial
          onRadicalClick={handleRadicalClick}
          onCharClick={handleCharClick}
          onPracticeNavigate={handlePracticeNavigate}
        />
      ) : (
        <RadicalChart onRadicalClick={handleRadicalClick} onCharClick={handleCharClick} />
      )}

    </div>
  );
};

export default LearnTab;
