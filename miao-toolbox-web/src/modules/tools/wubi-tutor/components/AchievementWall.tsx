/**
 * 成就墙（Story 4.4）
 *
 * 展示全部成就：已解锁点亮，未解锁显示进度条。
 * 纯本地记录，无分享/导出。
 */

import React from 'react';
import {
  ACHIEVEMENTS,
  GROUP_LABELS,
  getAchievementProgress,
  type AchievementContext,
  type AchievementGroup,
} from '../utils/wubi/achievements';

interface AchievementWallProps {
  /** 已解锁的成就 id */
  unlocked: string[];
  /** 成就判定上下文（用于计算未解锁项的进度） */
  context: AchievementContext;
}

/** 渲染顺序（按学习旅程：练习量 → 速度 → 准确率 → 坚持 → 进度 → 复习） */
const GROUP_ORDER: AchievementGroup[] = [
  'volume', 'speed', 'accuracy', 'streak', 'coverage', 'review',
];

const AchievementWall: React.FC<AchievementWallProps> = ({ unlocked, context }) => {
  const unlockedSet = new Set(unlocked);

  return (
    <div className="wt-ach-wall">
      {/* 总览 */}
      <div className="wt-ach-wall__summary">
        <span className="wt-ach-wall__count">
          <strong>{unlocked.length}</strong> / {ACHIEVEMENTS.length}
        </span>
        <div className="wt-ach-wall__bar">
          <div
            className="wt-ach-wall__bar-fill"
            style={{ width: `${(unlocked.length / ACHIEVEMENTS.length) * 100}%` }}
          />
        </div>
      </div>

      {GROUP_ORDER.map((group) => {
        const items = ACHIEVEMENTS.filter((a) => a.group === group);
        if (items.length === 0) return null;

        const groupUnlockedCount = items.filter((a) => unlockedSet.has(a.id)).length;

        return (
          <section key={group} className="wt-ach-wall__section">
            <h4 className="wt-ach-wall__section-title">
              {GROUP_LABELS[group]}
              <span className="wt-ach-wall__section-count">
                {groupUnlockedCount}/{items.length}
              </span>
            </h4>

            <div className="wt-ach-wall__grid">
              {items.map((def) => {
                const isUnlocked = unlockedSet.has(def.id);
                const progress = getAchievementProgress(def, context);
                const current = def.measure(context);

                return (
                  <div
                    key={def.id}
                    className={`wt-ach${isUnlocked ? ' wt-ach--unlocked' : ''}`}
                    title={def.desc}
                  >
                    <span className="wt-ach__badge">{def.badge}</span>

                    <div className="wt-ach__body">
                      <span className="wt-ach__title">{def.title}</span>
                      <span className="wt-ach__desc">{def.desc}</span>

                      {!isUnlocked && (
                        <div className="wt-ach__progress">
                          <div className="wt-ach__progress-bar">
                            <div
                              className="wt-ach__progress-fill"
                              style={{ width: `${progress * 100}%` }}
                            />
                          </div>
                          <span className="wt-ach__progress-text">
                            {Math.round(current)} / {def.target}
                          </span>
                        </div>
                      )}
                    </div>

                    {isUnlocked && <span className="wt-ach__check">✓</span>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default AchievementWall;
