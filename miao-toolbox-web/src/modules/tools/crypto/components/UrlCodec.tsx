/**
 * URL 编解码面板
 *
 * 使用 CodecPanel 分栏布局，自动处理（防抖 200ms）。
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { UrlState, CryptoAction, HistoryEntry } from '../types';
import { urlEncode, urlDecode } from '../utils/url';
import CodecPanel from './CodecPanel';

export interface UrlCodecProps {
  state: UrlState;
  dispatch: React.Dispatch<CryptoAction>;
  onHistoryAdd?: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

const ENCODE_TYPE_LABELS: Record<'component' | 'full', string> = {
  component: '参数值',
  full: '完整URL',
};

const UrlCodec: React.FC<UrlCodecProps> = ({ state, dispatch, onHistoryAdd }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHistoryAddRef = useRef(onHistoryAdd);
  useEffect(() => { onHistoryAddRef.current = onHistoryAdd; }, [onHistoryAdd]);

  // 自动处理：输入变化后 200ms 自动执行
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);

    const trimmed = state.input.trim();
    if (!trimmed) {
      dispatch({ type: 'CRYPTO_URL_SET_OUTPUT', payload: '' });
      return;
    }

    timerRef.current = setTimeout(() => {
      try {
        let result: string;
        if (state.mode === 'encode') {
          result = urlEncode(trimmed, state.encodeType);
          dispatch({ type: 'CRYPTO_URL_SET_OUTPUT', payload: result });
        } else {
          result = urlDecode(trimmed);
          dispatch({ type: 'CRYPTO_URL_SET_OUTPUT', payload: result });
        }
        // 再延迟 1200ms 记录历史，避免输入过程中刷屏
        historyTimerRef.current = setTimeout(() => {
          onHistoryAddRef.current?.({
            tabKey: 'url',
            action: state.mode === 'encode'
              ? state.encodeType === 'component' ? 'encodeURIComponent 编码' : 'encodeURI 编码'
              : 'URL 解码',
            input: trimmed.slice(0, 500),
            output: result.slice(0, 500),
          });
        }, 1200);
      } catch {
        dispatch({ type: 'CRYPTO_URL_SET_OUTPUT', payload: '' });
      }
    }, 200);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    };
  }, [state.input, state.mode, state.encodeType, dispatch]);

  const handleModeChange = useCallback(
    (mode: 'encode' | 'decode') => {
      dispatch({ type: 'CRYPTO_URL_SET_MODE', payload: mode });
    },
    [dispatch],
  );

  const handleSwap = useCallback(() => {
    if (state.output) {
      dispatch({ type: 'CRYPTO_URL_SET_INPUT', payload: state.output });
      dispatch({ type: 'CRYPTO_URL_SET_OUTPUT', payload: '' });
    }
  }, [dispatch, state.output]);

  const toggleEncodeType = useCallback(() => {
    if (state.mode !== 'encode') return;
    const nextType = state.encodeType === 'component' ? 'full' : 'component';
    dispatch({ type: 'CRYPTO_URL_SET_ENCODE_TYPE', payload: nextType });
  }, [dispatch, state.mode, state.encodeType]);

  const modeButtons = useMemo(
    () => [
      { key: 'encode', label: '编码', active: state.mode === 'encode', onClick: () => handleModeChange('encode') },
      { key: 'decode', label: '解码', active: state.mode === 'decode', onClick: () => handleModeChange('decode') },
    ],
    [state.mode, handleModeChange],
  );

  const inputFooter = (
    <button
      className={`crypto-chip ${state.mode === 'encode' ? '' : 'success'} ${state.mode === 'encode' ? 'clickable' : ''}`}
      onClick={state.mode === 'encode' ? toggleEncodeType : undefined}
      title={state.mode === 'encode' ? '点击切换编码模式' : undefined}
    >
      {state.mode === 'encode' ? ENCODE_TYPE_LABELS[state.encodeType] : '解码模式'}
    </button>
  );

  return (
    <CodecPanel
      input={state.input}
      onInputChange={(v) => dispatch({ type: 'CRYPTO_URL_SET_INPUT', payload: v })}
      output={state.output}
      inputPlaceholder={state.mode === 'encode' ? '输入要编码的文本...' : '输入要解码的 URL 编码字符串...'}
      inputLabel="输入"
      outputLabel={state.mode === 'encode' ? '编码结果' : '解码结果'}
      inputMeta={state.input ? `${state.input.length} 字符` : undefined}
      outputMeta={state.output ? `${state.output.length} 字符` : undefined}
      modeButtons={modeButtons}
      onSwap={handleSwap}
      inputFooter={inputFooter}
    />
  );
};

export default UrlCodec;
