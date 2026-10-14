/**
 * 拆字演示弹层 SplitDemo
 *
 * 受控组件：open / char / onClose 由页面 reducer 驱动。
 *
 * 展示流程：
 * 整字 → 拆分序列（逐字根）→ 每个字根的键位 → 完整编码 → 简码
 *
 * - 使用 framer-motion 做逐步播放动画（每段 ≤ 300ms）
 * - 三态标注：resolved / ambiguous / unsupported
 * - notes 显式标注键名字/成字字根/识别码/简码
 * - 提供「加入难字本」动作
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { splitChar, describeSplit, type SplitResult } from '../utils/wubi/splitter';
import { parseChar, getSimplifiedCodes, type CharMap } from '../utils/wubi/code';
import { MOTION } from '../utils/wubi/motion';

interface SplitDemoProps {
  /** 是否打开 */
  open: boolean;
  /** 目标汉字 */
  char: string | null;
  /** 关闭回调 */
  onClose: () => void;
  /** 加入难字本回调 */
  onAddToReview?: (char: string) => void;
  /**
   * 「去讲解台追问」回调（Story 5.5）。
   *
   * 弹层里不再放追问输入框：多轮对话需要一个能持续看结果的台面，
   * 而不是一个滚到底才能看见输入框的弹层。这里只负责**交接** ——
   * 关掉弹层、切到查码 Tab、把当前字锚定到讲解台。
   */
  onOpenExplain?: (char: string) => void;
  /**
   * 字编码映射。
   *
   * !! 必须由外部传入，不能在此静态 import chars.json !!
   * 静态导入会让 13 万条码表被打进工具主包（实测主包 gzip 148KB → 目标 ≤60KB），
   * 并使 Story 3.1 的懒加载门控完全失效。
   */
  charMap: CharMap | null;
}

const ANIMATION_STEP_MS = 300;

const SplitDemo: React.FC<SplitDemoProps> = ({
  open, char, onClose, onAddToReview, onOpenExplain, charMap,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  /** 用户开了「减少动态效果」就一律不做位移/渐入 —— 动效永远不该是可用性的前提 */
  const reduceMotion = useReducedMotion() ?? false;

  const result: SplitResult | null = useMemo(() => {
    if (!char || !charMap) return null;

    const charCode = parseChar(char, charMap);
    if (!charCode) {
      // 未收录的字
      return null;
    }

    return splitChar(char, charCode.code);
  }, [char, charMap]);

  const simplifiedInfo = useMemo(() => {
    if (!char || !charMap) return null;
    return getSimplifiedCodes(char, charMap);
  }, [char, charMap]);

  // 重置动画状态；换字或重开时回到第一步
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setIsPlaying(false);
    }
  }, [open, char]);

  // 自动播放
  useEffect(() => {
    if (!isPlaying || !result) return;

    const totalSteps = result.segments.length + 1; // +1 for final code
    if (currentStep >= totalSteps) {
      setIsPlaying(false);
      return;
    }

    const timer = setTimeout(() => {
      setCurrentStep((s) => s + 1);
    }, ANIMATION_STEP_MS);

    return () => clearTimeout(timer);
  }, [isPlaying, currentStep, result]);

  const handlePlay = useCallback(() => {
    setCurrentStep(0);
    setIsPlaying(true);
  }, []);

  const handleReplay = useCallback(() => {
    setCurrentStep(0);
    setIsPlaying(true);
  }, []);

  const handleAddToReview = useCallback(() => {
    if (char && onAddToReview) {
      onAddToReview(char);
    }
  }, [char, onAddToReview]);

  if (!open || !char) return null;

  // 码表尚未加载完（弹层在打开时才触发加载）
  if (!charMap) {
    return (
      <div className="wt-split-demo__overlay" onClick={onClose}>
        <div className="wt-split-demo__modal" onClick={(e) => e.stopPropagation()}>
          <div className="wt-split-demo__body">
            <div className="wt-tutorial__loading">
              <div className="wt-tutorial__loading-spinner" />
              <p>正在加载码表…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 未收录
  if (!result) {
    return (
      <AnimatePresence>
        <motion.div
          className="wt-split-demo__overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : MOTION.slow }}
          onClick={onClose}
        >
          <motion.div
            className="wt-split-demo__modal"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ duration: reduceMotion ? 0 : MOTION.slow }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wt-split-demo__header">
              <h3>拆字演示</h3>
              <button className="wt-split-demo__close" onClick={onClose}>×</button>
            </div>
            <div className="wt-split-demo__body">
              <div className="wt-split-demo__unsupported">
                <div className="wt-split-demo__char-display">{char}</div>
                <p>码表未收录该字，暂无法提供拆分演示。</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  const totalSteps = result.segments.length + 1; // segments + final code

  return (
    <AnimatePresence>
      <motion.div
        className="wt-split-demo__overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : MOTION.slow }}
        onClick={onClose}
      >
        <motion.div
          className="wt-split-demo__modal"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          transition={{ duration: reduceMotion ? 0 : MOTION.slow }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="wt-split-demo__header">
            <h3>拆字演示</h3>
            <button className="wt-split-demo__close" onClick={onClose}>×</button>
          </div>

          {/* 主体 */}
          <div className="wt-split-demo__body">
            {/* 整字展示 */}
            <div className="wt-split-demo__char-display">{char}</div>

            {/* 拆分序列 */}
            <div className="wt-split-demo__segments">
              {result.segments.map((seg, idx) => (
                <motion.div
                  key={idx}
                  className={`wt-split-demo__segment${
                    currentStep > idx ? ' wt-split-demo__segment--active' : ''
                  }`}
                  initial={{ opacity: 0.3, scale: 0.8 }}
                  animate={{
                    opacity: currentStep > idx ? 1 : 0.3,
                    scale: currentStep > idx ? 1 : 0.8,
                  }}
                  transition={{ duration: reduceMotion ? 0 : MOTION.base }}
                >
                  <div className="wt-split-demo__segment-radical">
                    {/*
                      三态展示（对照视图）：
                      1. 规则字（键名字 / 成字字根）—— 角色即答案：键名码 / 首笔 / 补位…
                      2. 能确定字根的位 —— 直接给字根
                      3. 其余 —— 列出该键**全部**候选字根，由用户对照字形挑选
                    */}
                    {seg.role ? (
                      <span className="wt-split-demo__role">{seg.role}</span>
                    ) : seg.certain ? (
                      seg.certain.glyph
                    ) : seg.candidates.length > 0 ? (
                      <span className="wt-split-demo__ambiguous">
                        {seg.candidates.map((c) => c.glyph).join('/')}
                      </span>
                    ) : (
                      <span className="wt-split-demo__unknown">?</span>
                    )}
                  </div>
                  <div className="wt-split-demo__segment-key">
                    {seg.key.toUpperCase()}
                  </div>
                </motion.div>
              ))}

              {/* 编码展示 */}
              <motion.div
                className={`wt-split-demo__code${
                  currentStep >= totalSteps ? ' wt-split-demo__code--active' : ''
                }`}
                initial={{ opacity: 0.3 }}
                animate={{ opacity: currentStep >= totalSteps ? 1 : 0.3 }}
                transition={{ duration: reduceMotion ? 0 : MOTION.base }}
              >
                <div className="wt-split-demo__code-label">编码</div>
                <div className="wt-split-demo__code-value">{result.code}</div>
              </motion.div>
            </div>

            {/* 状态标注 */}
            <div className="wt-split-demo__status">
              {result.status === 'resolved' && (
                <span className="wt-split-demo__status-badge wt-split-demo__status-badge--resolved">
                  ✓ 已解析
                </span>
              )}
              {result.status === 'ambiguous' && (
                <span className="wt-split-demo__status-badge wt-split-demo__status-badge--ambiguous">
                  ⚠ 存在歧义
                </span>
              )}
              {result.status === 'unsupported' && (
                <span className="wt-split-demo__status-badge wt-split-demo__status-badge--unsupported">
                  ✗ 暂不支持
                </span>
              )}
            </div>

            {/* notes 标注 */}
            {result.notes.length > 0 && (
              <div className="wt-split-demo__notes">
                {result.notes.map((note, idx) => (
                  <div key={idx} className={`wt-split-demo__note wt-split-demo__note--${note.type}`}>
                    <span className="wt-split-demo__note-icon">
                      {note.type === 'keyName' && '🔑'}
                      {note.type === 'selfRadical' && '📝'}
                      {note.type === 'identificationCode' && '🎯'}
                      {note.type === 'simplified' && '⚡'}
                    </span>
                    <span className="wt-split-demo__note-text">{note.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 简码信息 */}
            {simplifiedInfo?.simplifiedCode && (
              <div className="wt-split-demo__simplified">
                <span className="wt-split-demo__simplified-label">简码：</span>
                <span className="wt-split-demo__simplified-code">
                  {simplifiedInfo.simplifiedCode}
                </span>
                <span className="wt-split-demo__simplified-level">
                  ({simplifiedInfo.simplifiedLevel}级)
                </span>
              </div>
            )}

            {/* unsupported 降级提示 */}
            {result.status === 'unsupported' && (
              <div className="wt-split-demo__fallback">
                <p>暂无法自动拆分，可对照字根表分析。</p>
                <p className="wt-split-demo__fallback-hint">
                  描述：{describeSplit(result)}
                </p>
              </div>
            )}

            {/* ambiguous 候选展示 */}
            {result.status === 'ambiguous' && (
              <div className="wt-split-demo__ambiguous-detail">
                <p>逐位候选字根：</p>
                {result.segments.map((seg, idx) =>
                  seg.candidates.length > 1 ? (
                    <div key={idx} className="wt-split-demo__ambiguous-item">
                      第{idx + 1}位「{seg.key.toUpperCase()}」可能是：
                      {seg.candidates.map((c) => c.glyph).join(' / ')}
                    </div>
                  ) : null,
                )}
              </div>
            )}

            {/*
              AI 讲解不再挂在这个弹层里（Story 5.5）。
              多轮追问需要一个能持续看结果的台面，而弹层里输入框在滚动区最底部，
              回答一长就被推到视野之外；同一功能两处实现也迟早各自演化。
              这里只留一个交接入口，由查码 Tab 的讲解台接手。
            */}
            {onOpenExplain && (
              <div className="wt-split-demo__explain-entry">
                <p className="wt-split-demo__explain-text">
                  想弄明白「为什么这么拆」、或者追问「换另一个字根行不行」？
                </p>
                <button
                  type="button"
                  className="wt-split-demo__explain-btn"
                  onClick={() => onOpenExplain(char)}
                >
                  去讲解台追问 →
                </button>
              </div>
            )}
          </div>

          {/* 底部操作栏 */}
          <div className="wt-split-demo__footer">
            <button
              className="wt-split-demo__btn wt-split-demo__btn--play"
              onClick={isPlaying ? handleReplay : handlePlay}
            >
              {isPlaying ? '重放' : '播放动画'}
            </button>
            {onAddToReview && (
              <button
                className="wt-split-demo__btn wt-split-demo__btn--review"
                onClick={handleAddToReview}
              >
                加入难字本
              </button>
            )}
            <button
              className="wt-split-demo__btn wt-split-demo__btn--close"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SplitDemo;
