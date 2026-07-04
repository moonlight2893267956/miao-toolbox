/**
 * Escape 编解码面板
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { EscapeState, CryptoAction, HistoryEntry } from '../types';
import { escapeEncode, escapeDecode } from '../utils/escape';
import CodecPanel from './CodecPanel';

export interface EscapeCodecProps {
  state: EscapeState;
  dispatch: React.Dispatch<CryptoAction>;
  onHistoryAdd?: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

const EscapeCodec: React.FC<EscapeCodecProps> = ({ state, dispatch, onHistoryAdd }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHistoryAddRef = useRef(onHistoryAdd);
  useEffect(() => { onHistoryAddRef.current = onHistoryAdd; }, [onHistoryAdd]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);

    const trimmed = state.input.trim();
    if (!trimmed) {
      dispatch({ type: 'CRYPTO_ESCAPE_SET_OUTPUT', payload: '' });
      return;
    }

    timerRef.current = setTimeout(() => {
      try {
        let result: string;
        if (state.mode === 'encode') {
          result = escapeEncode(trimmed);
          dispatch({ type: 'CRYPTO_ESCAPE_SET_OUTPUT', payload: result });
        } else {
          result = escapeDecode(trimmed);
          dispatch({ type: 'CRYPTO_ESCAPE_SET_OUTPUT', payload: result });
        }
        historyTimerRef.current = setTimeout(() => {
          onHistoryAddRef.current?.({
            tabKey: 'escape', action: state.mode === 'encode' ? 'Escape 编码' : 'Unescape 解码',
            input: trimmed.slice(0, 500), output: result.slice(0, 500),
          });
        }, 1200);
      } catch {
        dispatch({ type: 'CRYPTO_ESCAPE_SET_OUTPUT', payload: '' });
      }
    }, 200);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    };
  }, [state.input, state.mode, dispatch]);

  const handleModeChange = useCallback(
    (mode: 'encode' | 'decode') => {
      dispatch({ type: 'CRYPTO_ESCAPE_SET_MODE', payload: mode });
    },
    [dispatch],
  );

  const handleSwap = useCallback(() => {
    if (state.output) {
      dispatch({ type: 'CRYPTO_ESCAPE_SET_INPUT', payload: state.output });
      dispatch({ type: 'CRYPTO_ESCAPE_SET_OUTPUT', payload: '' });
    }
  }, [dispatch, state.output]);

  const modeButtons = useMemo(() => [
    { key: 'encode', label: '编码', active: state.mode === 'encode', onClick: () => handleModeChange('encode') },
    { key: 'decode', label: '解码', active: state.mode === 'decode', onClick: () => handleModeChange('decode') },
  ], [state.mode, handleModeChange]);

  return (
    <CodecPanel
      input={state.input}
      onInputChange={(v) => dispatch({ type: 'CRYPTO_ESCAPE_SET_INPUT', payload: v })}
      output={state.output}
      inputPlaceholder={state.mode === 'encode' ? '输入要转义的文本（支持中文、特殊字符）...' : '输入转义后的字符串（如 \\uXXXX）...'}
      inputLabel="输入"
      outputLabel={state.mode === 'encode' ? '转义结果' : '还原结果'}
      inputMeta={state.input ? `${state.input.length} 字符` : undefined}
      outputMeta={state.output ? `${state.output.length} 字符` : undefined}
      modeButtons={modeButtons}
      onSwap={handleSwap}
    />
  );
};

export default EscapeCodec;
