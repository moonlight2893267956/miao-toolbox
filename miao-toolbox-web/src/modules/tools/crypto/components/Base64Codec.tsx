/**
 * Base64 编解码面板
 *
 * 使用 CodecPanel 分栏布局，自动处理（防抖 200ms）。
 * 支持标准 Base64 和 URL-Safe Base64，解码非文本自动转 Hex。
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { message } from 'antd';
import type { Base64State, CryptoAction, HistoryEntry } from '../types';
import { base64Encode, base64Decode } from '../utils/base64';
import CodecPanel from './CodecPanel';

export interface Base64CodecProps {
  state: Base64State;
  dispatch: React.Dispatch<CryptoAction>;
  onHistoryAdd?: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

const Base64Codec: React.FC<Base64CodecProps> = ({ state, dispatch, onHistoryAdd }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHistoryAddRef = useRef(onHistoryAdd);
  useEffect(() => { onHistoryAddRef.current = onHistoryAdd; }, [onHistoryAdd]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);

    const trimmed = state.input.trim();
    if (!trimmed) {
      dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT', payload: '' });
      dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT_NOTICE', payload: undefined });
      return;
    }

    timerRef.current = setTimeout(() => {
      if (state.mode === 'encode') {
        const result = base64Encode(trimmed, state.urlSafe);
        dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT', payload: result });
        dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT_NOTICE', payload: undefined });
        historyTimerRef.current = setTimeout(() => {
          onHistoryAddRef.current?.({
            tabKey: 'base64', action: 'Base64 编码',
            input: trimmed.slice(0, 500), output: result.slice(0, 500),
          });
        }, 1200);
      } else {
        try {
          const result = base64Decode(trimmed, state.urlSafe);
          historyTimerRef.current = setTimeout(() => {
            onHistoryAddRef.current?.({
              tabKey: 'base64', action: 'Base64 解码',
              input: trimmed.slice(0, 500), output: (result.hex ?? result.text).slice(0, 500),
            });
          }, 1200);
          if (result.isBinary) {
            dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT', payload: result.hex ?? result.text });
            dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT_NOTICE', payload: '非文本内容，已转为 Hex' });
          } else {
            dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT', payload: result.text });
            dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT_NOTICE', payload: undefined });
          }
        } catch (e) {
          message.error(e instanceof Error ? e.message : '不是有效的 Base64 编码');
          dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT', payload: '' });
          dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT_NOTICE', payload: undefined });
        }
      }
    }, 200);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    };
  }, [state.input, state.mode, state.urlSafe, dispatch]);

  const handleModeChange = useCallback(
    (mode: 'encode' | 'decode') => {
      dispatch({ type: 'CRYPTO_BASE64_SET_MODE', payload: mode });
      dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT_NOTICE', payload: undefined });
    },
    [dispatch],
  );

  const handleSwap = useCallback(() => {
    if (state.output) {
      dispatch({ type: 'CRYPTO_BASE64_SET_INPUT', payload: state.output });
      dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT', payload: '' });
      dispatch({ type: 'CRYPTO_BASE64_SET_OUTPUT_NOTICE', payload: undefined });
    }
  }, [dispatch, state.output]);

  const modeButtons = useMemo(
    () => [
      { key: 'encode', label: '编码', active: state.mode === 'encode', onClick: () => handleModeChange('encode') },
      { key: 'decode', label: '解码', active: state.mode === 'decode', onClick: () => handleModeChange('decode') },
    ],
    [state.mode, handleModeChange],
  );

  const toggleUrlSafe = useCallback(() => {
    dispatch({ type: 'CRYPTO_BASE64_SET_URL_SAFE', payload: !state.urlSafe });
  }, [dispatch, state.urlSafe]);

  const inputFooter = (
    <button
      className={`crypto-chip ${state.urlSafe ? '' : 'success'} clickable`}
      onClick={toggleUrlSafe}
      title="切换 Base64 字符集"
    >
      {state.urlSafe ? 'URL-Safe' : 'Standard'}
    </button>
  );

  const outputExtra = state.outputNotice ? (
    <div
      style={{
        padding: '6px 14px',
        fontSize: 12,
        color: 'var(--crypto-amber)',
        background: 'rgba(251,191,36,0.06)',
        borderTop: '1px solid rgba(251,191,36,0.15)',
      }}
    >
      ⚠ {state.outputNotice}
    </div>
  ) : undefined;

  return (
    <CodecPanel
      input={state.input}
      onInputChange={(v) => dispatch({ type: 'CRYPTO_BASE64_SET_INPUT', payload: v })}
      output={state.output}
      inputPlaceholder={state.mode === 'encode' ? '输入要编码的文本...' : '输入 Base64 编码字符串...'}
      inputLabel="输入"
      outputLabel={state.mode === 'encode' ? 'Base64 编码' : 'Base64 解码'}
      inputMeta={state.input ? `${state.input.length} 字符` : undefined}
      outputMeta={state.output ? `${state.output.length} 字符` : undefined}
      modeButtons={modeButtons}
      onSwap={handleSwap}
      inputFooter={inputFooter}
      outputExtra={outputExtra}
    />
  );
};

export default Base64Codec;
