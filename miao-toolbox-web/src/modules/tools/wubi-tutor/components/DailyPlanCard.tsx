/**
 * 今日计划卡片（Story 4.4）
 *
 * 放在练习 Tab 首页，给出「今天该练什么」的默认答案。
 *
 * 语气约束：未完成时**不施加强制或负反馈** ——
 * 不使用红色警示、不使用「还差 N 项」这类催促措辞，
 * 全部完成才给一次正向反馈。
 */

import React from 'react';
import { formatDuration } from '../utils/wubi/statsAggregation';
import type { DailyPlan, DailyPlanTaskId } from '../utils/wubi/dailyPlan';

interface DailyPlanCardProps {
  plan: DailyPlan;
  onStartTask: (id: DailyPlanTaskId) => void;
}

const DailyPlanCard: React.FC<DailyPlanCardProps> = ({ plan, onStartTask }) => {
  const { tasks, completedCount, totalCount, todayPracticeSec, allDone } = plan;

  return (
    <section className={`wt-plan${allDone ? ' wt-plan--done' : ''}`}>
      <header className="wt-plan__head">
        <div className="wt-plan__head-left">
          <h3 className="wt-plan__title">今日计划</h3>
          <span className="wt-plan__subtitle">
            {allDone
              ? '今天的任务都完成了，很棒'
              : `${completedCount} / ${totalCount} 已完成`}
          </span>
        </div>

        <div className="wt-plan__time">
          <span className="wt-plan__time-label">今日用时</span>
          <span className="wt-plan__time-value">
            {todayPracticeSec > 0 ? formatDuration(todayPracticeSec) : '—'}
          </span>
        </div>
      </header>

      <ul className="wt-plan__tasks">
        {tasks.map((task) => (
          <li
            key={task.id}
            className={`wt-plan__task${task.done ? ' wt-plan__task--done' : ''}`}
          >
            <span className="wt-plan__check" aria-hidden="true">
              {task.done ? '✓' : ''}
            </span>

            <div className="wt-plan__task-body">
              <span className="wt-plan__task-title">{task.title}</span>
              <span className="wt-plan__task-desc">{task.desc}</span>
            </div>

            {!task.done && task.actionable && (
              <button
                className="wt-plan__start"
                onClick={() => onStartTask(task.id)}
              >
                开始
              </button>
            )}

            {task.done && <span className="wt-plan__task-done-tag">已完成</span>}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default DailyPlanCard;
