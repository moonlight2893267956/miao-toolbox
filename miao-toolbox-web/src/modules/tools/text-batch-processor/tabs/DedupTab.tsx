import React, { useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { deduplicate } from '../utils/text-ops/dedup';
import type { DedupOptions, DedupResult } from '../utils/text-ops/dedup';
import type { TbpAction } from '../types';
import { DELIMITER_PRESETS } from '../data/delimiters';
import { useBackfillAndCopy } from '../hooks/useBackfillAndCopy';

interface DedupTabProps {
  inputText: string;
  options: DedupOptions;
  dispatch: React.Dispatch<TbpAction>;
}

const DedupTab: React.FC<DedupTabProps> = ({ inputText, options, dispatch }) => {
  const { justBackfilled, copied, handleBackfill, handleCopy, handleUndoBackfill } = useBackfillAndCopy(inputText, dispatch);

  const result = useMemo(() => deduplicate(inputText, options), [inputText, options]);

  const hasInput = inputText.trim().length > 0;

  const handleOptionToggle = (key: keyof DedupOptions) => {
    const next: DedupOptions = { ...options };
    if (key === 'delimiter') {
      return;
    }
    next[key] = !options[key];
    dispatch({ type: 'TBP_SET_DEDUP_OPTIONS', payload: next });
  };

  const handleDelimiterChange = (value: string) => {
    dispatch({
      type: 'TBP_SET_DEDUP_OPTIONS',
      payload: { ...options, delimiter: value === '\n' ? undefined : value },
    });
  };

  const toggleKeys: (keyof DedupOptions)[] = [
    'keepLast',
    'ignoreCase',
    'ignoreWhitespace',
    'ignoreEmptyLines',
  ];

  return (
    <div className="tbp-dedup">
      <section className="tbp-options" aria-label="去重选项">
        {toggleKeys.map((key) => (
          <button
            key={key}
            type="button"
            className={`tbp-pill ${options[key] ? 'is-active' : ''}`}
            aria-pressed={!!options[key]}
            onClick={() => handleOptionToggle(key)}
          >
            {key === 'keepLast' && '保留末次'}
            {key === 'ignoreCase' && '忽略大小写'}
            {key === 'ignoreWhitespace' && '忽略空白'}
            {key === 'ignoreEmptyLines' && '忽略空行'}
          </button>
        ))}

        <label className="tbp-delimiter">
          <span className="tbp-delimiter-label">分隔符</span>
          <select
            className="tbp-delimiter-select"
            value={options.delimiter ?? '\n'}
            onChange={(e) => handleDelimiterChange(e.target.value)}
          >
            {DELIMITER_PRESETS.map((p) => (
              <option key={p.label} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <ResultPanel
        result={result}
        hasInput={hasInput}
        justBackfilled={justBackfilled}
        copied={copied}
        onCopy={() => handleCopy(result.resultText)}
        onBackfill={() => handleBackfill(result.resultText)}
        onUndoBackfill={handleUndoBackfill}
      />
    </div>
  );
};

/** 结果面板：指标带 + 压缩率条 + 状态化 Diff 列表 */
const ResultPanel: React.FC<{
  result: DedupResult;
  hasInput: boolean;
  justBackfilled: boolean;
  copied: boolean;
  onCopy: () => void;
  onBackfill: () => void;
  onUndoBackfill: () => void;
}> = ({ result, hasInput, justBackfilled, copied, onCopy, onBackfill, onUndoBackfill }) => {
  const { remaining, removed } = result.stats;
  const total = remaining + removed;
  const keepRatio = total > 0 ? (remaining / total) * 100 : 0;
  const removeRatio = total > 0 ? (removed / total) * 100 : 0;
  const reduceMotion = useReducedMotion();

  return (
    <section className="tbp-result" aria-label="去重结果面板">
      {/* 指标带 + 操作 */}
      <header className="tbp-result-head">
        <ul className="tbp-metrics" aria-label="去重统计">
          <li className="tbp-metric tbp-metric--keep">
            <span className="tbp-metric-dot" aria-hidden />
            <span className="tbp-metric-body">
              <span className="tbp-metric-label">保留</span>
              <span className="tbp-metric-value">{remaining}</span>
            </span>
          </li>
          <li className="tbp-metric tbp-metric--remove">
            <span className="tbp-metric-dot" aria-hidden />
            <span className="tbp-metric-body">
              <span className="tbp-metric-label">移除</span>
              <span className="tbp-metric-value">{removed}</span>
            </span>
          </li>
          <li className="tbp-metric tbp-metric--total">
            <span className="tbp-metric-dot" aria-hidden />
            <span className="tbp-metric-body">
              <span className="tbp-metric-label">原始</span>
              <span className="tbp-metric-value">{total}</span>
            </span>
          </li>
        </ul>
        <div className="tbp-result-actions">
          <button
            type="button"
            className={`tbp-result-btn tbp-result-btn--ghost ${copied ? 'is-copied' : ''}`}
            onClick={onCopy}
            disabled={!result.resultText}
            aria-label="复制结果"
          >
            <span className="tbp-btn-icon" aria-hidden>{copied ? '✓' : '⧉'}</span>
            {copied ? '已复制' : '复制'}
          </button>
          <button
            type="button"
            className="tbp-result-btn tbp-result-btn--primary"
            onClick={justBackfilled ? onUndoBackfill : onBackfill}
            disabled={!result.resultText}
          >
            <span className="tbp-btn-icon" aria-hidden>{justBackfilled ? '↺' : '↩'}</span>
            {justBackfilled ? '撤销回填' : '回填'}
          </button>
        </div>
      </header>

      {/* 压缩率条 + 比例标签 + 图例 */}
      <div
        className="tbp-ratio"
        role="img"
        aria-label={`保留 ${remaining} 行 ${keepRatio.toFixed(1)}% / 移除 ${removed} 行 ${removeRatio.toFixed(1)}%`}
      >
        <div className="tbp-ratio-meta">
          <span className="tbp-ratio-meta-label">压缩率</span>
          <span className="tbp-ratio-meta-value">
            {total > 0 ? `${keepRatio.toFixed(1)}%` : '—'}
          </span>
        </div>
        <div className="tbp-ratio-bar">
          <div
            className="tbp-ratio-bar-keep"
            style={{ width: total > 0 ? `${keepRatio}%` : '0%' }}
            aria-hidden
          />
          <div
            className="tbp-ratio-bar-remove"
            style={{ width: total > 0 ? `${removeRatio}%` : '0%' }}
            aria-hidden
          />
        </div>
        <div className="tbp-ratio-legend">
          <span className="tbp-ratio-legend-item tbp-ratio-legend-item--keep">
            <span className="tbp-ratio-legend-swatch" aria-hidden />保留 {remaining}
          </span>
          <span className="tbp-ratio-legend-item tbp-ratio-legend-item--remove">
            <span className="tbp-ratio-legend-swatch" aria-hidden />移除 {removed}
          </span>
        </div>
      </div>

      {/* 结果列表 */}
      <div className="tbp-diff-list" aria-label="去重结果列表">
        <AnimatePresence mode="wait" initial={false}>
          {justBackfilled ? (
            <motion.div
              key="cleared"
              className="tbp-result-cleared"
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              <span className="tbp-result-cleared-icon" aria-hidden>↩</span>
              <div className="tbp-result-cleared-body">
                <strong>已回填到输入区</strong>
                <span>编辑后会自动解除回填标记</span>
              </div>
            </motion.div>
          ) : !hasInput ? (
            <motion.div
              key="empty"
              className="tbp-result-empty"
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <span className="tbp-result-empty-icon" aria-hidden>⌁</span>
              <div className="tbp-result-empty-body">
                <strong>等待输入</strong>
                <span>在左侧输入文本后，此处会实时生成去重结果</span>
              </div>
              <div className="tbp-empty-hints" aria-hidden>
                <span className="tbp-empty-hint-chip">保留首次出现</span>
                <span className="tbp-empty-hint-chip">按行比较</span>
                <span className="tbp-empty-hint-chip">压缩率统计</span>
              </div>
            </motion.div>
          ) : (
            <motion.ul
              key="list"
              className="tbp-diff-list-ul"
              initial={reduceMotion ? false : 'hidden'}
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.025 } },
              }}
            >
              {result.units.map((u) => {
                const kind = u.action === 'empty-filtered' ? 'removed' : u.action;
                return (
                  <motion.li
                    key={u.index}
                    className={`tbp-diff-line tbp-diff-line--${kind}`}
                    aria-label={
                      u.action === 'kept' ? '已保留' :
                      u.action === 'removed' ? '已移除' : '已过滤空行'
                    }
                    variants={{
                      hidden: { opacity: 0, x: -4 },
                      visible: { opacity: 1, x: 0, transition: { duration: 0.2 } },
                    }}
                  >
                    <span className="tbp-diff-line-stripe" aria-hidden />
                    <span className="tbp-diff-line-marker" aria-hidden>
                      {u.action === 'kept' ? '✓' : u.action === 'removed' ? '−' : '·'}
                    </span>
                    <span className="tbp-diff-line-text">
                      {u.text === '' ? (
                        <em className="tbp-diff-empty-line">（空行）</em>
                      ) : (
                        u.text
                      )}
                    </span>
                    <span className="tbp-diff-line-num">{u.index + 1}</span>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

export default DedupTab;
