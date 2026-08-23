import React, { useMemo, useState, useCallback } from 'react';
import { basicStats, wordFrequency } from '../utils/text-ops/freq';
import type { WordFreqEntry } from '../utils/text-ops/freq';
import { STOP_WORDS } from '../data/stopWords';
import { useSegmentation } from '../hooks/useSegmentation';
import type { TbpAction, FreqState } from '../types';
import type { SplitMode } from '../utils/text-ops/freq';

interface FreqTabProps {
  inputText: string;
  state: FreqState;
  dispatch: React.Dispatch<TbpAction>;
}

const SPLIT_MODES: { value: SplitMode; label: string; hint: string }[] = [
  { value: 'word', label: '按词', hint: '中文分词' },
  { value: 'char', label: '按字', hint: '逐字统计' },
  { value: 'space', label: '按空格', hint: '英文分词' },
];

const FreqTab: React.FC<FreqTabProps> = ({ inputText, state, dispatch }) => {
  const { segStatus, cut } = useSegmentation();
  const hasInput = inputText.trim().length > 0;
  const [copied, setCopied] = useState(false);

  // 基础统计（实时）
  const stats = useMemo(() => basicStats(inputText), [inputText]);

  // 词频全量结果（不受 topN 限制），仅调用一次
  const allFreqEntries = useMemo<WordFreqEntry[]>(() => {
    if (!hasInput) return [];
    return wordFrequency(inputText, {
      splitMode: state.splitMode,
      stopWords: state.useStopWords ? STOP_WORDS : [],
      segment: state.splitMode === 'word' ? (cut ?? undefined) : undefined,
    });
  }, [inputText, state.splitMode, state.useStopWords, cut, hasInput]);

  // 展示列表 = 全量结果截取 topN
  const freqEntries = useMemo(
    () => allFreqEntries.slice(0, state.topN),
    [allFreqEntries, state.topN],
  );

  const uniqueCount = allFreqEntries.length;

  const wordModeUnavailable = state.splitMode === 'word' && segStatus === 'failed';
  const wordModeLoading = state.splitMode === 'word' && segStatus === 'loading';

  const handleCopy = useCallback(async () => {
    if (freqEntries.length === 0) return;
    const tsv = [
      '序号\t词\t次数\t占比',
      ...freqEntries.map((e, i) =>
        `${i + 1}\t${e.word}\t${e.count}\t${(e.percentage * 100).toFixed(1)}%`,
      ),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [freqEntries]);

  const statCards = [
    { label: '字符数', value: stats.chars, unit: '字符', key: 'chars' },
    { label: '不含空白', value: stats.charsNoSpace, unit: '字符', key: 'charsNoSpace' },
    { label: '行数', value: stats.lines, unit: '行', key: 'lines' },
    { label: '段落数', value: stats.paragraphs, unit: '段', key: 'paragraphs' },
    { label: '英文单词', value: stats.words, unit: '个', key: 'words' },
  ];

  return (
    <div className="tbp-freq">
      {/* 基础统计卡片组 */}
      <section className="tbp-stat-cards" aria-label="基础统计">
        {statCards.map((c) => (
          <div key={c.key} className="tbp-stat-card">
            <span className="tbp-stat-card-label">{c.label}</span>
            <span className="tbp-stat-card-value">{c.value}</span>
            <span className="tbp-stat-card-unit">{c.unit}</span>
          </div>
        ))}
      </section>

      {/* 词频区域 */}
      <section className="tbp-freq-panel" aria-label="词频统计">
        <div className="tbp-freq-toolbar">
          {/* 切分模式 */}
          <div className="tbp-freq-split" role="group" aria-label="切分模式">
            {SPLIT_MODES.map((m) => {
              const disabled = m.value === 'word' && segStatus === 'failed';
              return (
                <button
                  key={m.value}
                  type="button"
                  className={`tbp-format-chip ${state.splitMode === m.value ? 'is-active' : ''}`}
                  onClick={() => dispatch({ type: 'TBP_SET_FREQ_SPLIT_MODE', payload: m.value })}
                  title={m.hint}
                  disabled={disabled}
                  aria-pressed={state.splitMode === m.value}
                >
                  {m.label}
                  {m.value === 'word' && segStatus === 'failed' && (
                    <span className="tbp-freq-unavailable">不可用</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Top N 步进器 */}
          <div className="tbp-freq-topn" role="group" aria-label="展示条数">
            <button
              type="button"
              className="tbp-freq-topn-btn"
              onClick={() => dispatch({ type: 'TBP_SET_FREQ_TOP_N', payload: Math.max(1, state.topN - 5) })}
              disabled={state.topN <= 1}
              aria-label="减少 5"
            >
              −
            </button>
            <span className="tbp-freq-topn-value" aria-live="polite">Top {state.topN}</span>
            <button
              type="button"
              className="tbp-freq-topn-btn"
              onClick={() => dispatch({ type: 'TBP_SET_FREQ_TOP_N', payload: Math.min(500, state.topN + 5) })}
              disabled={state.topN >= 500}
              aria-label="增加 5"
            >
              +
            </button>
          </div>

          {/* 停用词过滤 */}
          <button
            type="button"
            className={`tbp-format-chip ${state.useStopWords ? 'is-active' : ''}`}
            onClick={() => dispatch({ type: 'TBP_SET_FREQ_STOP_WORDS', payload: !state.useStopWords })}
            aria-pressed={state.useStopWords}
          >
            停用词过滤
          </button>

          {freqEntries.length > 0 && (
            <button
              type="button"
              className={`tbp-result-btn tbp-result-btn--ghost tbp-freq-copy ${copied ? 'is-copied' : ''}`}
              onClick={handleCopy}
              aria-label="复制词频结果"
            >
              <span className="tbp-btn-icon" aria-hidden>{copied ? '✓' : '⧉'}</span>
              {copied ? '已复制' : '复制'}
            </button>
          )}

          {wordModeLoading && (
            <span className="tbp-freq-loading" role="status">
              分词库加载中…
            </span>
          )}
        </div>

        {wordModeUnavailable && (
          <div className="tbp-inline-error" role="alert">
            中文分词库加载失败，已降级为按字统计。可切换「按字」或「按空格」模式。
          </div>
        )}

        {/* 词频表格 */}
        <div className="tbp-freq-table-wrap">
          {!hasInput ? (
            <div className="tbp-result-empty">
              <span className="tbp-result-empty-icon" aria-hidden>⌁</span>
              <div className="tbp-result-empty-body">
                <strong>等待输入</strong>
                <span>在左侧输入文本后，此处会显示词频统计</span>
              </div>
            </div>
          ) : freqEntries.length === 0 ? (
            <div className="tbp-result-empty">
              <span className="tbp-result-empty-icon" aria-hidden>∅</span>
              <div className="tbp-result-empty-body">
                <strong>暂无词频数据</strong>
                <span>没有可统计的词，尝试切换切分模式或关闭停用词过滤</span>
              </div>
            </div>
          ) : (
            <>
              <table className="tbp-freq-table">
                <thead>
                  <tr>
                    <th className="tbp-freq-col-rank">#</th>
                    <th className="tbp-freq-col-word">词</th>
                    <th className="tbp-freq-col-count">次数</th>
                    <th className="tbp-freq-col-pct">占比</th>
                  </tr>
                </thead>
                <tbody>
                  {freqEntries.map((e, i) => (
                    <tr key={`${e.word}-${i}`}>
                      <td className="tbp-freq-col-rank">{i + 1}</td>
                      <td className="tbp-freq-col-word">{e.word}</td>
                      <td className="tbp-freq-col-count">{e.count}</td>
                      <td className="tbp-freq-col-pct">
                        <span className="tbp-freq-pct-num">{(e.percentage * 100).toFixed(1)}%</span>
                        <span className="tbp-freq-pct-bar" aria-hidden>
                          <span
                            className="tbp-freq-pct-fill"
                            style={{ width: `${Math.min(100, e.percentage * 100)}%` }}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {uniqueCount > state.topN && (
                <div className="tbp-freq-table-hint">
                  共 {uniqueCount} 个唯一词，已显示前 {state.topN} 个
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default FreqTab;
