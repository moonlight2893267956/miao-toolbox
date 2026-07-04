/**
 * 哈希计算面板
 *
 * - 左上输入文本 → 自动计算 MD5/SHA 系列哈希，网格卡片展示
 * - MD5 支持 32/16 位 + 大小写四种格式
 * - 支持 HMAC 计算（HMAC-MD5/SHA256/SHA512），需填写密钥
 */

import React, { useEffect, useRef } from 'react';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import type { HashState, CryptoAction, HashAlgo, HmacAlgo, Md5Format, HistoryEntry } from '../types';
import { HASH_ALGOS, HMAC_ALGOS } from '../types';
import { computeAllHashes, computeAllHmacs, formatMd5 } from '../utils/hash';
import CodecPanel from './CodecPanel';

export interface HashToolProps {
  state: HashState;
  dispatch: React.Dispatch<CryptoAction>;
  onHistoryAdd?: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

const MD5_FORMATS: { key: Md5Format; label: string }[] = [
  { key: '32-lower', label: '32位小写' },
  { key: '32-upper', label: '32位大写' },
  { key: '16-lower', label: '16位小写' },
  { key: '16-upper', label: '16位大写' },
];

const HashTool: React.FC<HashToolProps> = ({ state, dispatch, onHistoryAdd }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHistoryAddRef = useRef(onHistoryAdd);
  useEffect(() => { onHistoryAddRef.current = onHistoryAdd; }, [onHistoryAdd]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    const trimmed = state.input.trim();
    if (!trimmed) {
      dispatch({ type: 'CRYPTO_HASH_SET_RESULTS', payload: {} as Record<HashAlgo, string> });
      dispatch({ type: 'CRYPTO_HASH_SET_HMAC_RESULTS', payload: {} as Record<HmacAlgo, string> });
      return;
    }
    timerRef.current = setTimeout(() => {
      try {
        const hashes = computeAllHashes(trimmed);
        const hmacs = computeAllHmacs(trimmed, state.hmacKey);
        dispatch({ type: 'CRYPTO_HASH_SET_RESULTS', payload: hashes });
        dispatch({ type: 'CRYPTO_HASH_SET_HMAC_RESULTS', payload: hmacs });
        historyTimerRef.current = setTimeout(() => {
          onHistoryAddRef.current?.({
            tabKey: 'hash', action: '哈希计算',
            input: trimmed.slice(0, 500), output: formatMd5(hashes.MD5, state.md5Format).slice(0, 500),
          });
        }, 1200);
      } catch {
        dispatch({ type: 'CRYPTO_HASH_SET_RESULTS', payload: {} as Record<HashAlgo, string> });
        dispatch({ type: 'CRYPTO_HASH_SET_HMAC_RESULTS', payload: {} as Record<HmacAlgo, string> });
      }
    }, 200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    };
  }, [state.input, state.hmacKey, state.md5Format, dispatch]);

  const CopyButton: React.FC<{ value: string }> = ({ value }) => {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = () => {
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };
    return (
      <button className="crypto-copy-btn" onClick={handleCopy} style={{ color: copied ? '#4ade80' : undefined }}>
        {copied ? <CheckOutlined /> : <CopyOutlined />}
      </button>
    );
  };

  const HashCard: React.FC<{ algo: string; value: string }> = ({ algo, value }) => (
    <motion.div
      className="crypto-hash-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="crypto-hash-card-header">
        <span className="crypto-hash-algo">{algo}</span>
        <CopyButton value={value} />
      </div>
      <div className="crypto-hash-value">{value}</div>
    </motion.div>
  );

  const hasResults = Object.keys(state.results).length > 0;
  const hasHmac = Object.keys(state.hmacResults).length > 0;

  const customOutput = (
    <div style={{ flex: 1, padding: '24px 26px', overflowY: 'auto' }}>
      {!hasResults && !hasHmac ? (
        <div style={{
          color: 'rgba(226,232,240,0.25)', fontStyle: 'italic',
          padding: '36px 0', textAlign: 'center',
        }}>
          输入文本后将自动计算哈希值
        </div>
      ) : (
        <div className="crypto-hash-grid">
          {HASH_ALGOS.filter(a => state.results[a]).map(algo => (
            <HashCard
              key={algo}
              algo={algo}
              value={algo === 'MD5' ? formatMd5(state.results[algo], state.md5Format) : state.results[algo]}
            />
          ))}
          {HMAC_ALGOS.filter(a => state.hmacResults[a]).map(algo => (
            <HashCard key={algo} algo={algo} value={state.hmacResults[algo]} />
          ))}
        </div>
      )}
    </div>
  );

  const controls = (
    <div className="crypto-hash-top-controls">
      <div className="crypto-hash-controls-row">
        <label className="crypto-hash-toolbar-label">MD5 格式</label>
        <div className="crypto-mode-inline">
          {MD5_FORMATS.map((fmt) => (
            <button
              key={fmt.key}
              className={`crypto-mode-inline-btn ${state.md5Format === fmt.key ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'CRYPTO_HASH_SET_MD5_FORMAT', payload: fmt.key })}
            >
              {fmt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="crypto-hash-controls-row">
        <label className="crypto-hash-toolbar-label">HMAC 密钥</label>
        <input
          type="text"
          className="crypto-key-input-field"
          placeholder="选填，填写后自动计算 HMAC"
          value={state.hmacKey}
          onChange={(e) => dispatch({ type: 'CRYPTO_HASH_SET_HMAC_KEY', payload: e.target.value })}
        />
      </div>
    </div>
  );

  return (
    <div className="crypto-hash-layout">
      {controls}
      <CodecPanel
        input={state.input}
        onInputChange={(v) => dispatch({ type: 'CRYPTO_HASH_SET_INPUT', payload: v })}
        output=""
        inputPlaceholder="输入要计算哈希的文本..."
        inputLabel="输入"
        outputLabel="哈希值"
        customOutput={customOutput}
      />
    </div>
  );
};

export default HashTool;
