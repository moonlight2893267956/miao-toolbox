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

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { splitChar, describeSplit, type SplitResult } from '../utils/wubi/splitter';
import { parseChar, getSimplifiedCodes, type CharMap } from '../utils/wubi/code';
import { useWubiAI } from '../utils/wubi/useWubiAI';
import { isExplanationDisplayable } from '../utils/wubi/aiExplain';
import { MOTION, STAGGER } from '../utils/wubi/motion';

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
  open, char, onClose, onAddToReview, charMap,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  /*
   * AI 解释：可选增强。
   *
   * 只有点按钮才会请求 —— 不进任何热路径，也不在打开弹层时自动触发：
   * 这个模块对用户的核心承诺是「能练」，AI 只是锦上添花，
   * 不该为它付出等待、额度或隐私上的代价。
   */
  const {
    explainSplit, reset: resetAi,
    loading: aiLoading,
    result: aiResult, error: aiError,
  } = useWubiAI();

  /** 校验通过的解释才展示；没通过一律退回确定性视图 */
  const aiDisplayable = isExplanationDisplayable(aiResult);

  /**
   * 未能展示时的原因（三级兜底）。
   *
   * 只显示「没通过核对」而不说原因，等于把排查成本转给用户 ——
   * 而这三种原因的处理方式完全不同：
   *   前端校验的违规 → agent 挑错了字根（改提示词）
   *   agent 自校验的违规 → 同上，且能看到它试述的文件名/原因
   *   agent 的 error   → 服务侧问题（模型未配置 / 输出非法 JSON / 输入不合法）
   */
  const aiFailureReason = aiDisplayable
    ? null
    : aiResult?.validation?.violations[0]
      ?? aiResult?.selfCheck?.violations?.[0]
      ?? aiResult?.error
      ?? null;

  /** 用户开了「减少动态效果」就一律不做位移/渐入 —— 动效永远不该是可用性的前提 */
  const reduceMotion = useReducedMotion() ?? false;

  /** 解释按句切开，逐句浮现：比整块蹦出来更像「说给你听」，也让等待有个交代 */
  const explanationSentences = useMemo(() => {
    const text = aiResult?.explanation ?? '';
    return text
      .split(/(?<=[。！？；])/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [aiResult]);

  const aiSuggestions = aiResult?.suggestions ?? [];

  /**
   * 等待超过 8 秒就补一句「为什么慢」。
   *
   * 首次调用要预热模型，实测可能十几到几十秒 —— 只显示「正在分析」会让人以为卡死。
   * 与其让用户对着不动的界面猜，不如主动交代：慢是正常的，且会慢多久。
   */
  const [aiSlow, setAiSlow] = useState(false);
  useEffect(() => {
    if (!aiLoading) {
      setAiSlow(false);
      return;
    }
    const timer = setTimeout(() => setAiSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [aiLoading]);

  /**
   * 有结果（成功或失败）后把它滚进视野。
   *
   * AI 区在整个可滚动正文的最底部 —— 不滚过去，用户点了按钮却看不到任何东西，
   * 只会以为「没反应」。这是本次最实际的一处可用性修复。
   */
  const aiPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aiDisplayable && !aiError && !aiFailureReason) return;
    aiPanelRef.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [aiDisplayable, aiError, aiFailureReason, reduceMotion]);

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

  // 重置动画状态；换字或重开时连同上一次的 AI 解释一起清掉
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setIsPlaying(false);
      resetAi();
    }
  }, [open, char, resetAi]);

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
              AI 解释区（整体一块，ref 用于结果到达后滚进视野）。
              三种收场都落在「用户仍有东西可看」上：
                生成中 → 骨架占位 + 分阶段提示（慢也要慢得明白）
                成功   → 逐句浮现的解释 + 逐条滑入的提醒
                失败   → 明确说明原因，并退回上方候选字根
            */}
            <div className="wt-split-demo__ai-wrap" ref={aiPanelRef}>
              {aiLoading && (
                <div className="wt-split-demo__ai">
                  <div className="wt-split-demo__ai-head">
                    <span className="wt-split-demo__ai-title">AI 解释</span>
                    <span className="wt-split-demo__ai-badge">分析中</span>
                  </div>
                  {/* 骨架先占住结果的位置，答案到达时整块不会跳 */}
                  <div className="wt-split-demo__ai-skeleton" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <p className="wt-split-demo__ai-hint">
                    {aiSlow
                      ? '首次调用要预热模型，通常十几到几十秒 —— 这次会稍久一点。'
                      : '正在对照字根表核对这个字的拆法…'}
                  </p>
                </div>
              )}

              {!aiLoading && aiDisplayable && (
                <motion.div
                  className="wt-split-demo__ai"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : MOTION.slow, ease: 'easeOut' }}
                >
                  <div className="wt-split-demo__ai-head">
                    <span className="wt-split-demo__ai-title">AI 解释</span>
                  </div>
                  {explanationSentences.map((sentence, idx) => (
                    <motion.p
                      key={idx}
                      className="wt-split-demo__ai-text"
                      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduceMotion ? 0 : MOTION.slow, delay: idx * STAGGER.sentence, ease: 'easeOut' }}
                    >
                      {sentence}
                    </motion.p>
                  ))}
                  {aiSuggestions.length > 0 && (
                    <ul className="wt-split-demo__ai-suggestions">
                      {aiSuggestions.map((s, idx) => (
                        <motion.li
                          key={idx}
                          initial={reduceMotion ? false : { opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            duration: reduceMotion ? 0 : MOTION.slow,
                            // 排在解释之后，形成「先讲完再叮嘱」的节奏
                            delay: explanationSentences.length * STAGGER.sentence
                              + idx * STAGGER.item,
                          }}
                        >
                          {s}
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              )}

              {!aiLoading && (aiError || (aiResult && !aiDisplayable)) && (
                <motion.div
                  className="wt-split-demo__ai wt-split-demo__ai--fallback"
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduceMotion ? 0 : MOTION.slow }}
                >
                  {aiError
                    ? `AI 解释暂时不可用（${aiError}），可对照上方的候选字根分析。`
                    : `这次解释没通过与字根表的核对${aiFailureReason ? `（${aiFailureReason}）` : ''}，已按上方的候选字根为准。`}
                </motion.div>
              )}
            </div>
          </div>

          {/* 底部操作栏 */}
          <div className="wt-split-demo__footer">
            <button
              className="wt-split-demo__btn wt-split-demo__btn--play"
              onClick={isPlaying ? handleReplay : handlePlay}
            >
              {isPlaying ? '重放' : '播放动画'}
            </button>
            {/*
              只在用户点它时才请求 AI。不自动触发、不预取 ——
              拆字解释是「我想弄明白」的动作，不是每次看字都要付费的动作。
            */}
            <button
              className="wt-split-demo__btn wt-split-demo__btn--ai"
              onClick={() => result && explainSplit(result)}
              disabled={!result || aiLoading}
              // 转圈由 CSS 的 [data-loading='true']::before 提供，不用额外元素
              data-loading={aiLoading ? 'true' : undefined}
            >
              {aiLoading ? '解释中…' : 'AI 解释'}
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
