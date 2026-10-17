/**
 * 查码 Tab（Story 5.1 起，Story 5.5 重设计为「事实 + 讲解」双栏）
 *
 * 左栏 = **确定性事实**：汉字/词组 → 编码，编码 → 候选字/词，词组取码推导。
 * 右栏 = **AI 讲解台**：以选中的字为锚，多轮追问「为什么这么拆」。
 *
 * ── 两栏的关系是刻意的 ──
 *
 * 事实栏永远可用、永远是最终依据；讲解栏是可选增强。所以：
 * · 码表没就绪 → 两栏都不出现（不能让「查不到」和「还没加载完」混为一谈）
 * · AI 不可用 → 只有右栏降级说明，左栏照常
 * · 解释没通过候选集核对 → 右栏如实说没通过，绝不覆盖左栏的结论
 *
 * ── 点击语义（Story 5.5 变更）──
 *
 * 点字 = **选中并讲解**（右侧锚定该字）；拆字动画移到每行的次要按钮「拆分」。
 * 原因：查码最主要的下一个动作是「这个字为什么这么拆」，而动画入口一直在，
 * 只是从主点击降为副入口 —— 主点击让位给能连续追问的那个。
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { SearchOutlined, CopyOutlined, CheckOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useWubiData, PHRASE_BUCKETS } from '../utils/wubi/useWubiData';
import { useWubiStorage } from '../utils/wubi/useWubiStorage';
import { composePhrase } from '../utils/wubi/phraseCompose';
import { buildPhraseExplainContext } from '../utils/wubi/phraseExplain';
import { parseChar, type CharMap } from '../utils/wubi/code';
import { splitChar } from '../utils/wubi/splitter';
import { useWubiExplainChat } from '../utils/wubi/useWubiAI';
import ExplainConsole from '../components/explain/ExplainConsole';
import {
  lookup,
  formatAllForClipboard,
  SIMPLIFIED_LABELS,
  type Candidate,
  type LookupEntry,
  type LookupResult,
} from '../utils/wubi/lookup';

interface LookupTabProps {
  /** 打开拆分演示弹层（确定性视图） */
  onOpenSplitDemo?: (char: string) => void;
  /** 页面级请求：从拆字演示弹层「去讲解台追问」跳进来时要讲解的字 */
  explainRequest?: { char: string; nonce: number } | null;
  /** 请求已消费 */
  onExplainRequestHandled?: () => void;
}

/**
 * 词组的**确定性**取码推导行（事实栏里的那一行）。
 *
 * 此前词组只显示一个最终编码，用户无从知道「这个码是怎么来的」——
 * 而词组取码规则（每字取几码）恰恰是五笔里最需要讲清的一环。
 *
 * 它与右侧的 AI 词级讲解分工明确：这一行**永远可用**、是最终依据
 * （词表码 / 推导码 / 每个字取了几码，算法算的）；右侧讲解只讲「为什么」。
 * 行内每个字仍是独立按钮：点字走**单字**拆分讲解（这个字自己怎么拆），
 * 点行其它地方走**词组**取码讲解 —— 两个问题不同，入口也就不该合成一个。
 *
 * 只对词组渲染：单字没有这类合成关系。
 */
const PhraseComposeLine: React.FC<{
  entry: LookupEntry;
  charMap: CharMap;
  onSelectChar: (char: string) => void;
}> = ({ entry, charMap, onSelectChar }) => {
  const comp = useMemo(
    () => composePhrase(entry.text, entry.code, charMap),
    [entry.text, entry.code, charMap],
  );

  return (
    <div className="wt-lookup__compose">
      <span className="wt-lookup__compose-rule">{comp.ruleLabel}</span>

      {comp.parts.map((part, i) => (part.take === 0 ? null : (
        <span key={`${part.char}-${i}`} className="wt-lookup__compose-part">
          <button
            type="button"
            className="wt-lookup__compose-char"
            onClick={() => part.fullCode && onSelectChar(part.char)}
            disabled={!part.fullCode}
            title={part.fullCode
              ? `${part.char} 全码 ${part.fullCode}，本词取前 ${part.take} 码；点击看该字的讲解`
              : `${part.char} 未收录`}
          >
            {part.char}
          </button>
          <code className="wt-lookup__compose-taken">{part.taken || '—'}</code>
          {part.fullCode && (
            <span className="wt-lookup__compose-full">/{part.fullCode}</span>
          )}
        </span>
      )))}

      {comp.skipped > 0 && (
        <span className="wt-lookup__compose-skip">
          中间 {comp.skipped} 字不取码
        </span>
      )}

      {/*
        只推导、不断言：词表里有极少数（实测 3/15704）是特殊收录，
        这里把「推导码」与「词表码」并列说清，而不是把例外说成规则。
      */}
      {comp.derivedCode === null ? (
        <span className="wt-lookup__compose-note">
          未收录「{comp.missingChars.join('、')}」，无法推导
        </span>
      ) : comp.matchesTable ? (
        <span className="wt-lookup__compose-ok">
          = <code>{comp.derivedCode}</code>
          {comp.shortParts && '（有字码长不足）'}
        </span>
      ) : (
        <span className="wt-lookup__compose-note">
          按规则应为 <code>{comp.derivedCode}</code>，词表收录 <code>{comp.tableCode}</code>
        </span>
      )}
    </div>
  );
};

/** 「复制全部」的复制态标识：与真实字/词不会撞（汉字与词都不含下划线） */
const COPY_ALL_KEY = '__lookup_all__';

const LookupTab: React.FC<LookupTabProps> = ({
  onOpenSplitDemo,
  explainRequest,
  onExplainRequestHandled,
}) => {
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  /** 窄屏下的分段切换：桌面端两栏并排，这个值不起作用 */
  const [pane, setPane] = useState<'facts' | 'chat'>('facts');

  const {
    state, loadChars, loadPhrases, retryChars, retryPhrases,
    charsReady, phraseDataFor,
  } = useWubiData();

  const { loadSettings, updateSettings } = useWubiStorage();
  /** 选中即自动讲解：默认开，可关（避免「只是查个码也被扣额度」） */
  const [autoExplain, setAutoExplain] = useState(() => loadSettings().autoExplain !== false);

  const chat = useWubiExplainChat();

  // 进入本 Tab 即加载单字码表与全部词组桶（合计 150KB，查码需要任意长度的词组）
  useEffect(() => {
    if (!charsReady) loadChars();
    loadPhrases(PHRASE_BUCKETS);
  }, [charsReady, loadChars, loadPhrases]);

  const phraseData = phraseDataFor(PHRASE_BUCKETS);
  const phrasesReady = phraseData.status === 'ready' && phraseData.map !== null;

  const result: LookupResult | null = useMemo(() => {
    if (!state.chars) return null;
    if (!input.trim()) return null;
    return lookup(input, state.chars, phraseData.map);
  }, [input, state.chars, phraseData.map]);

  /*
   * 反查结果的字 / 词构成。
   *
   * 结论行原来只读 `candidates[0].kind` 决定说「字」还是「词」，
   * 于是 vvvv 这种混合重码（女 + 妇女）会被说成「命中 2 个字」——
   * 而列表里第二个候选明明标着「词组」。
   */
  const hitKinds = useMemo(() => {
    const candidates = result?.kind === 'code' ? result.candidates : [];
    let chars = 0;
    let phrases = 0;
    for (const c of candidates) {
      if (c.kind === 'phrase') phrases += 1;
      else chars += 1;
    }
    return { chars, phrases };
  }, [result]);

  const handleCopy = useCallback(async (text: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(text);
      // 用字符作为 key，1.6s 后复位
      window.setTimeout(() => setCopied((prev) => (prev === text ? null : prev)), 1600);
    } catch {
      // 剪贴板不可用（非 https / 权限拒绝）时静默降级，不阻断查询
    }
  }, []);

  /*
   * 把码表提成 const 再一起守：
   * `charsReady` 与 `state.chars` 是两件事，而属性访问的窄化一进 `.map()`
   * 回调就失效 —— 之前只能靠 `state.chars!` 硬断言。提成 const 后窄化可靠，
   * 且两者不一致时落到同一个加载/失败界面，而不是空白。
   */
  const charMap = state.chars;

  const handleToggleAutoExplain = useCallback((next: boolean) => {
    setAutoExplain(next);
    updateSettings({ autoExplain: next });
  }, [updateSettings]);

  /** 选中一个字 → 锚定到讲解台。编码以码表为准（传入的码可能来自词组推导） */
  const selectChar = useCallback((char: string) => {
    if (!charMap) return;
    const entry = parseChar(char, charMap);
    if (!entry) return;
    chat.selectChar(char, entry.code, splitChar(char, entry.code), { auto: autoExplain });
    setPane('chat');
  }, [charMap, chat, autoExplain]);

  /**
   * 选中一个词组 → 讲解台讲它的**取码规则**（不是拆字）。
   *
   * 上下文在点击时才现算：`composePhrase` 是 O(字数) 的纯计算，只在真的点了才需要，
   * 提前算会让整张结果表在每次输入时都重算一遍（表里可能同时有几十个词组）。
   *
   * 一位取码位都给不出来（如全词未收录）时**不改锚点**：那时既没有候选可核对，
   * 也没有来源可讲，切过去只会得到一句「无法推导」，不如让用户留在事实栏看未收录提示。
   */
  const selectPhrase = useCallback((text: string, code: string) => {
    if (!charMap) return;
    const params = buildPhraseExplainContext(composePhrase(text, code, charMap), splitChar);
    if (!params) return;
    chat.selectPhrase(params, { auto: autoExplain });
    setPane('chat');
  }, [charMap, chat, autoExplain]);

  /*
   * 弹层「去讲解台追问」：消费一次请求。
   *
   * 用 nonce 记「已消费到哪一个请求」，而不是只依赖父级回传清空 ——
   * 万一调用方忘了传 onExplainRequestHandled，这个 effect 会在每次渲染都把首轮
   * 重放一遍（无界的 AI 调用）。码表可能还在路上，所以等 charMap 就绪再消费。
   */
  const consumedNonceRef = useRef<number>(0);
  useEffect(() => {
    if (!explainRequest || !charMap) return;
    if (consumedNonceRef.current === explainRequest.nonce) return;
    consumedNonceRef.current = explainRequest.nonce;
    selectChar(explainRequest.char);
    onExplainRequestHandled?.();
  }, [explainRequest, charMap, selectChar, onExplainRequestHandled]);

  // ── 码表加载中 / 失败 ──
  if (!charsReady || !charMap) {
    const failed = state.charsStatus === 'failed';
    return (
      <div className="wt-practice-loading">
        {failed ? (
          <>
            <p className="wt-practice-loading__error">
              {state.charsError || '码表加载失败'}
            </p>
            <button className="wt-practice-loading__retry" onClick={retryChars}>重试</button>
          </>
        ) : (
          <>
            <div className="wt-tutorial__loading-spinner" />
            <p>正在加载码表…</p>
          </>
        )}
      </div>
    );
  }

  const showEmptyHint = !input.trim();

  return (
    <div className="wt-lookup">
      {/* ── 输入区 ── */}
      <div className="wt-lookup__bar">
        <span className="wt-lookup__icon"><SearchOutlined /></span>
        <input
          className="wt-lookup__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入汉字 / 词组查编码，或输入编码（a~y，1~4 位）反查候选"
          // 查码不需要物理键盘监听，允许中文输入法正常输入
          autoComplete="off"
          spellCheck={false}
          aria-label="查码输入框"
        />
        {input && (
          <button className="wt-lookup__clear" onClick={() => setInput('')} aria-label="清空">
            ×
          </button>
        )}
      </div>

      {/* 词组表未就绪时明确说明降级，避免用户以为「词组查不到」 */}
      {!phrasesReady && (
        <p className="wt-lookup__notice">
          {phraseData.status === 'failed'
            ? '词组表加载失败，当前仅支持单字查询'
            : '词组表加载中，当前先按逐字查询'}
          {phraseData.status === 'failed' && (
            <button
              className="wt-lookup__notice-retry"
              onClick={() => retryPhrases(PHRASE_BUCKETS)}
            >
              重试
            </button>
          )}
        </p>
      )}

      {/* 窄屏分段切换（桌面端由 CSS 隐藏） */}
      <div className="wt-lookup__panes" role="tablist" aria-label="查码与讲解">
        <button
          role="tab"
          aria-selected={pane === 'facts'}
          className={`wt-lookup__pane-tab${pane === 'facts' ? ' wt-lookup__pane-tab--active' : ''}`}
          onClick={() => setPane('facts')}
        >
          查码
        </button>
        <button
          role="tab"
          aria-selected={pane === 'chat'}
          className={`wt-lookup__pane-tab${pane === 'chat' ? ' wt-lookup__pane-tab--active' : ''}`}
          onClick={() => setPane('chat')}
        >
          讲解
        </button>
      </div>

      <div className="wt-lookup__split" data-pane={pane}>
        {/* ── 左：事实 ── */}
        <div className="wt-lookup__facts">
          {showEmptyHint && (
            <div className="wt-lookup__empty">
              <p className="wt-lookup__empty-title">输入任意汉字或编码开始查询</p>
              <p className="wt-lookup__empty-desc">
                例：输入「好」看编码；输入 <kbd>vbg</kbd> 反查候选字。
                词语也行：「中国人」会一并说明取码方式（前两字首码 + 末字前 2 码）。
                1 位编码对应一级简码（如 <kbd>g</kbd> → 一），
                4 位编码常有重码，候选按常用度排列。
              </p>
              <p className="wt-lookup__empty-hint">
                点任意汉字 → 右侧讲解台开始讲解这个字；点词组那一行 → 讲解它的取码规则；
                点「拆分」→ 看字根拆分动画。
              </p>
            </div>
          )}

          {result?.error && (
            <div className="wt-lookup__error">{result.error}</div>
          )}

          {/* 反查：候选列表 */}
          {result?.kind === 'code' && (
            result.candidates.length > 0 ? (
              <>
                <div className="wt-lookup__summary">
                  编码 <code>{input.trim().toLowerCase()}</code> 命中
                  <strong> {result.candidates[0].duplicates} </strong>
                  {hitKinds.phrases === 0
                    ? '个字'
                    : hitKinds.chars === 0
                      ? '个词'
                      : '个结果'}
                  {result.candidates[0].duplicates > 1 && <span className="wt-lookup__dup">重码</span>}
                </div>
                <div className="wt-lookup__candidates">
                  {result.candidates.map((c: Candidate) => (
                    <button
                      key={`${c.kind}-${c.text}`}
                      className="wt-lookup__candidate"
                      /*
                        词组候选此前点了没反应：原写法 `c.kind === 'char' && selectChar(...)`
                        把词组分支整个吞掉，标题也只在单字时给 —— 用户连「能不能点」都看不出。
                        词组走 selectPhrase（与正查的词组行同一语义：讲取码规则，不拆字）。
                      */
                      onClick={() => (
                        c.kind === 'phrase' ? selectPhrase(c.text, c.code) : selectChar(c.text)
                      )}
                      title={c.kind === 'phrase' ? '点击看这个词组的取码讲解' : '点击看 AI 讲解'}
                      aria-label={c.kind === 'phrase' ? `查看词组 ${c.text} 的取码讲解` : undefined}
                    >
                      <span className="wt-lookup__candidate-text">{c.text}</span>
                      {/*
                        简码命中必须标出来，并附上全码。
                        输入 g 会出现「一」，但「一」的全码是 ggll ——
                        不标注的话，学员会以为「一」的编码就是 g。

                        词组候选也要标：它和单字候选并排显示时（如 vvvv → 女 / 妇女），
                        不标就分不清哪个是字、点了会得到哪种讲解。

                        两者互斥（词组表只收全码，不会有简码命中），共用一个标注行；
                        徽标与全码还要注意包在同一个行容器里 —— 卡片是 flex 列，
                        拆成两个子项会各占一行、把卡片撑成三行。
                      */}
                      {(c.match === 'simplified' || c.kind === 'phrase') && (
                        <span className="wt-lookup__candidate-meta">
                          {c.match === 'simplified' ? (
                            <>
                              <span className="wt-lookup__badge wt-lookup__badge--inline">
                                {c.simplifiedLevel ? SIMPLIFIED_LABELS[c.simplifiedLevel] : '简码'}
                              </span>
                              <code className="wt-lookup__candidate-code">{c.code}</code>
                            </>
                          ) : (
                            <span className="wt-lookup__badge wt-lookup__badge--phrase">词组</span>
                          )}
                        </span>
                      )}
                      {c.duplicates > 1 && (
                        <span className="wt-lookup__candidate-rank">{c.rank}</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="wt-lookup__empty">
                <p className="wt-lookup__empty-title">没有找到对应候选</p>
                <p className="wt-lookup__empty-desc">
                  编码 <code>{input.trim().toLowerCase()}</code> 未收录任何字或词。
                </p>
              </div>
            )
          )}

          {/* 正查：字/词编码表 */}
          {result?.kind === 'text' && (
            result.entries.length > 0 || result.missing.length > 0 ? (
              <>
                {/*
                  正查此前没有任何结论行：一串结果直接铺开，既不知道切分成了几项，
                  也没法一次拿走整段编码（查完照着打才是主用途）。
                */}
                <div className="wt-lookup__summary wt-lookup__summary--actions">
                  <span>
                    共 <strong>{result.entries.length}</strong> 项
                    {result.entries.some((e) => e.kind === 'phrase') && (
                      <> · 其中词组 <strong>{result.entries.filter((e) => e.kind === 'phrase').length}</strong> 个</>
                    )}
                  </span>
                  {result.entries.length > 1 && (
                    <button
                      type="button"
                      className={`wt-lookup__copy-all${copied === COPY_ALL_KEY ? ' wt-lookup__copy-all--done' : ''}`}
                      onClick={() => handleCopy(COPY_ALL_KEY, formatAllForClipboard(result.entries))}
                      title="按切分顺序拼接全部编码，复制后可直接照着打"
                    >
                      {copied === COPY_ALL_KEY ? <CheckOutlined /> : <CopyOutlined />}
                      <span>{copied === COPY_ALL_KEY ? '已复制' : '复制全部编码'}</span>
                      <code>{formatAllForClipboard(result.entries)}</code>
                    </button>
                  )}
                </div>

                <div className="wt-lookup__table">
                  {result.entries.map((entry: LookupEntry) => (
                    <div
                      key={`${entry.kind}-${entry.text}`}
                      className={`wt-lookup__row${entry.kind === 'phrase' ? ' wt-lookup__row--clickable' : ''}`}
                      /*
                        词组行整行可点：行首那个按钮本身可聚焦（语义与键盘可达性由它承担），
                        这里的 onClick 只是把「点在行的空白处」也算作选中 ——
                        所以先放行行内的按钮（复制 / 拆分 / 取码推导里的单字），
                        否则点「复制」会连带换掉右侧讲解的锚点。
                      */
                      onClick={entry.kind === 'phrase'
                        ? (event) => {
                            if ((event.target as HTMLElement).closest('button')) return;
                            selectPhrase(entry.text, entry.code);
                          }
                        : undefined}
                    >
                      <button
                        className="wt-lookup__row-char"
                        onClick={() => (
                          entry.kind === 'phrase'
                            ? selectPhrase(entry.text, entry.code)
                            : selectChar(entry.text)
                        )}
                        title={entry.kind === 'phrase'
                          ? '点击看这个词组的取码讲解'
                          : '点击看 AI 讲解'}
                        aria-label={entry.kind === 'phrase'
                          ? `查看词组 ${entry.text} 的取码讲解`
                          : undefined}
                      >
                        {entry.text}
                      </button>

                      <div className="wt-lookup__row-codes">
                        <code className="wt-lookup__code">{entry.code}</code>
                        {entry.simplifiedLevel > 0 && entry.simplifiedCode && (
                          <span className="wt-lookup__badge">
                            {SIMPLIFIED_LABELS[entry.simplifiedLevel as 1 | 2 | 3]}
                            <code>{entry.simplifiedCode}</code>
                          </span>
                        )}
                        {entry.kind === 'phrase' && (
                          <span className="wt-lookup__badge wt-lookup__badge--phrase">词组</span>
                        )}
                      </div>

                      {entry.kind === 'char' && (
                        <button
                          type="button"
                          className="wt-lookup__row-split"
                          onClick={() => onOpenSplitDemo?.(entry.text)}
                          title="打开拆分演示（字根拆分动画）"
                          aria-label={`查看 ${entry.text} 的拆分演示`}
                        >
                          <ExperimentOutlined />
                          <span>拆分</span>
                        </button>
                      )}

                      <button
                        className={`wt-lookup__copy${copied === entry.text ? ' wt-lookup__copy--done' : ''}`}
                        onClick={() => handleCopy(entry.text, entry.code)}
                        aria-label={`复制 ${entry.text} 的编码`}
                      >
                        {copied === entry.text ? <CheckOutlined /> : <CopyOutlined />}
                        <span>{copied === entry.text ? '已复制' : '复制'}</span>
                      </button>

                      {entry.kind === 'phrase' && (
                        <PhraseComposeLine
                          entry={entry}
                          charMap={charMap}
                          onSelectChar={selectChar}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {result.missing.length > 0 && (
                  <div className="wt-lookup__missing">
                    <span className="wt-lookup__missing-label">未收录：</span>
                    {result.missing.map((ch) => (
                      <span key={ch} className="wt-lookup__missing-char">{ch}</span>
                    ))}
                    <span className="wt-lookup__missing-hint">
                      这些字不在 86 版码表中（生僻字或非 GB2312 字符）
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="wt-lookup__empty">
                <p className="wt-lookup__empty-title">未收录「{input.trim()}」</p>
                <p className="wt-lookup__empty-desc">
                  当前码表基于 86 版五笔，可能不含生僻字或繁体字。
                </p>
              </div>
            )
          )}
        </div>

        {/* ── 右：讲解台 ── */}
        <ExplainConsole
          chat={chat}
          autoExplain={autoExplain}
          onToggleAutoExplain={handleToggleAutoExplain}
          onOpenSplitDemo={onOpenSplitDemo}
        />
      </div>
    </div>
  );
};

export default LookupTab;
