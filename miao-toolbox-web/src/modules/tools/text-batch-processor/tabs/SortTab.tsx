import React, { useMemo } from 'react';
import { sortText } from '../utils/text-ops/sort';
import type { SortOptions, SortMethod } from '../utils/text-ops/sort';
import type { TbpAction } from '../types';
import { DELIMITER_PRESETS } from '../data/delimiters';
import { useBackfillAndCopy } from '../hooks/useBackfillAndCopy';

interface SortTabProps {
  inputText: string;
  options: SortOptions;
  dispatch: React.Dispatch<TbpAction>;
}

const METHOD_PRESETS: { value: SortMethod; label: string }[] = [
  { value: 'asc', label: '升序' },
  { value: 'desc', label: '降序' },
  { value: 'natural', label: '自然排序' },
  { value: 'length-asc', label: '长度 ↑' },
  { value: 'length-desc', label: '长度 ↓' },
  { value: 'shuffle', label: '乱序' },
];

const SortTab: React.FC<SortTabProps> = ({ inputText, options, dispatch }) => {
  const { justBackfilled, copied, handleBackfill, handleCopy, handleUndoBackfill } = useBackfillAndCopy(inputText, dispatch);

  const result = useMemo(() => sortText(inputText, options), [inputText, options]);
  const hasInput = inputText.trim().length > 0;
  const total = result.units.length;
  const changed = result.units.some((u, i) => u.index !== i);

  const handleMethodChange = (value: SortMethod) => {
    dispatch({ type: 'TBP_SET_SORT_OPTIONS', payload: { ...options, method: value } });
  };

  const handleDelimiterChange = (value: string) => {
    dispatch({
      type: 'TBP_SET_SORT_OPTIONS',
      payload: { ...options, delimiter: value },
    });
  };

  const handleIgnoreCaseToggle = () => {
    dispatch({
      type: 'TBP_SET_SORT_OPTIONS',
      payload: { ...options, ignoreCase: !options.ignoreCase },
    });
  };

  return (
    <div className="tbp-sort">
      <section className="tbp-result tbp-result--sort" aria-label="排序结果">
        {/* 选项行：方式 pills + 二级选项 */}
        <div className="tbp-sort-options">
          <div className="tbp-method-grid" role="radiogroup" aria-label="排序方式">
            {METHOD_PRESETS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={options.method === value}
                className={`tbp-method-card ${options.method === value ? 'is-active' : ''}`}
                onClick={() => handleMethodChange(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="tbp-sort-extras">
            <button
              type="button"
              className={`tbp-extra-pill ${options.ignoreCase ? 'is-active' : ''}`}
              aria-pressed={!!options.ignoreCase}
              onClick={handleIgnoreCaseToggle}
            >
              忽略大小写
            </button>

            <label className="tbp-extra-pill tbp-extra-pill--select">
              <span className="tbp-extra-pill-label">分隔符</span>
              <select
                className="tbp-extra-pill-select"
                value={options.delimiter ?? '\n'}
                onChange={(e) => handleDelimiterChange(e.target.value)}
                aria-label="分隔符"
              >
                {DELIMITER_PRESETS.map((p) => (
                  <option key={p.label} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* 统计 + 操作行 */}
        <div className="tbp-result-summary">
          <span className="tbp-result-summary-count">
            <span className="tbp-result-summary-num">{total}</span>
            <span className="tbp-result-summary-unit">条</span>
          </span>
          {hasInput && (
            <span className="tbp-result-summary-meta">
              {changed ? '顺序已调整' : '顺序未变'}
            </span>
          )}
          <div className="tbp-result-actions">
            <button
              type="button"
              className={`tbp-result-btn tbp-result-btn--ghost ${copied ? 'is-copied' : ''}`}
              onClick={() => handleCopy(result.resultText)}
              disabled={!result.resultText}
              aria-label="复制结果"
            >
              <span className="tbp-btn-icon" aria-hidden>{copied ? '✓' : '⧉'}</span>
              {copied ? '已复制' : '复制'}
            </button>
            <button
              type="button"
              className="tbp-result-btn tbp-result-btn--primary"
              onClick={justBackfilled ? handleUndoBackfill : () => handleBackfill(result.resultText)}
              disabled={!result.resultText}
            >
              <span className="tbp-btn-icon" aria-hidden>{justBackfilled ? '↺' : '↩'}</span>
              {justBackfilled ? '撤销回填' : '回填'}
            </button>
          </div>
        </div>

        <div className="tbp-rack">
          {justBackfilled ? (
            <div className="tbp-rack-flash" role="status">
              <span className="tbp-rack-flash-glyph" aria-hidden>↩</span>
              <div>
                <strong>已回填到输入区</strong>
                <p>编辑输入区会自动解除回填标记。</p>
              </div>
            </div>
          ) : !hasInput ? (
            <div className="tbp-rack-flash" role="status">
              <span className="tbp-rack-flash-glyph" aria-hidden>⌁</span>
              <div>
                <strong>等待输入</strong>
                <p>在左侧输入文本后，此处会显示排序结果。</p>
              </div>
            </div>
          ) : (
            <ol className="tbp-rack-list">
              {result.units.map((u, i) => (
                <li
                  key={`${u.index}-${i}`}
                  className="tbp-rack-row"
                  aria-label={`已排序 第 ${i + 1} 行`}
                >
                  <span className="tbp-rack-pos" aria-hidden>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="tbp-rack-text">
                    {u.text === '' ? (
                      <em className="tbp-rack-empty">（空行）</em>
                    ) : (
                      u.text
                    )}
                  </span>
                  <span className="tbp-rack-meta-orig">原 {u.index + 1}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
};

export default SortTab;
