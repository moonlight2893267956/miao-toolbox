/**
 * 加解密工具 — 主页面
 *
 * "密码工坊" 设计语言：
 * - 药丸式导航标签
 * - 分栏布局（输入 | 输出）
 * - 终端风格输出面板
 * - 自动处理（防抖）
 * - 操作历史持久化
 */

import React, { useReducer, useCallback } from 'react';
import { motion } from 'framer-motion';
import { LockOutlined } from '@ant-design/icons';
import './crypto.css';
import type { CryptoState, CryptoAction, CryptoTabKey, HistoryEntry } from './types';
import { CRYPTO_TABS, INITIAL_CRYPTO_STATE } from './types';
import UrlCodec from './components/UrlCodec';
import EscapeCodec from './components/EscapeCodec';
import Base64Codec from './components/Base64Codec';
import HashTool from './components/HashTool';
import SymmetricCodec from './components/SymmetricCodec';
import UniqueIdGenerator from './components/UniqueIdGenerator';
import RsaCodec from './components/RsaCodec';
import HistoryPanel from './components/HistoryPanel';
import { useHistory } from './hooks/useHistory';

// ============================================================
// Reducer
// ============================================================

function cryptoReducer(state: CryptoState, action: CryptoAction): CryptoState {
  switch (action.type) {
    case 'CRYPTO_SET_TAB':
      return { ...state, activeTab: action.payload };

    case 'CRYPTO_URL_SET_INPUT': return { ...state, url: { ...state.url, input: action.payload } };
    case 'CRYPTO_URL_SET_OUTPUT': return { ...state, url: { ...state.url, output: action.payload } };
    case 'CRYPTO_URL_SET_MODE': return { ...state, url: { ...state.url, mode: action.payload } };
    case 'CRYPTO_URL_SET_ENCODE_TYPE': return { ...state, url: { ...state.url, encodeType: action.payload } };

    case 'CRYPTO_ESCAPE_SET_INPUT': return { ...state, escape: { ...state.escape, input: action.payload } };
    case 'CRYPTO_ESCAPE_SET_OUTPUT': return { ...state, escape: { ...state.escape, output: action.payload } };
    case 'CRYPTO_ESCAPE_SET_MODE': return { ...state, escape: { ...state.escape, mode: action.payload } };

    case 'CRYPTO_BASE64_SET_INPUT': return { ...state, base64: { ...state.base64, input: action.payload } };
    case 'CRYPTO_BASE64_SET_OUTPUT': return { ...state, base64: { ...state.base64, output: action.payload } };
    case 'CRYPTO_BASE64_SET_MODE': return { ...state, base64: { ...state.base64, mode: action.payload } };
    case 'CRYPTO_BASE64_SET_URL_SAFE': return { ...state, base64: { ...state.base64, urlSafe: action.payload } };
    case 'CRYPTO_BASE64_SET_OUTPUT_NOTICE': return { ...state, base64: { ...state.base64, outputNotice: action.payload } };

    case 'CRYPTO_HASH_SET_INPUT': return { ...state, hash: { ...state.hash, input: action.payload } };
    case 'CRYPTO_HASH_SET_RESULTS': return { ...state, hash: { ...state.hash, results: action.payload } };
    case 'CRYPTO_HASH_SET_HMAC_RESULTS': return { ...state, hash: { ...state.hash, hmacResults: action.payload } };
    case 'CRYPTO_HASH_SET_MD5_FORMAT': return { ...state, hash: { ...state.hash, md5Format: action.payload } };
    case 'CRYPTO_HASH_SET_HMAC_KEY': return { ...state, hash: { ...state.hash, hmacKey: action.payload } };

    case 'CRYPTO_SYM_SET_INPUT': return { ...state, symmetric: { ...state.symmetric, input: action.payload } };
    case 'CRYPTO_SYM_SET_OUTPUT': return { ...state, symmetric: { ...state.symmetric, output: action.payload } };
    case 'CRYPTO_SYM_SET_MODE': return { ...state, symmetric: { ...state.symmetric, mode: action.payload } };
    case 'CRYPTO_SYM_SET_ALGORITHM': return { ...state, symmetric: { ...state.symmetric, algorithm: action.payload } };
    case 'CRYPTO_SYM_SET_SYMMETRIC_MODE': return { ...state, symmetric: { ...state.symmetric, symmetricMode: action.payload } };
    case 'CRYPTO_SYM_SET_KEY_FORMAT': return { ...state, symmetric: { ...state.symmetric, keyFormat: action.payload } };
    case 'CRYPTO_SYM_SET_KEY': return { ...state, symmetric: { ...state.symmetric, key: action.payload } };
    case 'CRYPTO_SYM_SET_IV': return { ...state, symmetric: { ...state.symmetric, iv: action.payload } };

    case 'CRYPTO_UID_SET_RESULTS': return { ...state, uniqueId: { ...state.uniqueId, results: action.payload } };
    case 'CRYPTO_UID_SET_COUNT': return { ...state, uniqueId: { ...state.uniqueId, count: action.payload } };
    case 'CRYPTO_UID_SET_VERSION': return { ...state, uniqueId: { ...state.uniqueId, uuidVersion: action.payload } };
    case 'CRYPTO_UID_SET_CASE': return { ...state, uniqueId: { ...state.uniqueId, idCase: action.payload } };
    case 'CRYPTO_UID_SET_FORMAT': return { ...state, uniqueId: { ...state.uniqueId, uuidFormat: action.payload } };
    case 'CRYPTO_UID_SET_NANOID_LENGTH': return { ...state, uniqueId: { ...state.uniqueId, nanoidLength: action.payload } };
    case 'CRYPTO_UID_SET_NANOID_ALPHABET': return { ...state, uniqueId: { ...state.uniqueId, nanoidAlphabet: action.payload } };

    case 'CRYPTO_RSA_SET_INPUT': return { ...state, rsa: { ...state.rsa, input: action.payload } };
    case 'CRYPTO_RSA_SET_OUTPUT': return { ...state, rsa: { ...state.rsa, output: action.payload } };
    case 'CRYPTO_RSA_SET_MODE': return { ...state, rsa: { ...state.rsa, mode: action.payload } };
    case 'CRYPTO_RSA_SET_PUBLIC_KEY': return { ...state, rsa: { ...state.rsa, publicKey: action.payload } };
    case 'CRYPTO_RSA_SET_PRIVATE_KEY': return { ...state, rsa: { ...state.rsa, privateKey: action.payload } };
    case 'CRYPTO_RSA_SET_KEY_SIZE': return { ...state, rsa: { ...state.rsa, keySize: action.payload } };
    case 'CRYPTO_RSA_SET_GENERATING': return { ...state, rsa: { ...state.rsa, generating: action.payload } };
    case 'CRYPTO_RSA_SET_PADDING': return { ...state, rsa: { ...state.rsa, padding: action.payload } };

    case 'CRYPTO_HISTORY_ADD':
    case 'CRYPTO_HISTORY_CLEAR':
      return state;

    default:
      return state;
  }
}

// ============================================================
// Tab Panel Renderer
// ============================================================

function renderTabPanel(
  tabKey: CryptoTabKey,
  state: CryptoState,
  dispatch: React.Dispatch<CryptoAction>,
  historyList: HistoryEntry[],
  onHistoryAdd: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void,
  onClearHistory: () => void,
  onSelectHistory: (entry: HistoryEntry) => void,
) {
  switch (tabKey) {
    case 'url':
      return <UrlCodec state={state.url} dispatch={dispatch} onHistoryAdd={onHistoryAdd} />;
    case 'escape':
      return <EscapeCodec state={state.escape} dispatch={dispatch} onHistoryAdd={onHistoryAdd} />;
    case 'base64':
      return <Base64Codec state={state.base64} dispatch={dispatch} onHistoryAdd={onHistoryAdd} />;
    case 'hash':
      return <HashTool state={state.hash} dispatch={dispatch} onHistoryAdd={onHistoryAdd} />;
    case 'symmetric':
      return <SymmetricCodec state={state.symmetric} dispatch={dispatch} onHistoryAdd={onHistoryAdd} />;
    case 'unique-id':
      return <UniqueIdGenerator state={state.uniqueId} dispatch={dispatch} onHistoryAdd={onHistoryAdd} />;
    case 'rsa':
      return <RsaCodec state={state.rsa} dispatch={dispatch} onHistoryAdd={onHistoryAdd} />;
    case 'history':
      return <HistoryPanel history={historyList} onClear={onClearHistory} onSelect={onSelectHistory} />;
    default:
      return null;
  }
}

// ============================================================
// Page Component
// ============================================================

const CryptoPage: React.FC = () => {
  const [state, dispatch] = useReducer(cryptoReducer, INITIAL_CRYPTO_STATE);
  const { list: historyList, clear: clearHistory, add: addHistory } = useHistory();
  const [localHistory, setLocalHistory] = React.useState<HistoryEntry[]>(historyList);

  const handleHistoryAdd = useCallback(
    (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
      const full = addHistory(entry);
      setLocalHistory((prev) => [full, ...prev].slice(0, 20));
    },
    [addHistory],
  );

  const handleClearHistory = useCallback(() => {
    clearHistory();
    setLocalHistory([]);
  }, [clearHistory]);

  const handleHistorySelect = useCallback((entry: HistoryEntry) => {
    dispatch({ type: 'CRYPTO_SET_TAB', payload: entry.tabKey as CryptoTabKey });
    const inputActionMap: Record<string, CryptoAction['type']> = {
      url: 'CRYPTO_URL_SET_INPUT',
      escape: 'CRYPTO_ESCAPE_SET_INPUT',
      base64: 'CRYPTO_BASE64_SET_INPUT',
      hash: 'CRYPTO_HASH_SET_INPUT',
      symmetric: 'CRYPTO_SYM_SET_INPUT',
      rsa: 'CRYPTO_RSA_SET_INPUT',
    };
    const actionType = inputActionMap[entry.tabKey];
    if (actionType) {
      dispatch({ type: actionType, payload: entry.input } as CryptoAction);
    }
  }, [dispatch]);

  const handleTabChange = useCallback(
    (key: CryptoTabKey) => {
      dispatch({ type: 'CRYPTO_SET_TAB', payload: key });
    },
    [],
  );

  return (
    <motion.div
      className="crypto-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      {/* Header */}
      <div className="crypto-header">
        <motion.div
          className="crypto-header-inner"
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.05 }}
        >
          <div className="crypto-header-icon">
            <LockOutlined />
          </div>
          <div className="crypto-header-text">
            <h2>加解密工具</h2>
            <p className="crypto-header-subtitle">
              <span className="crypto-dot" />
              本地运算 · 密钥不离开设备
            </p>
          </div>
        </motion.div>
      </div>

      {/* Navigation */}
      <div className="crypto-nav">
        <motion.div
          className="crypto-nav-track"
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          {CRYPTO_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`crypto-nav-item ${state.activeTab === tab.key ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.key)}
            >
              <span className="crypto-nav-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </motion.div>
      </div>

      {/* Content */}
      <div className="crypto-content">
        <motion.div
          className="crypto-tab-panel"
          key={state.activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {renderTabPanel(state.activeTab, state, dispatch, localHistory, handleHistoryAdd, handleClearHistory, handleHistorySelect)}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default CryptoPage;
