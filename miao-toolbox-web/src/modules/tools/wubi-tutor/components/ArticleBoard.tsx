/**
 * 文章练习看板
 *
 * 交互形态参考了「逐字聚焦」型打字练习：
 *
 * 1. **焦点条**（本组件新增）—— 当前字大字展示 + **本字已输入的编码**与进度
 *    （`2 / 4 码`）+ 下一个字预览。
 *    此前只有全篇进度（`12 / 148 键`），用户在长文里既难找到自己在哪，
 *    也不知道当前这个字打了几码 —— 这是文章模式最实际的信息缺口。
 * 2. **行内错误** —— 「按错了，正确是 X」紧贴当前输入，而不是丢到页面底部。
 * 3. **正文** —— 保留全文流式打字（真实文本需要能读前后文才算「真实打字」），
 *    但当前字加了描边环，扫一眼就能定位。
 * 4. **操作条** —— 提示(1) / 看拆字(2) / 键盘开关(3) / 跳过本篇(Ctrl+Enter)。
 * 5. **虚拟键盘**（可折叠，**默认收起**）—— 文章模式此前完全没有键盘图。
 *    键盘高约 240px，展开会把正文挤到只剩两行，而文章模式正要看前后文，
 *    因此默认收起、一键展开。
 *    键盘上只高亮「下一个该按的键」，不标已按键 —— 一篇文章要按上百键，
 *    全标成已按会把整张键盘涂灰，反而失去参照价值。
 * 6. **光标跟随**（**默认关闭**，开关在键盘容器内）—— 它同时管两件事：
 *    ① 正文每敲一键滚到中间；② 键盘上的高亮随之移动。
 *    后者常被忽略：只停掉正文滚动而留下键盘高亮，用户会发现「关了键盘还在动」。
 *    开关放在键盘容器里，因为它管的主要就是这张键盘。
 *
 * 注意：文章练习里**所有字母键都是输入**，因此不能给操作按钮绑定字母快捷键
 * （按 H 会被当作打字）。这里只标注真实存在的快捷键。
 *
 * timed 模式：全文显示、光标跟随、已输入部分按对错着色、不允许退格。
 * 无编码字符渲染为「跳过」态。
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  CloseCircleFilled,
  EyeOutlined,
  BulbOutlined,
  StepForwardOutlined,
  AppstoreOutlined,
  AimOutlined,
} from '@ant-design/icons';
import MetricsBar from './MetricsBar';
import VirtualKeyboard, { type KeyState } from './VirtualKeyboard';
import type { MetricsSnapshot } from '../utils/wubi/metrics';
import type { SessionState } from '../utils/wubi/session';
import { getExpectedKey } from '../utils/wubi/session';
import { FINGER_LABELS, getKeyMeta, type WubiKey } from '../data/radicals';
import { resolveArticleCursor } from '../utils/wubi/articleCursor';

interface ArticleBoardProps {
  session: SessionState;
  metrics: MetricsSnapshot;
  showMetricsBar: boolean;
  frozen: boolean;
  /** 打开拆字演示弹层 */
  onOpenSplitDemo: (char: string) => void;
  /** 跳过当前字（快捷键 Ctrl+Enter） */
  onSkip: () => void;
}

const ArticleBoard: React.FC<ArticleBoardProps> = ({
  session,
  metrics,
  showMetricsBar,
  frozen,
  onOpenSplitDemo,
  onSkip,
}) => {
  const question = session.currentQuestion;
  const cursorRef = useRef<HTMLSpanElement>(null);

  /*
   * 两个视图开关，**都默认关闭**：
   *
   * - 键盘：高约 240px，展开会把正文挤到只剩两行，而文章模式正要读前后文。
   * - 光标跟随：每敲一键就把正文滚到中间，正在读下文时会被反复打断；
   *   文章通常一眼能看完，自动滚动弊大于利。
   *
   * 两者都能在操作条一键切换，需要时再打开即可。
   */
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [followCursor, setFollowCursor] = useState(false);

  /*
   * 提示状态里存的是「提示属于哪个字」（该字编码的起始位），而不是一个布尔值。
   *
   * 这样换字时提示**自动失效**，不需要用 effect 去 setState(false) ——
   * 在 effect 里同步 setState 会触发级联渲染（lint 也会报）。
   * 布尔值方案必须先知道「换了字」再重置，反而绕远。
   */
  const [hintForChar, setHintForChar] = useState<number | null>(null);

  /*
   * 光标跟随滚动。
   *
   * followCursor 也进依赖：把开关打开的**当刻**就应当滚到当前字，
   * 否则用户要先敲下一键才看到效果，会以为开关没生效。
   */
  useEffect(() => {
    if (!followCursor) return;
    cursorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [session.inputKeys.length, followCursor]);

  /*
   * 当前位置解析抽到 articleCursor.ts 并由单测覆盖 ——
   * 区间边界差一位的症状只是界面上一闪而过，靠肉眼抓不住。
   */
  const { spans, current, next, typedCodes, codeTotal, codeTyped, totalKeys } =
    resolveArticleCursor(question?.tokens ?? [], session.inputKeys);

  const totalTyped = session.inputKeys.length;
  const codeText = current?.token.code ?? '';

  const expectedKey = current ? getExpectedKey(question!, totalTyped) : '';
  const expectedMeta = expectedKey ? getKeyMeta(expectedKey as WubiKey) : null;

  // 提示只在「它所属的那个字」上有效
  const hintVisible = current != null && hintForChar === current.start;

  /*
   * 键盘上只标「下一个该按的键」。
   *
   * 不标已按键是有意的：一篇文章要按上百键，全标上会把整张键盘涂灰，
   * 变成一片没有信息的底色；而「下一个键在哪」才是打字时真正需要的参照。
   * 错误态下同一个键仍然是目标键，因此无需额外区分。
   *
   * !! 关掉「光标跟随」时必须把高亮一并关掉 !!
   * 这个高亮会随输入一位位移动 —— 它就是「键盘上的光标跟随」。
   * 只停掉正文滚动而留下高亮，用户会发现开关关了键盘还在动（实测反馈）。
   * 关掉后键盘退化成一张静态字根图（对着找键仍然有用），但不再自己动。
   *
   * 不用 useMemo：current 每次解析都是新对象，依赖恒变，memo 不会命中；
   * 而这里只构造一个单键对象，成本可以忽略。
   */
  const keyStates: Record<string, KeyState> = followCursor && expectedKey
    ? { [expectedKey]: { isTarget: true } }
    : {};

  /*
   * 操作快捷键：1 提示 / 2 看拆字 / 3 开关键盘。
   *
   * 为什么可以用数字键：五笔编码只用到 a~y，而文章练习里**所有字母键都是输入**，
   * 只有数字是空闲的（参考的交互也是数字快捷键）。
   *
   * 已知前提：session 层把 Digit1~5 映射为「重码选择」，但那是空实现
   * （usePracticeSession 的 onSelectCandidate 无操作），所以这里不会与之冲突。
   * 若将来真的实现重码选择，需要重新分配这组快捷键。
   */
  useEffect(() => {
    if (frozen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;

      if (e.code === 'Digit1') {
        e.preventDefault();
        setHintForChar(hintVisible ? null : (current?.start ?? null));
      } else if (e.code === 'Digit2') {
        if (!current) return;
        e.preventDefault();
        onOpenSplitDemo(current.token.char);
      } else if (e.code === 'Digit3') {
        e.preventDefault();
        setKeyboardOpen((v) => !v);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [frozen, hintVisible, current, onOpenSplitDemo]);

  if (!question?.tokens) return null;

  return (
    <div className="wt-article-board">
      {/*
        焦点条：当前字 + 本字编码 + 进度 + 下一个字。
        当前字打完（会话结束）时不渲染，避免出现空壳。
      */}
      {current && !frozen && (
        <div className="wt-article-board__focus">
          <div className="wt-article-board__focus-glyph">{current.token.char}</div>

          <div className="wt-article-board__focus-body">
            <div className="wt-article-board__focus-head">
              <span className="wt-article-board__focus-label">当前输入</span>
              <span className="wt-article-board__focus-count">
                {codeTyped} / {codeTotal} 码
              </span>
            </div>

            <div className="wt-article-board__focus-codes">
              {codeText.split('').map((_, i) => (
                <span
                  key={i}
                  className={
                    'wt-article-board__focus-code'
                    + (i < codeTyped ? ' wt-article-board__focus-code--filled' : '')
                    + (i === codeTyped ? ' wt-article-board__focus-code--current' : '')
                  }
                >
                  {i < codeTyped ? typedCodes[i].toUpperCase() : ''}
                </span>
              ))}
            </div>

            {session.inErrorState ? (
              <div className="wt-article-board__focus-error">
                <CloseCircleFilled />
                <span>按错了，正确是 {expectedKey.toUpperCase()}</span>
                {expectedMeta && (
                  <span className="wt-article-board__focus-finger">
                    （{FINGER_LABELS[expectedMeta.finger]}）
                  </span>
                )}
              </div>
            ) : hintVisible && expectedKey ? (
              <div className="wt-article-board__focus-hint">
                <BulbOutlined />
                <span>
                  这一位是 {expectedKey.toUpperCase()}
                  {expectedMeta && `（${FINGER_LABELS[expectedMeta.finger]}）`}
                </span>
              </div>
            ) : null}
          </div>

          {next && (
            <div className="wt-article-board__focus-next" aria-hidden="true">
              <span className="wt-article-board__focus-next-label">下一个</span>
              <span className="wt-article-board__focus-next-glyph">{next.token.char}</span>
            </div>
          )}
        </div>
      )}

      {/* 正文 */}
      <div className="wt-article-board__text">
        {spans.map(({ token, start, end }, idx) => {
          // 跳过字符
          if (!token.isCodable) {
            return (
              <span key={idx} className="wt-article-board__token wt-article-board__token--skip">
                {token.char}
              </span>
            );
          }

          const isDone = totalTyped >= end;
          const isCurrent = totalTyped >= start && totalTyped < end;

          let cls = 'wt-article-board__token wt-article-board__token--pending';
          if (isDone) cls = 'wt-article-board__token wt-article-board__token--done';
          else if (isCurrent) cls = 'wt-article-board__token wt-article-board__token--current';

          return (
            <span key={idx} className={cls}>
              {token.char}
              {isCurrent && <span ref={cursorRef} className="wt-article-board__cursor" />}
            </span>
          );
        })}
      </div>

      {/*
        虚拟键盘（可折叠）。
        放在正文下方而不是操作条之后：「正文 → 键盘」是打字时的自然视线顺序，
        把键盘压到最底部会被指标条隔开。
        正文是 flex:1，键盘展开时它自动让出高度。
      */}
      {!frozen && keyboardOpen && (
        <div className="wt-article-board__keyboard">
          {/*
            「光标跟随」放在键盘容器里，不放在操作条 ——
            它控制的就是这张键盘的高亮是否随输入移动，属于键盘自身的设置，
            放在一起才看得出它是谁的一部分。
          */}
          <div className="wt-article-board__keyboard-bar">
            <span className="wt-article-board__keyboard-title">键位参照</span>
            <button
              type="button"
              className={
                'wt-article-board__keyboard-toggle'
                + (followCursor ? ' wt-article-board__keyboard-toggle--on' : '')
              }
              onClick={() => setFollowCursor((v) => !v)}
              aria-pressed={followCursor}
            >
              <AimOutlined />
              <span>{followCursor ? '关闭光标跟随' : '开启光标跟随'}</span>
            </button>
          </div>

          <VirtualKeyboard keyStates={keyStates} mode="readonly" />
        </div>
      )}

      {/* 全篇进度 */}
      <div className="wt-article-board__progress">
        <div className="wt-article-board__progress-bar">
          <div
            className="wt-article-board__progress-fill"
            style={{
              width: `${totalKeys > 0
                ? Math.min(100, (totalTyped / totalKeys) * 100)
                : 0}%`,
            }}
          />
        </div>
        <span className="wt-article-board__progress-text">
          {totalTyped} / {totalKeys} 键
        </span>
      </div>

      {/* 操作条 */}
      {!frozen && (
        <div className="wt-article-board__actions">
          <button
            type="button"
            className="wt-article-board__action"
            onClick={() => setHintForChar(hintVisible ? null : (current?.start ?? null))}
            disabled={!expectedKey}
            aria-pressed={hintVisible}
          >
            <BulbOutlined />
            <span>提示</span>
            <kbd>1</kbd>
          </button>

          <button
            type="button"
            className="wt-article-board__action"
            onClick={() => current && onOpenSplitDemo(current.token.char)}
            disabled={!current}
          >
            <EyeOutlined />
            <span>看拆字</span>
            <kbd>2</kbd>
          </button>

          {/*
            键盘开关。文案写「点击后会怎样」，与其它按钮的动作式措辞一致，
            比让用户从高亮状态反推当前是开还是关更直接。
            「光标跟随」不在这里 —— 它属于键盘自身（见键盘容器的标题栏）。
          */}
          <button
            type="button"
            className="wt-article-board__action"
            onClick={() => setKeyboardOpen((v) => !v)}
            aria-pressed={keyboardOpen}
          >
            <AppstoreOutlined />
            <span>{keyboardOpen ? '收起键盘' : '打开键盘'}</span>
            <kbd>3</kbd>
          </button>

          {/*
            !! 这里不能写成「跳过」（参考图里的「跳过」是跳过当前字）!!
            会话模型里**一篇文章 = 一道题**，skipCurrentQuestion 会直接结束
            这篇的会话并弹出成绩。若标成「跳过」，用户会以为只跳过当前字，
            点下去却把整篇丢了。因此按实际行为标注，并在 title 里写清楚。
          */}
          <button
            type="button"
            className="wt-article-board__action"
            onClick={onSkip}
            title="结束本篇并查看成绩（快捷键 Ctrl + Enter）"
          >
            <StepForwardOutlined />
            <span>跳过本篇</span>
            <kbd>Ctrl + ↵</kbd>
          </button>
        </div>
      )}

      {showMetricsBar && <MetricsBar metrics={metrics} frozen={frozen} />}
    </div>
  );
};

export default ArticleBoard;
