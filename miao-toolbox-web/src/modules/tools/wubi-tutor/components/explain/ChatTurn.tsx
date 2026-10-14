/**
 * 讲解台的一轮。
 *
 * ── 为什么不用聊天气泡 ──
 *
 * 这是「同一个字被逐层问清楚」的记录，不是两个人的闲聊：气泡排版会把
 * 依据、未核验断言、位次修正这些**不同可信度的内容**压成一块一样的色块。
 * 所以这里沿会话轨左对齐排布，回答内部再按可信度分层：
 *
 *   正文            —— 人话
 *   依据 citations  —— 逐条可核对（等宽小 chip，能指回历史字段）
 *   未核验 new_claim—— 琥珀色独立块，明确「未经交叉核验」
 *   位次修正 delta  —— 田字格 before → after
 *
 * 颜色的作用只是**辅助**：每一层都有文字标签，去掉颜色仍然可读（NFR-7）。
 */

import React from 'react';
import { motion } from 'framer-motion';
import type { ExplainChatTurn } from '../../utils/wubi/explainChat';
import { splitSentences } from '../../utils/wubi/explainChat';
import { STAGGER } from '../../utils/wubi/motion';

interface ChatTurnProps {
  turn: ExplainChatTurn;
  /** 只有最新一轮做逐句渐入：否则每次追加都会把整屏重放一遍 */
  animate: boolean;
  reduceMotion: boolean;
  /** 首轮节点上显示的字（会话轨的锚点） */
  nodeGlyph?: string;
  /**
   * 词组锚点的事实行（规则名 + 逐位来源）。
   *
   * 由 `ExplainConsole` 从**事实**（`phraseExplain`）算好传进来，不是从模型正文里
   * 抠出来的：模型正文可能把某一位的来源说错，而这一行是规则的产物 ——
   * 两相对照，错的那一句自己就露出来了。单字锚点传 null，本组件相应不渲染。
   */
  phrase?: { ruleLabel: string | null; origins: string[] } | null;
  /** 失败轮的「重试」 */
  onRetry?: (question: string) => void;
}

/**
 * 会话轨上的节点。
 *
 * 首轮是**田字格字形块**（这个会话锚定的字），追问是实心圆点，系统提示是空心小点。
 * 它是「同一个字的逐层追问」在视觉上的凭据 —— 换字时这个块会变，
 * 用户因此知道刚才那串问答属于哪个字，而不必回头找。
 */
const TurnNode: React.FC<{ variant: 'anchor' | 'dot' | 'notice'; glyph?: string }> = ({
  variant,
  glyph,
}) => (
  <span
    className={`wt-chat__node wt-chat__node--${variant}`}
    aria-hidden="true"
  >
    {variant === 'anchor' ? glyph : null}
  </span>
);

/** 回答类型的中文标签：一眼看出这一轮是什么性质 */
function kindLabel(turn: ExplainChatTurn): { text: string; tone: string } {
  if (turn.kind === 'anchor') return { text: '首轮讲解', tone: 'accent' };
  if (turn.kind === 'revise') {
    if (turn.accepted === false) return { text: '修正未采纳', tone: 'warn' };
    return { text: '位次修正', tone: 'accent' };
  }
  /*
   * 模型路径下的改位：agent 只回 kind=reasoned（`_reasoned_output` 不带
   * accepted/glyph），改位是从 positions 的差异里比出来的 —— 所以徽标要看
   * 「这一轮有没有改位」，而不是只看 kind，否则改了位却标成「说明」。
   */
  if (turn.revision) return { text: '位次已有调整', tone: 'accent' };
  if (turn.kind === 'why') return { text: '说明', tone: 'muted' };
  if (turn.kind === 'unknown') return { text: '需澄清', tone: 'warn' };
  return { text: '说明', tone: 'muted' };
}

const ChatTurn: React.FC<ChatTurnProps> = ({
  turn,
  animate,
  reduceMotion,
  nodeGlyph,
  phrase,
  onRetry,
}) => {
  // ── 用户提问 ──
  if (turn.role === 'user') {
    return (
      <div className="wt-chat__turn wt-chat__turn--ask">
        <TurnNode variant="dot" />
        <p className="wt-chat__ask">{turn.question ?? turn.text}</p>
      </div>
    );
  }

  // ── 系统提示（会话过期 / 取消 / 失败） ──
  if (turn.role === 'notice') {
    return (
      <div className="wt-chat__turn wt-chat__turn--notice">
        <TurnNode variant="notice" />
        <p className="wt-chat__notice-text">
          {turn.text}
          {/*
            失败提示只保留最新一条，所以要把「已经试过几次」写出来 ——
            否则重试两次后页面和第一次长得一样，用户会以为点击没生效。
          */}
          {turn.attempt != null && turn.attempt > 1 && (
            <span className="wt-chat__attempt">（第 {turn.attempt} 次尝试）</span>
          )}
        </p>
        {/*
          本地核对没过 ≠ 网络问题：agent 的断言与 86 版候选不符时，重试通常还是同一处不符。
          不把这句话说清楚，用户会一直点「重试讲解」（实测就是这样堆了三条提示）。
        */}
        {turn.failReason === 'validation' && (
          <p className="wt-chat__notice-hint">
            {phrase
              ? '这不是网络问题：agent 挑的字根与这一位（键 / 来源字）的候选不符，重试通常仍是同一处。可看左侧的取码推导行 —— 编码以码表为准。'
              : '这不是网络问题：agent 给出的字根或识别码与 86 版规则不符，重试通常仍是同一处。可先点右上「拆分」看确定性拆分。'}
          </p>
        )}
        {turn.retryQuestion && onRetry && (
          <button
            type="button"
            className="wt-chat__retry"
            onClick={() => onRetry(turn.retryQuestion as string)}
          >
            重试这一问
          </button>
        )}
      </div>
    );
  }

  // ── AI 回答 ──
  const label = kindLabel(turn);
  const sentences = splitSentences(turn.text);
  const showFailBadge = turn.verification === 'failed';
  const showUnverified = turn.verification === 'unverified';
  const isAnchor = turn.kind === 'anchor';

  return (
    <div className="wt-chat__turn wt-chat__turn--answer">
      <TurnNode variant={isAnchor ? 'anchor' : 'dot'} glyph={isAnchor ? nodeGlyph : undefined} />
      <div className="wt-chat__turn-head">
        <span className={`wt-chat__badge wt-chat__badge--${label.tone}`}>{label.text}</span>
        {turn.basedOnTurn != null && turn.basedOnTurn > 0 && (
          <span className="wt-chat__based">基于第 {turn.basedOnTurn} 轮</span>
        )}
        {turn.fallback && <span className="wt-chat__badge wt-chat__badge--muted">离线回答</span>}
        {showFailBadge && <span className="wt-chat__badge wt-chat__badge--fail">未通过核对</span>}
        {showUnverified && !showFailBadge && (
          <span className="wt-chat__badge wt-chat__badge--muted">未附依据</span>
        )}
      </div>

      {/*
        词组：先摆事实再读正文。
        规则行说「每一位是哪个字取的第几码」这件事，来源标注逐位点名 ——
        正文里若把「取自码」说成「取自编」，对着这一行就能看出来。
      */}
      {phrase && (
        <div className="wt-chat__phrase-facts">
          {phrase.ruleLabel && <span className="wt-chat__rule">{phrase.ruleLabel}</span>}
          {phrase.origins.length > 0 && (
            <span className="wt-chat__origins">
              {phrase.origins.map((origin, idx) => (
                <span key={idx} className="wt-chat__origin">
                  {origin}
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      {/* 位次修正：把「日 → 曰」直接摆出来，不用读完整段话才知道改了什么 */}
      {turn.revision && (
        <div
          className={`wt-chat__delta${turn.accepted === false ? ' wt-chat__delta--rejected' : ''}`}
        >
          <span className="wt-chat__delta-from">{turn.revision.from ?? '—'}</span>
          <span className="wt-chat__delta-arrow" aria-hidden="true">
            →
          </span>
          <span className="wt-chat__delta-to">{turn.revision.to}</span>
          <span className="wt-chat__delta-caption">
            第 {turn.revision.index + 1} 位
            {turn.revision.key ? `（键 ${turn.revision.key.toUpperCase()}）` : ''}
            {/*
              候选集必须在两种情况下亮出来：
                · 修正被拒（agent 没迁就）—— 让用户看到「为什么取不到它」
                · 修正被采纳但本地核对不通过 —— 这正是最需要怀疑的一轮，
                  候选集就是证据本身（不在候选里 = 这个字根根本不在该键上）
            */}
            {turn.accepted === false || showFailBadge
              ? ` · 候选：${turn.revision.candidates.join('/') || '无'}`
              : ''}
          </span>
        </div>
      )}

      {sentences.map((sentence, idx) =>
        animate && !reduceMotion ? (
          <motion.p
            key={idx}
            className="wt-chat__text"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: idx * STAGGER.sentence, ease: 'easeOut' }}
          >
            {sentence}
          </motion.p>
        ) : (
          <p key={idx} className="wt-chat__text">
            {sentence}
          </p>
        ),
      )}

      {turn.citations.length > 0 && (
        <div className="wt-chat__cites">
          <span className="wt-chat__cites-label">依据</span>
          {turn.citations.map((c, idx) => (
            <code key={idx} className="wt-chat__cite">
              {c}
            </code>
          ))}
        </div>
      )}

      {turn.newClaims.length > 0 && (
        <div className="wt-chat__claims">
          <span className="wt-chat__claims-label">未经交叉核验</span>
          <ul className="wt-chat__claims-list">
            {turn.newClaims.map((c, idx) => (
              <li key={idx}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ChatTurn;
