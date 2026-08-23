import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { useTextOps } from '../hooks/useTextOps';
import { useBackfillAndCopy } from '../hooks/useBackfillAndCopy';
import { replacePlainText } from '../utils/text-ops/replace';
import { validateRegex } from '../utils/regex';
import type { TextOpsMatch } from '../textOpsWorker';
import type { TbpAction, ReplaceState } from '../types';

interface ReplaceTabProps {
  inputText: string;
  state: ReplaceState;
  dispatch: React.Dispatch<TbpAction>;
}

const ReplaceTab: React.FC<ReplaceTabProps> = ({ inputText, state, dispatch }) => {
  const { justBackfilled, copied, handleBackfill, handleCopy, handleUndoBackfill, resetBackfill } = useBackfillAndCopy(inputText, dispatch);
  const previewRef = useRef<TextOpsMatch[]>([]);
  /** Worker 返回的替换文本缓存，执行时直接使用无需主线程重算 */
  const replacedTextRef = useRef<string>('');

  const hasInput = inputText.trim().length > 0;
  const { findPattern, replaceText, useRegex, flags, executed, result, count } = state;

  // 正则校验（正则模式）
  const regexInvalid = useMemo(() => {
    if (!useRegex) return false;
    if (!findPattern) return false;
    const v = validateRegex(findPattern, flags);
    return v.valid ? false : v.error;
  }, [useRegex, findPattern, flags]);

  // 正则模式预览：Worker replace 返回 replacedText + matches
  const handleWorkerResult = useCallback(
    (r: { ok: boolean; matches: TextOpsMatch[]; replacedText: string; error: string | null; timedOut?: boolean }) => {
      if (!r.ok) {
        dispatch({ type: 'TBP_SET_REPLACE_ERROR', payload: r.error });
        return;
      }
      previewRef.current = r.matches;
      replacedTextRef.current = r.replacedText;
      dispatch({ type: 'TBP_SET_REPLACE_PREVIEW', payload: { count: r.matches.length } });
    },
    [dispatch],
  );

  useTextOps({
    pattern: useRegex ? findPattern : '',
    flags,
    testText: inputText,
    replaceText,
    mode: 'replace',
    onResult: handleWorkerResult,
  });

  // 普通文本模式预览：纯函数即时计算（不走 Worker）
  useEffect(() => {
    if (useRegex) return;
    if (!hasInput || findPattern === '') {
      dispatch({ type: 'TBP_SET_REPLACE_PREVIEW', payload: { count: 0 } });
      return;
    }
    const r = replacePlainText(inputText, findPattern, replaceText, {
      ignoreCase: flags.includes('i'),
      global: flags.includes('g'),
    });
    previewRef.current = [];
    replacedTextRef.current = r.resultText;
    dispatch({ type: 'TBP_SET_REPLACE_PREVIEW', payload: { count: r.count } });
  }, [useRegex, hasInput, findPattern, replaceText, flags, dispatch]);

  // 执行替换：直接使用 Worker / 纯函数已计算的缓存结果
  const handleExecute = useCallback(() => {
    if (!hasInput || findPattern === '') return;
    if (useRegex && regexInvalid) return;
    const result = replacedTextRef.current;
    if (!result) return;
    resetBackfill();
    dispatch({ type: 'TBP_SET_REPLACE_EXECUTED', payload: { result, count } });
  }, [hasInput, findPattern, useRegex, regexInvalid, count, dispatch, resetBackfill]);

  // 预览高亮分段：基于原文本 + matches 位置（正则模式），或 indexOf（普通模式）
  const previewSegments = useMemo(() => {
    if (!hasInput || findPattern === '' || regexInvalid) return null;
    const text = inputText;
    const segs: Array<{ text: string; match: boolean }> = [];

    if (useRegex) {
      const ms = previewRef.current;
      if (ms.length === 0) return null;
      let cursor = 0;
      for (const m of ms) {
        if (m.index > cursor) segs.push({ text: text.slice(cursor, m.index), match: false });
        segs.push({ text: m.fullMatch, match: true });
        cursor = m.endIndex;
      }
      if (cursor < text.length) segs.push({ text: text.slice(cursor), match: false });
      return segs;
    }

    // 普通文本模式：indexOf 扫描位置
    const needle = findPattern;
    const lower = flags.includes('i');
    const searchIn = lower ? text.toLowerCase() : text;
    const needleL = lower ? needle.toLowerCase() : needle;
    let idx = searchIn.indexOf(needleL);
    let cursor = 0;
    const maxScan = 50000;
    let guard = 0;
    while (idx !== -1 && guard < maxScan) {
      if (idx > cursor) segs.push({ text: text.slice(cursor, idx), match: false });
      segs.push({ text: text.slice(idx, idx + needle.length), match: true });
      cursor = idx + needle.length;
      if (!flags.includes('g')) break; // 非全局仅首个
      idx = searchIn.indexOf(needleL, cursor);
      guard++;
    }
    if (cursor < text.length) segs.push({ text: text.slice(cursor), match: false });
    return segs;
  }, [hasInput, findPattern, useRegex, regexInvalid, flags, inputText]);

  const toggleFlag = useCallback(
    (f: string) => {
      const next = flags.includes(f) ? flags.replace(f, '') : flags + f;
      dispatch({ type: 'TBP_SET_REPLACE_FLAGS', payload: next });
      dispatch({ type: 'TBP_RESET_REPLACE' });
    },
    [flags, dispatch],
  );

  const resultText = result ?? '';

  const canPreview = hasInput && findPattern !== '' && !regexInvalid;
  const previewCount = canPreview ? count : 0;

  return (
    <div className="tbp-replace">
      {/* 查找 / 替换 双输入（始终可见） */}
      <section className="tbp-replace-inputs" aria-label="替换输入">
        <label className="tbp-replace-field">
          <span className="tbp-replace-field-label">查找</span>
          <input
            type="text"
            value={findPattern}
            onChange={(e) => {
              dispatch({ type: 'TBP_SET_REPLACE_PATTERN', payload: e.target.value });
              dispatch({ type: 'TBP_RESET_REPLACE' });
            }}
            placeholder={useRegex ? '输入正则，如 \\d+' : '输入要查找的文本'}
            spellCheck={false}
            className={`tbp-replace-field-input ${regexInvalid ? 'is-invalid' : ''}`}
            aria-label="查找内容"
            aria-invalid={!!regexInvalid}
            autoComplete="off"
          />
        </label>
        <label className="tbp-replace-field">
          <span className="tbp-replace-field-label">替换为</span>
          <input
            type="text"
            value={replaceText}
            onChange={(e) => {
              dispatch({ type: 'TBP_SET_REPLACE_TEXT', payload: e.target.value });
              dispatch({ type: 'TBP_RESET_REPLACE' });
            }}
            placeholder={useRegex ? '支持 $1 / ${name} 引用' : '替换后的文本'}
            spellCheck={false}
            className="tbp-replace-field-input"
            aria-label="替换内容"
            autoComplete="off"
          />
        </label>
      </section>

      {regexInvalid && (
        <div className="tbp-inline-error" role="alert">
          {regexInvalid}
        </div>
      )}

      {/* 选项胶囊 */}
      <div className="tbp-replace-options" role="group" aria-label="替换选项">
        <button
          type="button"
          className={`tbp-format-chip ${useRegex ? 'is-active' : ''}`}
          onClick={() => {
            dispatch({ type: 'TBP_SET_REPLACE_USE_REGEX', payload: !useRegex });
            dispatch({ type: 'TBP_RESET_REPLACE' });
          }}
          aria-pressed={useRegex}
        >
          正则模式
        </button>
        <button
          type="button"
          className={`tbp-format-chip ${flags.includes('i') ? 'is-active' : ''}`}
          onClick={() => toggleFlag('i')}
          aria-pressed={flags.includes('i')}
        >
          忽略大小写
        </button>
        <button
          type="button"
          className={`tbp-format-chip ${flags.includes('g') ? 'is-active' : ''}`}
          onClick={() => toggleFlag('g')}
          aria-pressed={flags.includes('g')}
        >
          全局替换
        </button>
        <button
          type="button"
          className={`tbp-format-chip ${flags.includes('m') ? 'is-active' : ''}`}
          onClick={() => toggleFlag('m')}
          aria-pressed={flags.includes('m')}
        >
          多行模式
        </button>
      </div>

      {/* 预览区（执行前高亮，防误操作） */}
      <section className="tbp-replace-preview" aria-label="替换预览">
        <div className="tbp-replace-preview-head">
          <span className="tbp-replace-preview-title">替换预览</span>
          <span className={`tbp-replace-preview-count ${canPreview && previewCount > 0 ? 'has-match' : ''}`}>
            {canPreview ? (previewCount > 0 ? `将替换 ${previewCount} 处` : '未匹配到内容，替换 0 处') : '输入查找内容后预览'}
          </span>
        </div>
        <div className="tbp-replace-preview-body">
          {!hasInput ? (
            <span className="tbp-replace-preview-placeholder">在左侧输入文本后，此处高亮显示将被替换的内容</span>
          ) : !canPreview ? (
            <span className="tbp-replace-preview-placeholder">
              {regexInvalid ? '正则无效，请修正后预览' : '输入查找内容后预览'}
            </span>
          ) : previewSegments && previewSegments.length > 0 ? (
            <p className="tbp-replace-preview-text">
              {previewSegments.map((seg, i) =>
                seg.match ? (
                  <mark key={i} className="tbp-match">{seg.text}</mark>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </p>
          ) : (
            <span className="tbp-replace-preview-placeholder">无匹配内容</span>
          )}
        </div>

        {/* 执行按钮（确认后才替换，防误操作） */}
        <div className="tbp-replace-actions">
          <button
            type="button"
            className="tbp-result-btn tbp-result-btn--primary tbp-exec-btn"
            onClick={handleExecute}
            disabled={!canPreview}
            aria-disabled={!canPreview}
          >
            执行替换
          </button>
        </div>
      </section>

      {/* 结果面板（执行后显示） */}
      {executed && resultText !== '' && (
        <section className="tbp-result tbp-result--extract" aria-label="替换结果">
          <div className="tbp-result-summary">
            <span className="tbp-result-summary-count">
              <span className="tbp-result-summary-num">{count}</span>
              <span className="tbp-result-summary-unit">处</span>
            </span>
            <span className="tbp-result-summary-meta">已替换 {count} 处</span>
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
          <div className="tbp-result-body">
            {justBackfilled ? (
              <div className="tbp-result-cleared" role="status">
                <span className="tbp-result-cleared-icon" aria-hidden>↩</span>
                <div className="tbp-result-cleared-body">
                  <strong>已回填到输入区</strong>
                  <span>编辑后会自动解除回填标记</span>
                </div>
              </div>
            ) : (
              <pre className="tbp-replace-result-text">{resultText}</pre>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default ReplaceTab;
