/**
 * 分区闯关课程地图
 *
 * 展示 5 区 × 5 键位关卡，状态为「未解锁 / 进行中 / 已通关」。
 * 点击关卡展开三环节：字根认知 → 字根输入 → 单字练习。
 */

import React, { useState, useCallback } from 'react';
import {
  LockFilled,
  CheckCircleFilled,
  PlayCircleFilled,
  ArrowLeftOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { ZONE_COURSE, type Lesson, type LessonStage } from '../data/lessons';
import { ZONE_LABELS } from '../data/radicals';
import { PASS_ACCURACY, PASS_MIN_CHARS, type Coverage, type LessonStatus } from '../utils/wubi/course';

interface CourseMapProps {
  statusOf: (lessonId: string) => LessonStatus;
  coverage: Coverage;
  freeMode: boolean;
  /** 已通关关卡的记录（用于展示最佳成绩） */
  records: Record<string, { bestAccuracy: number; bestCharCount: number; attempts: number }>;
  /** 启动某关卡的某环节 */
  onStartStage: (lesson: Lesson, stage: LessonStage) => void;
  onToggleFreeMode: (value: boolean) => void;
  onReset: () => void;
  onBack: () => void;
}

const STATUS_LABEL: Record<LessonStatus, string> = {
  locked: '未解锁',
  'in-progress': '进行中',
  passed: '已通关',
};

const CourseMap: React.FC<CourseMapProps> = ({
  statusOf,
  coverage,
  freeMode,
  records,
  onStartStage,
  onToggleFreeMode,
  onReset,
  onBack,
}) => {
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleLessonClick = useCallback((lesson: Lesson) => {
    const status = statusOf(lesson.id);
    if (status === 'locked') return;
    setSelected((prev) => (prev?.id === lesson.id ? null : lesson));
  }, [statusOf]);

  // ── 单关详情 ──
  if (selected) {
    const status = statusOf(selected.id);
    const record = records[selected.id];

    return (
      <div className="wt-course">
        <div className="wt-course__bar">
          <button className="wt-course__back" onClick={() => setSelected(null)}>
            <ArrowLeftOutlined /> 课程地图
          </button>
          <h3 className="wt-course__detail-title">{selected.title}</h3>
          <span className={`wt-course__badge wt-course__badge--${status}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>

        {/* 键位信息 */}
        <div className="wt-course__detail-head">
          <div className="wt-course__key-chip">
            <span className="wt-course__key-letter">{selected.key.toUpperCase()}</span>
            <span className="wt-course__key-name">{selected.keyNameChar}</span>
          </div>
          <div className="wt-course__radicals">
            {selected.radicals.map((g) => (
              <span key={g} className="wt-course__radical">{g}</span>
            ))}
          </div>
        </div>

        {/* 最佳成绩 */}
        {record && (
          <div className="wt-course__record">
            最佳：正确率 {(record.bestAccuracy * 100).toFixed(0)}% · {record.bestCharCount} 字 · 共练 {record.attempts} 次
          </div>
        )}

        {/* 三环节 */}
        <div className="wt-course__stages">
          {selected.stages.map((stage, idx) => (
            <button
              key={stage.kind}
              className="wt-course__stage"
              onClick={() => onStartStage(selected, stage)}
            >
              <span className="wt-course__stage-index">{idx + 1}</span>
              <span className="wt-course__stage-label">{stage.label}</span>
              <PlayCircleFilled className="wt-course__stage-play" />
            </button>
          ))}
        </div>

        <p className="wt-course__hint">
          通关标准：单字练习正确率 ≥ {PASS_ACCURACY * 100}% 且完成 ≥ {PASS_MIN_CHARS} 字
        </p>
      </div>
    );
  }

  // ── 课程地图 ──
  return (
    <div className="wt-course">
      <div className="wt-course__bar">
        <button className="wt-course__back" onClick={onBack}>
          <ArrowLeftOutlined /> 返回模式选择
        </button>
        <span className="wt-course__coverage">
          你已掌握 <strong>{coverage.passed}</strong> / {coverage.total} 个键位的字根
        </span>
      </div>

      {/* 进度条 */}
      <div className="wt-course__progress">
        <div
          className="wt-course__progress-fill"
          style={{ width: `${coverage.rate * 100}%` }}
        />
      </div>

      {/* 自由模式 + 重置 */}
      <div className="wt-course__controls">
        <label className="wt-course__free-mode">
          <input
            type="checkbox"
            checked={freeMode}
            onChange={(e) => onToggleFreeMode(e.target.checked)}
          />
          <span>
            <ThunderboltFilled /> 自由模式
            <em>（跳过解锁限制，任意关卡可练）</em>
          </span>
        </label>

        {confirmReset ? (
          <span className="wt-course__reset-confirm">
            确认重置全部课程进度？
            <button className="wt-course__reset-yes" onClick={() => { onReset(); setConfirmReset(false); }}>
              确认重置
            </button>
            <button className="wt-course__reset-no" onClick={() => setConfirmReset(false)}>
              取消
            </button>
          </span>
        ) : (
          <button className="wt-course__reset" onClick={() => setConfirmReset(true)}>
            重置进度
          </button>
        )}
      </div>

      {/* 五个区 */}
      {ZONE_COURSE.map((zoneCourse) => (
        <section key={zoneCourse.zone} className="wt-course__zone">
          <h4 className="wt-course__zone-title">{ZONE_LABELS[zoneCourse.zone]}</h4>
          <div className="wt-course__lessons">
            {zoneCourse.lessons.map((lesson) => {
              const status = statusOf(lesson.id);
              return (
                <button
                  key={lesson.id}
                  className={`wt-course__lesson wt-course__lesson--${status}`}
                  onClick={() => handleLessonClick(lesson)}
                  disabled={status === 'locked'}
                  title={status === 'locked' ? '需先通关上一关' : lesson.title}
                >
                  <span className="wt-course__lesson-status">
                    {status === 'passed' && <CheckCircleFilled />}
                    {status === 'locked' && <LockFilled />}
                    {status === 'in-progress' && <PlayCircleFilled />}
                  </span>
                  <span className="wt-course__lesson-key">{lesson.key.toUpperCase()}</span>
                  <span className="wt-course__lesson-name">{lesson.keyNameChar}</span>
                  <span className="wt-course__lesson-state">{STATUS_LABEL[status]}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

export default CourseMap;
