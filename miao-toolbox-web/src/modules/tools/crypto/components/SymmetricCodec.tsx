/**
 * 对称加解密面板（AES / DES / TripleDES）
 *
 * 控制区位于面板上方，包含算法、模式、密钥格式、密钥、IV。
 * 支持自动检测密文格式（Base64/Hex）。
 */

import React, { useCallback, useState } from 'react';
import { message } from 'antd';
import type { SymmetricState, CryptoAction, SymmetricAlgo, KeyFormat, HistoryEntry } from '../types';
import { symmetricEncrypt, symmetricDecrypt, getSupportedModes } from '../utils/symmetric';
import CodecPanel from './CodecPanel';

export interface SymmetricCodecProps {
  state: SymmetricState;
  dispatch: React.Dispatch<CryptoAction>;
  onHistoryAdd?: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

const ALGO_OPTIONS: { value: SymmetricAlgo; label: string }[] = [
  { value: 'AES', label: 'AES' },
  { value: 'DES', label: 'DES' },
  { value: 'TripleDES', label: '3DES' },
];

const KEY_FORMATS: { value: KeyFormat; label: string }[] = [
  { value: 'Utf8', label: 'Utf8' },
  { value: 'Base64', label: 'Base64' },
  { value: 'Hex', label: 'Hex' },
];

const SymmetricCodec: React.FC<SymmetricCodecProps> = ({ state, dispatch, onHistoryAdd }) => {
  const [processing, setProcessing] = useState(false);

  const supportedModes = getSupportedModes(state.algorithm);
  const showIv = state.symmetricMode !== 'ECB';

  const handleAlgorithmChange = useCallback(
    (algo: SymmetricAlgo) => {
      dispatch({ type: 'CRYPTO_SYM_SET_ALGORITHM', payload: algo });
      // 切换到 DES 系列时，如果当前模式不支持，则回退到 CBC
      if (algo !== 'AES' && state.symmetricMode !== 'CBC' && state.symmetricMode !== 'ECB') {
        dispatch({ type: 'CRYPTO_SYM_SET_SYMMETRIC_MODE', payload: 'CBC' });
      }
    },
    [dispatch, state.symmetricMode],
  );

  const handleProcess = useCallback(() => {
    if (!state.input.trim()) {
      message.warning('请先输入文本');
      return;
    }
    if (!state.key.trim()) {
      message.warning('请输入密钥');
      return;
    }
    if (showIv && !state.iv.trim()) {
      message.warning('当前模式需要输入 IV');
      return;
    }
    setProcessing(true);
    try {
      if (state.mode === 'encrypt') {
        const result = symmetricEncrypt(
          state.input, state.key, state.algorithm, state.symmetricMode,
          state.keyFormat, showIv ? state.iv : undefined,
        );
        dispatch({ type: 'CRYPTO_SYM_SET_OUTPUT', payload: result });
        onHistoryAdd?.({
          tabKey: 'symmetric',
          action: `${state.algorithm}-${state.symmetricMode} 加密`,
          input: state.input.slice(0, 500),
          output: result.slice(0, 500),
        });
      } else {
        const result = symmetricDecrypt(
          state.input, state.key, state.algorithm, state.symmetricMode,
          state.keyFormat, showIv ? state.iv : undefined,
        );
        dispatch({ type: 'CRYPTO_SYM_SET_OUTPUT', payload: result });
        onHistoryAdd?.({
          tabKey: 'symmetric',
          action: `${state.algorithm}-${state.symmetricMode} 解密`,
          input: state.input.slice(0, 500),
          output: result.slice(0, 500),
        });
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
      dispatch({ type: 'CRYPTO_SYM_SET_OUTPUT', payload: '' });
    } finally {
      setProcessing(false);
    }
  }, [state.input, state.key, state.iv, state.mode, state.algorithm, state.symmetricMode, state.keyFormat, showIv, onHistoryAdd, dispatch]);

  const handleSwap = useCallback(() => {
    if (state.output) {
      dispatch({ type: 'CRYPTO_SYM_SET_INPUT', payload: state.output });
      dispatch({ type: 'CRYPTO_SYM_SET_OUTPUT', payload: '' });
    }
  }, [dispatch, state.output]);

  const controls = (
    <div className="crypto-sym-top-controls">
      <div className="crypto-sym-controls-row">
        <label className="crypto-sym-controls-label">算法</label>
        <div className="crypto-mode-inline">
          {ALGO_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`crypto-mode-inline-btn ${state.algorithm === opt.value ? 'active' : ''}`}
              onClick={() => handleAlgorithmChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="crypto-sym-controls-row">
        <label className="crypto-sym-controls-label">模式</label>
        <div className="crypto-mode-inline">
          {supportedModes.map((mode) => (
            <button
              key={mode}
              className={`crypto-mode-inline-btn ${state.symmetricMode === mode ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'CRYPTO_SYM_SET_SYMMETRIC_MODE', payload: mode })}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      <div className="crypto-sym-controls-row">
        <label className="crypto-sym-controls-label">密钥格式</label>
        <div className="crypto-mode-inline">
          {KEY_FORMATS.map((fmt) => (
            <button
              key={fmt.value}
              className={`crypto-mode-inline-btn ${state.keyFormat === fmt.value ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'CRYPTO_SYM_SET_KEY_FORMAT', payload: fmt.value })}
            >
              {fmt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="crypto-sym-controls-row">
        <label className="crypto-sym-controls-label">密钥</label>
        <input
          type="text"
          className="crypto-sym-key-input"
          placeholder="输入密钥"
          value={state.key}
          onChange={(e) => dispatch({ type: 'CRYPTO_SYM_SET_KEY', payload: e.target.value })}
        />
        {showIv && (
          <input
            type="text"
            className="crypto-sym-key-input"
            placeholder="输入 IV（Hex 或 文本）"
            value={state.iv}
            onChange={(e) => dispatch({ type: 'CRYPTO_SYM_SET_IV', payload: e.target.value })}
          />
        )}
        <button className="crypto-sym-action-btn" onClick={handleProcess} disabled={processing}>
          {processing ? '处理中...' : state.mode === 'encrypt' ? '加密' : '解密'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="crypto-sym-layout">
      {controls}
      <CodecPanel
        input={state.input}
        onInputChange={(v) => dispatch({ type: 'CRYPTO_SYM_SET_INPUT', payload: v })}
        output={state.output}
        inputPlaceholder={state.mode === 'encrypt' ? '输入要加密的明文...' : '输入 Base64 或 Hex 密文...'}
        inputLabel="输入"
        outputLabel={state.mode === 'encrypt' ? '密文 (Base64)' : '解密结果'}
        inputMeta={state.input ? `${state.input.length} 字符` : undefined}
        outputMeta={state.output ? `${state.output.length} 字符` : undefined}
        modeButtons={[
          { key: 'encrypt', label: '加密', active: state.mode === 'encrypt', onClick: () => dispatch({ type: 'CRYPTO_SYM_SET_MODE', payload: 'encrypt' }) },
          { key: 'decrypt', label: '解密', active: state.mode === 'decrypt', onClick: () => dispatch({ type: 'CRYPTO_SYM_SET_MODE', payload: 'decrypt' }) },
        ]}
        onSwap={handleSwap}
      />
    </div>
  );
};

export default SymmetricCodec;
