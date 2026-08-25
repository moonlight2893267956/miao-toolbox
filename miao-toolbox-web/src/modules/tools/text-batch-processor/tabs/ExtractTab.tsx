import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import RegexWorkbench from '../components/RegexWorkbench';
import { useTextOps } from '../hooks/useTextOps';
import { useBackfillAndCopy } from '../hooks/useBackfillAndCopy';
import { extractLinesContaining, formatExtractMatches, countUniqueMatches, splitLines } from '../utils/text-ops/extract';
import type { ExtractMatch, ExtractFormat } from '../utils/text-ops/extract';
import { PRESET_LINE_CONTAINS } from '../data/presets';
import type { TbpAction, ExtractState } from '../types';

interface ExtractTabProps {
  inputText: string;
  state: ExtractState;
  dispatch: React.Dispatch<TbpAction>;
  onLocateMatch?: (start: number, end: number) => void;
}

const FORMAT_PRESETS: { value: ExtractFormat; label: string; hint: string }[] = [
  { value: 'all', label: '每行一个', hint: '完整匹配' },
  { value: 'dedup', label: '去重', hint: '合并相同' },
  { value: 'groups', label: '仅捕获组', hint: '第 1 组' },
];

const ExtractTab: React.FC<ExtractTabProps> = ({ inputText, state, dispatch, onLocateMatch }) => {
  const { justBackfilled, copied, handleBackfill, handleCopy, handleUndoBackfill } = useBackfillAndCopy(inputText, dispatch);
  const matchesRef = useRef<ExtractMatch[]>([]);

  const isLineContains = state.pattern === PRESET_LINE_CONTAINS;
  const hasInput = inputText.trim().length > 0;

  // 正则模式：Worker 提取（保存原始 matches 以支持格式切换）
  const handleResult = useCallback(
    (r: { ok: boolean; matches: ExtractMatch[]; error: string | null }) => {
      if (r.ok) {
        matchesRef.current = r.matches;
        dispatch({
          type: 'TBP_SET_EXTRACT_RESULT',
          payload: {
            result: formatExtractMatches(r.matches, state.format),
            count: state.format === 'dedup' ? countUniqueMatches(r.matches) : r.matches.length,
          },
        });
      } else {
        dispatch({ type: 'TBP_SET_EXTRACT_ERROR', payload: r.error });
      }
    },
    [dispatch, state.format],
  );

  useTextOps({
    pattern: isLineContains ? '' : state.pattern,
    flags: state.flags,
    testText: inputText,
    replaceText: '',
    mode: 'extract',
    onResult: handleResult,
  });

  // 行包含模式：纯函数即时提取（不走 Worker）
  useEffect(() => {
    if (!isLineContains) return;
    if (!hasInput) {
      dispatch({ type: 'TBP_SET_EXTRACT_RESULT', payload: { result: '', count: 0 } });
      return;
    }
    const r = extractLinesContaining(inputText, { keyword: state.keyword, ignoreCase: state.flags.includes('i') });
    // 双指针：将 r.lines 映射回原文字符偏移量
    const allLines = splitLines(inputText);
    const lineOffsets: number[] = [];
    let off = 0;
    for (const line of allLines) {
      lineOffsets.push(off);
      off += line.length + 1;
    }
    const matches: ExtractMatch[] = [];
    let li = 0;
    for (let i = 0; i < allLines.length && li < r.lines.length; i++) {
      if (allLines[i] === r.lines[li]) {
        matches.push({ fullMatch: allLines[i], index: lineOffsets[i], endIndex: lineOffsets[i] + allLines[i].length });
        li++;
      }
    }
    matchesRef.current = matches;
    dispatch({ type: 'TBP_SET_EXTRACT_RESULT', payload: { result: r.resultText, count: r.stats.remaining } });
  }, [isLineContains, inputText, state.keyword, state.flags, hasInput, dispatch]);

  // 格式切换：基于已保存的 matches 重新格式化（不重跑 Worker）
  const handleFormatChange = useCallback(
    (format: ExtractFormat) => {
      dispatch({ type: 'TBP_SET_EXTRACT_FORMAT', payload: format });
      const m = matchesRef.current;
      if (m.length > 0) {
        dispatch({
          type: 'TBP_SET_EXTRACT_RESULT',
          payload: {
            result: formatExtractMatches(m, format),
            count: format === 'dedup' ? countUniqueMatches(m) : m.length,
          },
        });
      }
    },
    [dispatch],
  );

  // 非法正则：清空结果 + 显示错误
  const regexInvalid = useMemo(() => {
    if (isLineContains) return false;
    if (!state.pattern) return false;
    try {
      // eslint-disable-next-line no-new
      new RegExp(state.pattern, state.flags);
      return false;
    } catch (e) {
      return (e as Error).message;
    }
  }, [isLineContains, state.pattern, state.flags]);

  const resultText = state.result ?? '';

  const handlePresetSelect = useCallback(
    (key: string, presetPattern: string, presetFlags: string) => {
      dispatch({ type: 'TBP_SET_EXTRACT_PATTERN', payload: presetPattern });
      dispatch({ type: 'TBP_SET_EXTRACT_FLAGS', payload: presetFlags });
      if (key === 'line-contains') {
        // 行包含：清空正则展示为特殊值
        dispatch({ type: 'TBP_SET_EXTRACT_PATTERN', payload: PRESET_LINE_CONTAINS });
      }
    },
    [dispatch],
  );

  const resultLines = useMemo(() => resultText.split('\n'), [resultText]);

  // 点击结果行 → 定位到输入区对应位置
  const handleLineClick = useCallback(
    (i: number) => {
      if (!onLocateMatch) return;
      const matches = matchesRef.current;
      if (matches.length === 0) return;
      let match: ExtractMatch | undefined;
      if (state.format === 'dedup') {
        match = matches.find((m) => m.fullMatch === resultLines[i]);
      } else {
        match = matches[i];
      }
      if (match && match.index >= 0 && match.endIndex > match.index) {
        onLocateMatch(match.index, match.endIndex);
      }
    },
    [onLocateMatch, state.format, resultLines],
  );

  return (
    <div className="tbp-extract">
      <section className="tbp-result tbp-result--extract" aria-label="提取结果">
        {/* 正则工作台：输入框 + 标志位 + 预设（始终可见） */}
        <div className="tbp-extract-options">
          <RegexWorkbench
            pattern={state.pattern}
            flags={state.flags}
            onPatternChange={(v) => {
              dispatch({ type: 'TBP_SET_EXTRACT_PATTERN', payload: v });
              dispatch({ type: 'TBP_SET_EXTRACT_ERROR', payload: null });
            }}
            onFlagsChange={(v) => dispatch({ type: 'TBP_SET_EXTRACT_FLAGS', payload: v })}
            onPresetSelect={handlePresetSelect}
            keyword={state.keyword}
            onKeywordChange={(v) => dispatch({ type: 'TBP_SET_EXTRACT_KEYWORD', payload: v })}
            ariaLabel="提取正则表达式"
          />
        </div>

        {/* 统计 + 格式 + 操作 */}
        <div className="tbp-result-summary">
          <span className="tbp-result-summary-count">
            <span className="tbp-result-summary-num">{state.count}</span>
            <span className="tbp-result-summary-unit">项</span>
          </span>
          {hasInput && state.pattern && !regexInvalid && (
            <span className="tbp-result-summary-meta">
              {state.count > 0 ? '提取成功' : '无匹配项'}
            </span>
          )}
          <div className="tbp-result-summary-right">
            <div className="tbp-format-bar" role="group" aria-label="结果格式">
              <span className="tbp-format-bar-label">格式</span>
              {FORMAT_PRESETS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={`tbp-format-chip ${state.format === f.value ? 'is-active' : ''}`}
                  onClick={() => handleFormatChange(f.value)}
                  title={f.hint}
                  aria-pressed={state.format === f.value}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="tbp-result-actions">
              <button
                type="button"
                className={`tbp-result-btn tbp-result-btn--ghost ${copied ? 'is-copied' : ''}`}
                onClick={() => handleCopy(resultText)}
                disabled={!resultText}
                aria-label="复制结果"
              >
                <span className="tbp-btn-icon" aria-hidden>{copied ? '✓' : '⧉'}</span>
                {copied ? '已复制' : '复制'}
              </button>
              <button
                type="button"
                className="tbp-result-btn tbp-result-btn--primary"
                onClick={justBackfilled ? handleUndoBackfill : () => handleBackfill(resultText)}
                disabled={!resultText}
              >
                <span className="tbp-btn-icon" aria-hidden>{justBackfilled ? '↺' : '↩'}</span>
                {justBackfilled ? '撤销回填' : '回填'}
              </button>
            </div>
          </div>
        </div>

        <div className="tbp-result-body">
          {regexInvalid ? (
            <div className="tbp-result-empty">
              <span className="tbp-result-empty-icon" aria-hidden>!</span>
              <div className="tbp-result-empty-body">
                <strong>正则无效</strong>
                <span>{regexInvalid}</span>
              </div>
            </div>
          ) : justBackfilled ? (
            <div className="tbp-result-cleared" role="status">
              <span className="tbp-result-cleared-icon" aria-hidden>↩</span>
              <div className="tbp-result-cleared-body">
                <strong>已回填到输入区</strong>
                <span>编辑后会自动解除回填标记</span>
              </div>
            </div>
          ) : !hasInput ? (
            <div className="tbp-result-empty">
              <span className="tbp-result-empty-icon" aria-hidden>⌁</span>
              <div className="tbp-result-empty-body">
                <strong>等待输入</strong>
                <span>在左侧输入文本后，此处会显示提取结果</span>
              </div>
            </div>
          ) : resultText === '' ? (
            <div className="tbp-result-empty">
              <span className="tbp-result-empty-icon" aria-hidden>∅</span>
              <div className="tbp-result-empty-body">
                <strong>未提取到内容</strong>
                <span>没有匹配项，尝试调整正则或预设</span>
              </div>
            </div>
          ) : (
            <ol className="tbp-result-list">
              {resultLines.map((line, i) => (
                <li
                  key={i}
                  className="tbp-result-line tbp-result-line--clickable"
                  onClick={() => handleLineClick(i)}
                  title="点击定位到输入区"
                >
                  <span className="tbp-result-line-num">{i + 1}</span>
                  <span className="tbp-result-line-tick" aria-hidden />
                  <span className="tbp-result-line-text">
                    {line === '' ? <em>（空行）</em> : (
                      <span className="tbp-match">{line}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
};

export default ExtractTab;
