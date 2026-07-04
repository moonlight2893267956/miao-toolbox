/**
 * RSA 加解密面板
 *
 * 支持密钥生成、公钥加密、私钥解密，支持 PKCS1 v1.5 / OAEP 填充。
 */

import React, { useCallback, useState } from 'react';
import { message } from 'antd';
import { CheckOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import type { RsaState, CryptoAction, HistoryEntry } from '../types';
import { generateRsaKeyPair, rsaEncrypt, rsaDecrypt } from '../utils/rsa';
import CodecPanel from './CodecPanel';

export interface RsaCodecProps {
  state: RsaState;
  dispatch: React.Dispatch<CryptoAction>;
  onHistoryAdd?: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

const KEY_SIZE_OPTIONS: { value: 512 | 1024 | 2048 | 4096; label: string }[] = [
  { value: 512, label: '512' },
  { value: 1024, label: '1024' },
  { value: 2048, label: '2048' },
  { value: 4096, label: '4096' },
];

/** 独立的密钥展示 + 复制组件（避免 lint 报 "component created during render"） */
const KeyBlock: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, value, onChange }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  if (!value) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--crypto-text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>
          {label}
        </span>
        <button className="crypto-copy-btn" onClick={handleCopy} style={{ color: copied ? '#4ade80' : undefined }}>
          {copied ? <><CheckOutlined /> 已复制</> : <><CopyOutlined /> 复制</>}
        </button>
      </div>
      <textarea
        className="crypto-key-display"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        spellCheck={false}
        style={{ width: '100%', resize: 'vertical' }}
      />
    </div>
  );
};

const RsaCodec: React.FC<RsaCodecProps> = ({ state, dispatch, onHistoryAdd }) => {
  const [processing, setProcessing] = useState(false);

  const handleGenerateKeys = useCallback(async () => {
    dispatch({ type: 'CRYPTO_RSA_SET_GENERATING', payload: true });
    try {
      const { publicKey, privateKey } = await generateRsaKeyPair(state.keySize);
      dispatch({ type: 'CRYPTO_RSA_SET_PUBLIC_KEY', payload: publicKey });
      dispatch({ type: 'CRYPTO_RSA_SET_PRIVATE_KEY', payload: privateKey });
      message.success('RSA 密钥对生成成功');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '密钥生成失败');
    } finally {
      dispatch({ type: 'CRYPTO_RSA_SET_GENERATING', payload: false });
    }
  }, [state.keySize, dispatch]);

  const handleProcess = useCallback(() => {
    if (!state.input.trim()) {
      message.warning('请先输入文本');
      return;
    }
    setProcessing(true);
    try {
      if (state.mode === 'encrypt') {
        if (!state.publicKey) {
          message.warning('请先生成或导入公钥');
          return;
        }
        const result = rsaEncrypt(state.input, state.publicKey, state.keySize, state.padding);
        dispatch({ type: 'CRYPTO_RSA_SET_OUTPUT', payload: result });
        onHistoryAdd?.({
          tabKey: 'rsa',
          action: `RSA 加密 (${state.padding === 'oaep' ? 'OAEP' : 'PKCS1 v1.5'})`,
          input: state.input.slice(0, 500),
          output: result.slice(0, 500),
        });
      } else {
        if (!state.privateKey) {
          message.warning('请先生成或导入私钥');
          return;
        }
        const result = rsaDecrypt(state.input, state.privateKey, state.padding);
        dispatch({ type: 'CRYPTO_RSA_SET_OUTPUT', payload: result });
        onHistoryAdd?.({
          tabKey: 'rsa',
          action: `RSA 解密 (${state.padding === 'oaep' ? 'OAEP' : 'PKCS1 v1.5'})`,
          input: state.input.slice(0, 500),
          output: result.slice(0, 500),
        });
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
      dispatch({ type: 'CRYPTO_RSA_SET_OUTPUT', payload: '' });
    } finally {
      setProcessing(false);
    }
  }, [state.input, state.mode, state.publicKey, state.privateKey, state.keySize, state.padding, onHistoryAdd, dispatch]);

  return (
    <div className="crypto-sym-layout">
      <div className="crypto-sym-top-controls">
        <div className="crypto-sym-controls-row">
          <label className="crypto-sym-controls-label">密钥长度</label>
          <div className="crypto-mode-inline">
            {KEY_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`crypto-mode-inline-btn ${state.keySize === opt.value ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'CRYPTO_RSA_SET_KEY_SIZE', payload: opt.value })}
              >
                {opt.label}bit
              </button>
            ))}
          </div>
          <label className="crypto-sym-controls-label">填充模式</label>
          <div className="crypto-mode-inline">
            <button
              className={`crypto-mode-inline-btn ${state.padding === 'pkcs1' ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'CRYPTO_RSA_SET_PADDING', payload: 'pkcs1' })}
            >
              PKCS1 v1.5
            </button>
            <button
              className={`crypto-mode-inline-btn ${state.padding === 'oaep' ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'CRYPTO_RSA_SET_PADDING', payload: 'oaep' })}
            >
              OAEP
            </button>
          </div>
          <button
            className="crypto-sym-action-btn"
            onClick={handleGenerateKeys}
            disabled={state.generating}
            style={{ marginLeft: 'auto' }}
          >
            <ReloadOutlined style={{ marginRight: 4 }} />
            {state.generating ? '生成中...' : '生成密钥对'}
          </button>
        </div>
      </div>

      <div className="crypto-hash-top-controls" style={{ padding: 18 }}>
        <KeyBlock
          label="公钥 (Public Key)"
          value={state.publicKey}
          onChange={(v) => dispatch({ type: 'CRYPTO_RSA_SET_PUBLIC_KEY', payload: v })}
        />
        <KeyBlock
          label="私钥 (Private Key)"
          value={state.privateKey}
          onChange={(v) => dispatch({ type: 'CRYPTO_RSA_SET_PRIVATE_KEY', payload: v })}
        />
      </div>

      <CodecPanel
        input={state.input}
        onInputChange={(v) => dispatch({ type: 'CRYPTO_RSA_SET_INPUT', payload: v })}
        output={state.output}
        inputPlaceholder={state.mode === 'encrypt' ? '输入要加密的明文...' : '输入 Base64 密文...'}
        inputLabel="输入"
        outputLabel={state.mode === 'encrypt' ? '加密结果 (Base64)' : '解密结果'}
        inputMeta={state.input ? `${state.input.length} 字符` : undefined}
        outputMeta={state.output ? `${state.output.length} 字符` : undefined}
        modeButtons={[
          { key: 'encrypt', label: '加密', active: state.mode === 'encrypt', onClick: () => dispatch({ type: 'CRYPTO_RSA_SET_MODE', payload: 'encrypt' }) },
          { key: 'decrypt', label: '解密', active: state.mode === 'decrypt', onClick: () => dispatch({ type: 'CRYPTO_RSA_SET_MODE', payload: 'decrypt' }) },
        ]}
        toolbar={
          <button
            className="crypto-sym-action-btn"
            onClick={handleProcess}
            disabled={processing}
          >
            {processing ? '处理中...' : state.mode === 'encrypt' ? '加密' : '解密'}
          </button>
        }
      />
    </div>
  );
};

export default RsaCodec;
