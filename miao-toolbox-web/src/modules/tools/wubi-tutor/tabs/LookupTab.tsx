/**
 * 查码 Tab（Story 5.1）
 *
 * 汉字/词组 → 编码，编码 → 候选字/词。
 *
 * 依赖 Story 3.1 的码表加载门控：
 * - chars 未就绪 → 加载中/失败态（阻挡输入，避免误导为「查不到」）
 * - phrases 未就绪 → 降级为逐字查询，并在结果区提示「词组查询未启用」
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { SearchOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { useWubiData, PHRASE_BUCKETS } from '../utils/wubi/useWubiData';
import { composePhrase } from '../utils/wubi/phraseCompose';
import type { CharMap } from '../utils/wubi/code';
import {
  lookup,
  formatAllForClipboard,
  SIMPLIFIED_LABELS,
  type Candidate,
  type LookupEntry,
  type LookupResult,
} from '../utils/wubi/lookup';

interface LookupTabProps {
  onOpenSplitDemo?: (char: string) => void;
}

/**
 * 词组的取码讲解行。
 *
 * 此前词组只显示一个最终编码，用户无从知道「这个码是怎么来的」——
 * 而词组取码规则（每字取几码）恰恰是五笔里最需要讲清的一环。
 * 单字另有「拆分演示」（点击字打开），词组则完全没有交代。
 *
 * 只对词组渲染：单字没有这类合成关系。
 */
const PhraseComposeLine: React.FC<{
  entry: LookupEntry;
  charMap: CharMap;
  onOpenSplitDemo?: (char: string) => void;
}> = ({ entry, charMap, onOpenSplitDemo }) => {
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
            onClick={() => part.fullCode && onOpenSplitDemo?.(part.char)}
            disabled={!part.fullCode}
            title={part.fullCode
              ? `${part.char} 全码 ${part.fullCode}，本词取前 ${part.take} 码`
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

const LookupTab: React.FC<LookupTabProps> = ({ onOpenSplitDemo }) => {
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const {
    state, loadChars, loadPhrases, retryChars, retryPhrases,
    charsReady, phraseDataFor,
  } = useWubiData();

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

      {/* ── 结果区 ── */}
      <div className="wt-lookup__body">
        {showEmptyHint && (
          <div className="wt-lookup__empty">
            <p className="wt-lookup__empty-title">输入任意汉字或编码开始查询</p>
            <p className="wt-lookup__empty-desc">
              例：输入「好」看编码；输入 <kbd>vbg</kbd> 反查候选字。
              词语也行：「中国人」会一并说明取码方式（前两字首码 + 末字前 2 码）。
              1 位编码对应一级简码（如 <kbd>g</kbd> → 一），
              4 位编码常有重码，候选按常用度排列。
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
                个{result.candidates[0].kind === 'phrase' ? '词' : '字'}
                {result.candidates[0].duplicates > 1 && <span className="wt-lookup__dup">重码</span>}
              </div>
              <div className="wt-lookup__candidates">
                {result.candidates.map((c: Candidate) => (
                  <button
                    key={`${c.kind}-${c.text}`}
                    className="wt-lookup__candidate"
                    onClick={() => c.kind === 'char' && onOpenSplitDemo?.(c.text)}
                    title={c.kind === 'char' ? '点击查看拆分演示' : undefined}
                  >
                    <span className="wt-lookup__candidate-text">{c.text}</span>
                    {/*
                      简码命中必须标出来，并附上全码。
                      输入 g 会出现「一」，但「一」的全码是 ggll ——
                      不标注的话，学员会以为「一」的编码就是 g。
                    */}
                    {c.match === 'simplified' && (
                      <>
                        <span className="wt-lookup__badge wt-lookup__badge--inline">
                          {c.simplifiedLevel ? SIMPLIFIED_LABELS[c.simplifiedLevel] : '简码'}
                        </span>
                        <code className="wt-lookup__candidate-code">{c.code}</code>
                      </>
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
                  <div key={`${entry.kind}-${entry.text}`} className="wt-lookup__row">
                    <button
                      className="wt-lookup__row-char"
                      onClick={() => entry.kind === 'char' && onOpenSplitDemo?.(entry.text)}
                      title={entry.kind === 'char' ? '点击查看拆分演示' : undefined}
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
                        onOpenSplitDemo={onOpenSplitDemo}
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
    </div>
  );
};

export default LookupTab;