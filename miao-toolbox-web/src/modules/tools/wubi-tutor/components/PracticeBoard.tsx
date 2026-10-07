/**
 * 练习看板
 *
 * 整合：题目展示区 + 虚拟键盘 + 指标条 + 错误反馈。
 *
 * 性能（NFR-1）：
 * - 高频纯视觉反馈通过 ref + classList 命令式更新
 * - 不在 keydown 内做持久化与重计算
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CloseCircleFilled, CheckCircleFilled, EyeOutlined } from '@ant-design/icons';
import VirtualKeyboard, { type KeyState } from './VirtualKeyboard';
import MetricsBar from './MetricsBar';
import type { MetricsSnapshot } from '../utils/wubi/metrics';
import type { SessionState } from '../utils/wubi/session';
import { FINGER_LABELS, getKeyMeta, type WubiKey } from '../data/radicals';
import { MOTION } from '../utils/wubi/motion';

interface PracticeBoardProps {
  session: SessionState;
  metrics: MetricsSnapshot;
  /** 是否显示虚拟键盘 */
  showVirtualKeyboard: boolean;
  /** 是否显示指标条 */
  showMetricsBar: boolean;
  /** 是否冻结指标（会话结束） */
  frozen: boolean;
  /** 点击「看拆字」 */
  onOpenSplitDemo: (char: string) => void;
}

const PracticeBoard: React.FC<PracticeBoardProps> = ({
  session,
  metrics,
  showVirtualKeyboard,
  showMetricsBar,
  frozen,
  onOpenSplitDemo,
}) => {
  const question = session.currentQuestion;

  /*
   * 动效时长统一走 MOTION（CSS 令牌的 JS 镜像）。
   *
   * 并且必须自己判断「减弱动效」：CSS 侧的 @media (prefers-reduced-motion)
   * 拦不住 framer-motion —— 它写的是行内样式，不走 CSS 动画那条路。
   */
  const reduceMotion = useReducedMotion();
  const promptRef = useRef<HTMLDivElement>(null);

  /*
   * 速度单位跟着口径走：题源声明了字数就是「字/分」，
   * 键位 / 字根类练习（charCount = 0）回退成「题/分」。
   */
  const speedUnit = (question?.charCount ?? 0) > 0 ? '字/分' : '题/分';

  /*
   * 错误闪动：命令式更新（避免 React 重渲染）。
   *
   * !! 错误态结束时必须**立刻**摘掉 class !!
   *
   * 只靠 400ms 定时器复位的写法有个坑：用户在 400ms 内按对键重试时，
   * 依赖变化会先触发 cleanup 把定时器清掉，而新一轮里 inErrorState 已是
   * false、走不到 addClass 分支 —— 结果 class 永远留在元素上，
   * 题目字符一直红着（实测反馈：「按错了后重按正确的还是标红」）。
   */
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;

    if (!session.inErrorState) {
      el.classList.remove('wt-practice__prompt--error');
      return;
    }

    /*
     * 重放抖动动画：同一元素上重复 add 同名 class 不会重启 CSS 动画，
     * 因此先摘掉、强制重排、再挂上，连续点错时才看得出「又错了一次」。
     */
    el.classList.remove('wt-practice__prompt--error');
    void el.offsetWidth;
    el.classList.add('wt-practice__prompt--error');

    const timer = setTimeout(() => {
      el.classList.remove('wt-practice__prompt--error');
    }, 400);
    return () => clearTimeout(timer);
  }, [session.inErrorState, session.errorKeystrokes]);

  // 计算键盘状态
  const keyStates = React.useMemo<Record<string, KeyState>>(() => {
    if (!question) return {};

    const states: Record<string, KeyState> = {};

    // 已键入的键：置灰
    session.inputKeys.forEach((k) => {
      states[k] = { ...states[k], isPressed: true };
    });

    // 当前目标键
    const nextExpectedKey = question.answerKeys[session.inputKeys.length];
    if (nextExpectedKey) {
      states[nextExpectedKey] = { ...states[nextExpectedKey], isTarget: true };
    }

    return states;
  }, [question, session.inputKeys]);

  // interactive 模式下点击虚拟键盘（备选输入路径，主路径是物理键盘）。
  // 此处不做处理：点击只用于视觉反馈，实际输入一律由物理键盘驱动。
  const handleKeyClick = useCallback(() => {}, []);

  if (!question) return null;

  const targetKey = question.answerKeys[session.inputKeys.length];
  const targetMeta = targetKey ? getKeyMeta(targetKey as WubiKey) : null;

  return (
    <div className="wt-practice">
      {/* 题目区 */}
      <div className="wt-practice__prompt-area">
        <div ref={promptRef} className="wt-practice__prompt">
          {question.prompt}
        </div>

        {/*
          有 altAnswers（简码模式）时，下面会渲染一条带对勾图标的简码提示，
          文案与这里完全相同 —— 两处都渲染会让同一句话在题目上下各出现一次。
          简码提示放在编码槽下方更贴近「打完这一码」的语境，因此这里让位。
        */}
        {question.hint && !question.altAnswers && (
          <div className="wt-practice__hint">{question.hint}</div>
        )}

        {/* 编码进度 */}
        <div className="wt-practice__code-progress">
          {question.answerKeys.map((expectedKey, idx) => {
            const typed = session.inputKeys[idx];
            const isCurrent = idx === session.inputKeys.length;
            const isTyped = typed !== undefined;

            let cls = 'wt-practice__code-slot';
            if (isTyped) cls += ' wt-practice__code-slot--filled';
            if (isCurrent) cls += ' wt-practice__code-slot--current';

            return (
              <div key={idx} className={cls}>
                {isTyped ? expectedKey.toUpperCase() : isCurrent && !frozen ? '·' : ''}
              </div>
            );
          })}
        </div>

        {/* 错误反馈 */}
        {session.inErrorState && (
          <motion.div
            className="wt-practice__error-feedback"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : MOTION.base }}
          >
            <CloseCircleFilled className="wt-practice__error-icon" />
            <span>按错了，正确是</span>
            {targetMeta && (
              <span className="wt-practice__error-key">
                {targetKey?.toUpperCase()}
              </span>
            )}
            <span className="wt-practice__error-finger">
              （{targetMeta ? FINGER_LABELS[targetMeta.finger] : '—'}）
            </span>
            <span className="wt-practice__retry-hint">按任意键重新作答</span>
            <button
              className="wt-practice__split-btn"
              onClick={() => onOpenSplitDemo(question.prompt)}
            >
              <EyeOutlined /> 看拆字
            </button>
          </motion.div>
        )}

        {/* 简码提示 */}
        {question.altAnswers && !session.inErrorState && (
          <div className="wt-practice__simplified-hint">
            <CheckCircleFilled /> {question.hint}
          </div>
        )}
      </div>

      {/* 指标条 */}
      {showMetricsBar && (
        <MetricsBar metrics={metrics} frozen={frozen} speedUnit={speedUnit} />
      )}

      {/* 虚拟键盘 */}
      {showVirtualKeyboard && (
        <VirtualKeyboard
          keyStates={keyStates}
          mode="readonly"
          onKeyClick={handleKeyClick}
        />
      )}
    </div>
  );
};

export default PracticeBoard;
