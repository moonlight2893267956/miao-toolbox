/**
 * 查码讲解台（右侧栏）。
 *
 * 结构：锚点栏 → 会话轨（轮次记录）→ 输入区。
 *
 * ── 会话轨是什么 ──
 *
 * 左侧一条细轨，每个轮次一个节点：首轮是**田字格字形块**（这个会话锚定的字），
 * 追问是小圆点，最新一轮高亮。它同时承担两个作用：
 *   · 让「这是同一个字的逐层追问」在视觉上成立（而不是一堆无主气泡）；
 *   · 换字时一眼看到锚点变了 —— 这正是会话切换的边界。
 *
 * ── 这里不做的三件事 ──
 *
 * · 不自动重试：AI 配置有问题时重试一百次也一样，明确说明比转圈诚实。
 * · 不隐藏失败：任何一步失败都留一条记录，并在同一位置给出可继续的动作。
 * · 不为了好看牺牲可用性：等待超过 8s / 28s 各补一句为什么慢，并始终可取消。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useReducedMotion } from 'framer-motion';
import type { UseWubiExplainChatResult } from '../../utils/wubi/useWubiAI';
import { latestAssistantTurnId } from '../../utils/wubi/explainChat';
import { buildQuickAsks } from '../../utils/wubi/explainQuestions';
import { phraseOriginLabel } from '../../utils/wubi/phraseExplain';
import ChatTurn from './ChatTurn';
import ExecTraceView from './ExecTrace';
import ChatComposer from './ChatComposer';

interface ExplainConsoleProps {
  chat: UseWubiExplainChatResult;
  /** 选中字后是否自动开始讲解（用户可关，避免「悄悄花钱」） */
  autoExplain: boolean;
  onToggleAutoExplain: (next: boolean) => void;
  /** 打开拆分演示弹层（AI 讲不清的地方仍以确定性拆分视图为准） */
  onOpenSplitDemo?: (char: string) => void;
}

/** 等待超过这个时长就补一句「为什么慢」 */
const SLOW_MS = 8_000;
const VERY_SLOW_MS = 28_000;

const ExplainConsole: React.FC<ExplainConsoleProps> = ({
  chat,
  autoExplain,
  onToggleAutoExplain,
  onOpenSplitDemo,
}) => {
  const {
    thread,
    activeChar,
    aiUnavailable,
    notice,
    dismissNotice,
    startExplain,
    ask,
    restart,
    cancel,
    busy,
    hasAnswer,
    turnCount,
    exec,
    followupEnabled,
  } = chat;

  const reduceMotion = useReducedMotion() ?? false;

  // ── 等待阶段提示：慢也要慢得明白 ──
  // 复位放在 cleanup 里：effect 体内直接 setState 会触发级联渲染
  const [stage, setStage] = useState<'working' | 'slow' | 'very-slow'>('working');
  useEffect(() => {
    if (!busy) return;
    const t1 = window.setTimeout(() => setStage('slow'), SLOW_MS);
    const t2 = window.setTimeout(() => setStage('very-slow'), VERY_SLOW_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      setStage('working');
    };
  }, [busy]);

  // ── 新轮次到达时滚到底：否则点了发送却看不到回答 ──
  const threadRef = useRef<HTMLDivElement>(null);
  const turnCountNow = thread?.turns.length ?? 0;
  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [turnCountNow, busy, reduceMotion]);

  const quickAsks = useMemo(
    () =>
      buildQuickAsks({
        params: thread?.params ?? null,
        positions: thread?.positions ?? [],
        asked: thread?.asked ?? [],
      }),
    [thread?.params, thread?.positions, thread?.asked],
  );

  const latestId = latestAssistantTurnId(thread);

  /*
   * 词组锚点的展示材料：规则名 + 逐位来源（「第 N 位（字 X 第 j 码）」）。
   *
   * 来源**由事实算出**（规则的产物），不是模型说的 —— 所以它挂在锚点上、
   * 每轮都原样标注，用来对照模型正文里对某一位的说明是不是讲到了正确的那个字。
   * 单字锚点没有这一层，这里给 null，ChatTurn 相应不渲染（单字链路零改动）。
   */
  const phraseParams = thread?.params?.task === 'explain-phrase' ? thread.params : null;
  const phraseRule = thread?.kind === 'phrase' ? thread.ruleLabel : null;
  const phraseInfo = useMemo(
    () =>
      phraseParams
        ? {
            ruleLabel: phraseRule,
            origins: phraseParams.positions
              .map((_, i) => phraseOriginLabel(phraseParams, i))
              .filter((label): label is string => Boolean(label)),
          }
        : null,
    [phraseParams, phraseRule],
  );

  const handleRetryQuestion = useCallback((q: string) => ask(q), [ask]);

  // ── 未选锚点：说明这个台子是干什么的 ──
  if (!activeChar || !thread) {
    return (
      <aside className="wt-chat" aria-label="AI 讲解台">
        <div className="wt-chat__empty">
          <div className="wt-chat__empty-glyph" aria-hidden="true">
            字
          </div>
          <p className="wt-chat__empty-title">选一个汉字或词组，讲解会在这里开始</p>
          <p className="wt-chat__empty-desc">
            点左侧结果里的任意汉字，AI 会讲清它为什么这么拆；
            点词组那一行，则会讲清它的取码规则（每个字取前几码、每一位取自哪个字）。
            之后可以继续追问「为什么取这个字根」、「不对，应该是另一个」。
            讲解只作参照，编码与拆分以左侧码表结果为准。
          </p>
          <label className="wt-chat__switch">
            <input
              type="checkbox"
              checked={autoExplain}
              onChange={(e) => onToggleAutoExplain(e.target.checked)}
            />
            <span>选中后自动开始讲解</span>
          </label>
        </div>
      </aside>
    );
  }

  const isPhrase = thread.kind === 'phrase';
  // 锚点块是 40px 的方形：词组太窄放不下，取首字并另挂「词组」标记
  const anchorGlyph = isPhrase ? Array.from(thread.char)[0] ?? thread.char : thread.char;
  const showSkeleton = thread.status === 'loading' && thread.turns.length === 0;

  return (
    <aside className="wt-chat" aria-label="AI 讲解台">
      {/* ── 锚点栏 ── */}
      <header className="wt-chat__head">
        <span
          className={`wt-chat__anchor${isPhrase ? ' wt-chat__anchor--phrase' : ''}`}
          aria-hidden="true"
        >
          {anchorGlyph}
        </span>
        <div className="wt-chat__meta">
          <span className="wt-chat__anchor-line">
            <span className="wt-chat__anchor-text">{thread.char}</span>
            {isPhrase && <span className="wt-chat__anchor-flag">词组</span>}
          </span>
          <span className="wt-chat__anchor-sub">
            {/*
              词组要先把「规则」摆出来：讲解里每一句都在讲某一位，而每一位之所以
              是它，全由这条规则决定。规则名与词表码并列，学员才能自己复核。
            */}
            {isPhrase && thread.ruleLabel && (
              <span className="wt-chat__rule">{thread.ruleLabel}</span>
            )}
            <code className="wt-chat__code">{thread.code}</code>
            <span className="wt-chat__turn-count">
              {turnCount > 0 ? `已完成 ${turnCount} 轮` : '尚未开始'}
            </span>
          </span>
        </div>
        <div className="wt-chat__actions">
          {/* 词组没有「拆分演示」这回事（它不是靠字根拼出来的，是靠规则取码）*/}
          {onOpenSplitDemo && !isPhrase && (
            <button
              type="button"
              className="wt-chat__action"
              onClick={() => onOpenSplitDemo(thread.char)}
              title="打开拆分演示（播放字根拆分动画）"
            >
              拆分
            </button>
          )}
          <button
            type="button"
            className="wt-chat__action"
            onClick={restart}
            disabled={busy || thread.turns.length === 0}
            title={isPhrase ? '清空这个词组的对话，重新讲一遍' : '清空当前字的对话，重新讲一遍'}
          >
            新会话
          </button>
        </div>
      </header>

      {thread.historyTruncated && (
        <p className="wt-chat__hint">上下文较长，平台只注入了最近若干轮历史。</p>
      )}

      {aiUnavailable && (
        <p className="wt-chat__hint wt-chat__hint--warn">
          <AlertOutlined /> AI 讲解当前不可用（{aiUnavailable}）。查码、拆分演示与练习不受影响。
        </p>
      )}

      {notice && (
        <p className="wt-chat__hint wt-chat__hint--warn">
          {notice}
          <button type="button" className="wt-chat__hint-close" onClick={dismissNotice} aria-label="关闭提示">
            <CloseCircleOutlined />
          </button>
        </p>
      )}

      {/* ── 会话轨 ── */}
      <div className="wt-chat__thread" ref={threadRef} role="log" aria-live="polite">
        {thread.turns.map((turn) => (
          <ChatTurn
            key={turn.id}
            turn={turn}
            animate={turn.id === latestId}
            reduceMotion={reduceMotion}
            nodeGlyph={anchorGlyph}
            phrase={phraseInfo}
            onRetry={handleRetryQuestion}
          />
        ))}

        {/*
          等待期的两种形态：
          · 已收到执行事件 → 过程轨（用户能看到「在调什么、多久」）；
          · 还没收到（老版本 agent / 事件还没到）→ 骨架 + 分阶段文案兜底。
          过程轨是**增强**：没有它时体验与之前完全一致，不能因为缺事件就空等。
        */}
        {/*
          等待中 + 失败态都展示：失败时过程轨是**唯一的诊断线索**
          （用户能看到「卡在联网检索」还是「模型第二次尝试被拒」）。
          只在「已成功收场」时收回 —— 那时结论已经完整，过程不再需要。
        */}
        {!hasAnswer && exec.entries.length + exec.notes.length > 0 && (
          <ExecTraceView trace={exec} busy={busy} reduceMotion={reduceMotion} />
        )}

        {/*
          有过程轨时不再画骨架：两条「正在加载」并列是冗余，而且过程轨的信息
          严格更强（哪一步、多久）。骨架只在**还没收到任何事件**时兜底。
        */}
        {showSkeleton && exec.entries.length === 0 && exec.notes.length === 0 && (
          <div className="wt-chat__turn wt-chat__turn--answer">
            <div className="wt-chat__skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="wt-chat__stage">
              {stage === 'working'
                && (isPhrase
                  ? '正在对照取码规则核对这个词组的取码…'
                  : '正在对照字根表核对这个字的拆法…')}
              {stage === 'slow' && '首次调用要预热模型，通常十几到几十秒 —— 这次会稍久一点。'}
              {stage === 'very-slow' && '仍在核对，可以继续等，也可以点「取消」稍后再来。'}
            </p>
          </div>
        )}

        {/*
          失败态：给出重试入口。AI 配置性不可用时也给 ——
          配置修好后刷新页面才能重试，是没有必要的代价。
        */}
        {!showSkeleton && !busy && !hasAnswer && (thread.status === 'error' || aiUnavailable) && (
          // 单独一个类：它是「动作」不是「记录」，与提示轮区分开（否则统计与样式都会混淆）
          <div className="wt-chat__turn wt-chat__turn--retry">
            <button type="button" className="wt-chat__retry" onClick={startExplain}>
              重试讲解
            </button>
          </div>
        )}

        {!showSkeleton && !hasAnswer && !busy && !aiUnavailable && thread.status !== 'error' && (
          <div className="wt-chat__manual">
            <button type="button" className="wt-chat__start" onClick={startExplain}>
              开始讲解「{thread.char}」
            </button>
          </div>
        )}
      </div>

      {/* ── 输入区 ── */}
      <ChatComposer
        disabled={Boolean(aiUnavailable) || !hasAnswer}
        busy={busy}
        quickAsks={hasAnswer ? quickAsks : []}
        placeholder={followupEnabled
          ? (isPhrase ? '继续追问这个词组…' : '继续追问这个字…')
          : '当前会话未启用多轮追问'}
        autoExplain={autoExplain}
        onToggleAutoExplain={onToggleAutoExplain}
        onSend={ask}
        onCancel={cancel}
      />
    </aside>
  );
};

export default ExplainConsole;
