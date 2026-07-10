/**
 * 唯一标识符生成面板
 *
 * 支持 UUID v4/v7、nanoid，批量生成，格式切换，字母表切换。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CopyOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { message } from 'antd';
import type { UniqueIdState, CryptoAction, UuidVersion, UuidFormat, NanoidAlphabet, HistoryEntry } from '../types';
import { generateIds } from '../utils/uniqueId';

export interface UniqueIdGeneratorProps {
  state: UniqueIdState;
  dispatch: React.Dispatch<CryptoAction>;
  onHistoryAdd?: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

const VERSION_OPTIONS: { value: UuidVersion; label: string }[] = [
  { value: 'v4', label: 'UUID v4' },
  { value: 'v7', label: 'UUID v7' },
  { value: 'nanoid', label: 'nanoid' },
];

const FORMAT_OPTIONS: { value: UuidFormat; label: string }[] = [
  { value: 'with-hyphen', label: '带连字符' },
  { value: 'no-hyphen', label: '不带连字符' },
];

const ALPHABET_OPTIONS: { value: NanoidAlphabet; label: string }[] = [
  { value: 'default', label: '默认' },
  { value: 'numbers', label: '纯数字' },
  { value: 'lowercase', label: '小写字母' },
  { value: 'uppercase', label: '大写字母' },
];

const MAX_COUNT = 500;

/** 独立的复制按钮组件（避免 lint 报 "component created during render"） */
const CopyButton: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className="crypto-copy-btn" onClick={handleCopy} style={{ color: copied ? 'var(--miao-success)' : undefined }}>
      {copied ? <CheckOutlined /> : <CopyOutlined />}
    </button>
  );
};

const UniqueIdGenerator: React.FC<UniqueIdGeneratorProps> = ({ state, dispatch, onHistoryAdd }) => {
  const handleGenerate = useCallback(() => {
    let count = state.count;
    if (count > MAX_COUNT) {
      count = MAX_COUNT;
      dispatch({ type: 'CRYPTO_UID_SET_COUNT', payload: MAX_COUNT });
      message.warning(`最大支持 ${MAX_COUNT} 条，已自动调整`);
    }
    const results = generateIds(
      state.uuidVersion, count, state.nanoidLength,
      state.uuidFormat, state.nanoidAlphabet,
    );
    const final = state.idCase === 'upper'
      ? results.map((r) => ({ ...r, id: r.id.toUpperCase() }))
      : results;
    if (state.idCase === 'upper') {
      dispatch({ type: 'CRYPTO_UID_SET_RESULTS', payload: final });
    } else {
      dispatch({ type: 'CRYPTO_UID_SET_RESULTS', payload: final });
    }
    onHistoryAdd?.({
      tabKey: 'unique-id',
      action: state.uuidVersion === 'nanoid' ? `nanoID (${state.nanoidLength}位)` : `UUID ${state.uuidVersion}`,
      input: `批量 ${count} 条`,
      output: final.map((r) => r.id).join('\n').slice(0, 500),
    });
  }, [state, dispatch, onHistoryAdd]);

  // 首次加载默认生成
  useEffect(() => {
    if (state.results.length === 0) {
      handleGenerate();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCountChange = (value: number) => {
    const clamped = Math.max(1, Math.min(MAX_COUNT, value));
    dispatch({ type: 'CRYPTO_UID_SET_COUNT', payload: clamped });
  };

  const allIds = state.results.map((r) => r.id).join('\n');

  return (
    <div className="crypto-id-generator">
      <div className="crypto-id-config">
        {VERSION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`crypto-mode-inline-btn ${state.uuidVersion === opt.value ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'CRYPTO_UID_SET_VERSION', payload: opt.value })}
            style={{ padding: '8px 16px' }}
          >
            {opt.label}
          </button>
        ))}

        {state.uuidVersion !== 'nanoid' && (
          <>
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`crypto-mode-inline-btn ${state.uuidFormat === opt.value ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'CRYPTO_UID_SET_FORMAT', payload: opt.value })}
                style={{ padding: '8px 16px' }}
              >
                {opt.label}
              </button>
            ))}
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, color: 'var(--crypto-text-secondary)', fontWeight: 600 }}>数量</label>
          <input
            type="number"
            min={1}
            max={MAX_COUNT}
            value={state.count}
            onChange={(e) => handleCountChange(Number(e.target.value))}
            className="crypto-sym-key-input"
            style={{ width: 72, textAlign: 'center' }}
          />
        </div>

        {state.uuidVersion === 'nanoid' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, color: 'var(--crypto-text-secondary)', fontWeight: 600 }}>长度</label>
              <input
                type="number"
                min={5}
                max={256}
                value={state.nanoidLength}
                onChange={(e) => dispatch({ type: 'CRYPTO_UID_SET_NANOID_LENGTH', payload: Math.max(5, Math.min(256, Number(e.target.value))) })}
                className="crypto-sym-key-input"
                style={{ width: 72, textAlign: 'center' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, color: 'var(--crypto-text-secondary)', fontWeight: 600 }}>字符集</label>
              <div className="crypto-mode-inline">
                {ALPHABET_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`crypto-mode-inline-btn ${state.nanoidAlphabet === opt.value ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'CRYPTO_UID_SET_NANOID_ALPHABET', payload: opt.value })}
                    style={{ padding: '8px 12px' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <button
          className="crypto-mode-inline-btn active"
          onClick={() => dispatch({ type: 'CRYPTO_UID_SET_CASE', payload: state.idCase === 'lower' ? 'upper' : 'lower' })}
          style={{ padding: '8px 16px' }}
        >
          {state.idCase === 'lower' ? '小写' : '大写'}
        </button>

        <button className="crypto-sym-action-btn" onClick={handleGenerate} style={{ marginLeft: 'auto' }}>
          <ReloadOutlined style={{ marginRight: 4 }} />
          生成
        </button>
      </div>

      <div className="crypto-id-results">
        {state.results.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--crypto-text-tertiary)', fontSize: 13 }}>
            点击「生成」按钮生成唯一标识符
          </div>
        ) : (
          <>
            {state.results.map((item, i) => (
              <motion.div
                key={`${item.id}-${i}`}
                className="crypto-id-row"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
              >
                <span className="crypto-id-type">{item.type}</span>
                <span className="crypto-id-text">{item.id}</span>
                <CopyButton value={item.id} />
              </motion.div>
            ))}
            {state.results.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <CopyButton value={allIds} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UniqueIdGenerator;
