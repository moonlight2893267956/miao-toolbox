/**
 * 每日挑战卡片：今日状态 + 连续打卡 + 最近 7 天点阵。
 *
 * 「已完成」态刻意做成**盖章式**反馈（一次性淡入 + 轻微旋转），
 * 而不是把按钮变成灰按钮 —— 打卡是需要被看见的正反馈，
 * 只在按钮上做 disabled 等于把奖励藏起来。
 */

import React from 'react';
import { CheckCircleFilled, CalendarOutlined } from '@ant-design/icons';

interface DailyChallengeCardProps {
  /** 今天（YYYY-MM-DD） */
  today: string;
  /** 今日是否已完成 */
  completed: boolean;
  /** 今日成绩；未打为 null */
  score: number | null;
  /** 连续打卡天数 */
  streak: number;
  /** 最近 7 天（升序，含今天） */
  recentDays: string[];
  /** 已完成的日期集合 */
  completedDates: string[];
  /** 每天满分（用于展示 28/30） */
  maxScore: number;
  /** 码表未就绪等情况下禁用开始 */
  disabled?: boolean;
  onStart: () => void;
}

/** 取「日」用于点阵标签 */
function dayOfMonth(dateKey: string): string {
  return String(Number(dateKey.slice(8, 10)));
}

const DailyChallengeCard: React.FC<DailyChallengeCardProps> = ({
  today,
  completed,
  score,
  streak,
  recentDays,
  completedDates,
  maxScore,
  disabled = false,
  onStart,
}) => {
  const done = new Set(completedDates);

  return (
    <section className={`wt-daily-card${completed ? ' wt-daily-card--done' : ''}`}>
      <div className="wt-daily-card__head">
        <span className="wt-daily-card__icon"><CalendarOutlined /></span>
        <div className="wt-daily-card__titles">
          <h3 className="wt-daily-card__title">每日挑战</h3>
          <p className="wt-daily-card__sub">
            {today} · 每天一套固定题组，同一天所有人题目一致
          </p>
        </div>
        {completed && (
          <span className="wt-daily-card__stamp" aria-label="今日已完成">
            <CheckCircleFilled />
            <span className="wt-daily-card__stamp-text">已打卡</span>
          </span>
        )}
      </div>

      <div className="wt-daily-card__body">
        <div className="wt-daily-card__calendar">
          {recentDays.map((day) => {
            const isDone = done.has(day);
            const isToday = day === today;
            return (
              <div
                key={day}
                className={`wt-daily-card__day${isDone ? ' wt-daily-card__day--done' : ''}${
                  isToday ? ' wt-daily-card__day--today' : ''
                }`}
                title={`${day}${isDone ? ' · 已完成' : ''}`}
              >
                <span className="wt-daily-card__day-dot" aria-hidden="true" />
                <span className="wt-daily-card__day-label">{dayOfMonth(day)}</span>
              </div>
            );
          })}
        </div>

        <div className="wt-daily-card__stats">
          <div className="wt-daily-card__streak">
            <span className="wt-daily-card__streak-value">{streak}</span>
            <span className="wt-daily-card__streak-label">连续打卡</span>
          </div>
          <div className="wt-daily-card__today-score">
            <span className="wt-daily-card__today-value">
              {score === null ? '—' : score}
              <span className="wt-daily-card__today-max"> / {maxScore}</span>
            </span>
            <span className="wt-daily-card__today-label">今日成绩</span>
          </div>
        </div>
      </div>

      <div className="wt-daily-card__footer">
        <button
          type="button"
          className="wt-challenge-btn wt-challenge-btn--primary"
          onClick={onStart}
          disabled={disabled}
        >
          {completed ? '再打一遍（不计入正式成绩）' : '开始今日挑战'}
        </button>
        {completed && (
          <span className="wt-daily-card__hint">正式成绩每天只记一次，重玩不覆盖</span>
        )}
      </div>
    </section>
  );
};

export default DailyChallengeCard;
