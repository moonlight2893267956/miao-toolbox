/**
 * 加解密工具 — 类型定义
 *
 * 定义所有模块 Tab 的联合类型和各模块的状态骨架。
 */

/** 8 个模块的 Tab Key */
export type CryptoTabKey =
  | 'url'
  | 'escape'
  | 'base64'
  | 'hash'
  | 'symmetric'
  | 'unique-id'
  | 'rsa'
  | 'history';

/** Tab 配置项 */
export interface TabConfig {
  key: CryptoTabKey;
  label: string;
  icon: string; // icon name for display
}

/** 8 个模块 Tab 的配置列表 */
export const CRYPTO_TABS: TabConfig[] = [
  { key: 'url', label: 'URL', icon: '🔗' },
  { key: 'escape', label: 'Escape', icon: '↔️' },
  { key: 'base64', label: 'Base64', icon: '📦' },
  { key: 'hash', label: '哈希', icon: '🔐' },
  { key: 'symmetric', label: 'AES/DES', icon: '🔒' },
  { key: 'unique-id', label: 'UUID', icon: '🎯' },
  { key: 'rsa', label: 'RSA', icon: '🛡️' },
  { key: 'history', label: '历史', icon: '📋' },
];

// ============================================================
// URL
// ============================================================

export interface UrlState {
  input: string;
  output: string;
  mode: 'encode' | 'decode';
  encodeType: 'component' | 'full';
}

export const INITIAL_URL_STATE: UrlState = {
  input: '',
  output: '',
  mode: 'encode',
  encodeType: 'full',
};

// ============================================================
// Escape
// ============================================================

export interface EscapeState {
  input: string;
  output: string;
  mode: 'encode' | 'decode';
}

export const INITIAL_ESCAPE_STATE: EscapeState = {
  input: '',
  output: '',
  mode: 'encode',
};

// ============================================================
// Base64
// ============================================================

export interface Base64State {
  input: string;
  output: string;
  outputNotice?: string;
  mode: 'encode' | 'decode';
  urlSafe: boolean;
}

export const INITIAL_BASE64_STATE: Base64State = {
  input: '',
  output: '',
  outputNotice: undefined,
  mode: 'encode',
  urlSafe: false,
};

// ============================================================
// Hash
// ============================================================

export type HashAlgo = 'MD5' | 'SHA1' | 'SHA224' | 'SHA256' | 'SHA512';
export type HmacAlgo = 'HMAC-MD5' | 'HMAC-SHA256' | 'HMAC-SHA512';
export type Md5Format = '32-lower' | '32-upper' | '16-lower' | '16-upper';

export interface HashState {
  input: string;
  results: Record<HashAlgo, string>;
  hmacResults: Record<HmacAlgo, string>;
  md5Format: Md5Format;
  hmacKey: string;
}

export const HASH_ALGOS: HashAlgo[] = ['MD5', 'SHA1', 'SHA224', 'SHA256', 'SHA512'];
export const HMAC_ALGOS: HmacAlgo[] = ['HMAC-MD5', 'HMAC-SHA256', 'HMAC-SHA512'];

export const INITIAL_HASH_STATE: HashState = {
  input: '',
  results: {} as Record<HashAlgo, string>,
  hmacResults: {} as Record<HmacAlgo, string>,
  md5Format: '32-lower',
  hmacKey: '',
};

// ============================================================
// Symmetric (AES/DES)
// ============================================================

export type SymmetricAlgo = 'AES' | 'DES' | 'TripleDES';
export type SymmetricMode = 'CBC' | 'ECB' | 'CFB' | 'OFB' | 'CTR';
export type KeyFormat = 'Utf8' | 'Base64' | 'Hex';

export interface SymmetricState {
  input: string;
  output: string;
  mode: 'encrypt' | 'decrypt';
  algorithm: SymmetricAlgo;
  symmetricMode: SymmetricMode;
  keyFormat: KeyFormat;
  key: string;
  iv: string;
}

export const INITIAL_SYMMETRIC_STATE: SymmetricState = {
  input: '',
  output: '',
  mode: 'encrypt',
  algorithm: 'AES',
  symmetricMode: 'CBC',
  keyFormat: 'Utf8',
  key: '',
  iv: '',
};

// ============================================================
// Unique ID
// ============================================================

export type UuidVersion = 'v4' | 'v7' | 'nanoid';
export type UuidCase = 'lower' | 'upper';
export type UuidFormat = 'with-hyphen' | 'no-hyphen';
export type NanoidAlphabet = 'default' | 'numbers' | 'lowercase' | 'uppercase';

export interface UniqueIdState {
  results: Array<{ id: string; type: string }>;
  count: number;
  uuidVersion: UuidVersion;
  idCase: UuidCase;
  uuidFormat: UuidFormat;
  nanoidLength: number;
  nanoidAlphabet: NanoidAlphabet;
}

export const INITIAL_UNIQUE_ID_STATE: UniqueIdState = {
  results: [],
  count: 5,
  uuidVersion: 'v4',
  idCase: 'lower',
  uuidFormat: 'with-hyphen',
  nanoidLength: 21,
  nanoidAlphabet: 'default',
};

// ============================================================
// RSA
// ============================================================

export interface RsaState {
  input: string;
  output: string;
  mode: 'encrypt' | 'decrypt';
  publicKey: string;
  privateKey: string;
  keySize: 512 | 1024 | 2048 | 4096;
  padding: 'pkcs1' | 'oaep';
  generating: boolean;
}

export const INITIAL_RSA_STATE: RsaState = {
  input: '',
  output: '',
  mode: 'encrypt',
  publicKey: '',
  privateKey: '',
  keySize: 2048,
  padding: 'pkcs1',
  generating: false,
};

// ============================================================
// History
// ============================================================

export interface HistoryEntry {
  id: string;
  tabKey: CryptoTabKey;
  action: string;
  input: string;
  output: string;
  timestamp: number;
}

// ============================================================
// Global State
// ============================================================

export interface CryptoState {
  activeTab: CryptoTabKey;
  url: UrlState;
  escape: EscapeState;
  base64: Base64State;
  hash: HashState;
  symmetric: SymmetricState;
  uniqueId: UniqueIdState;
  rsa: RsaState;
  history: HistoryEntry[];
}

export const INITIAL_CRYPTO_STATE: CryptoState = {
  activeTab: 'url',
  url: INITIAL_URL_STATE,
  escape: INITIAL_ESCAPE_STATE,
  base64: INITIAL_BASE64_STATE,
  hash: INITIAL_HASH_STATE,
  symmetric: INITIAL_SYMMETRIC_STATE,
  uniqueId: INITIAL_UNIQUE_ID_STATE,
  rsa: INITIAL_RSA_STATE,
  history: [],
};

// ============================================================
// Actions
// ============================================================

export type CryptoAction =
  | { type: 'CRYPTO_SET_TAB'; payload: CryptoTabKey }
  | { type: 'CRYPTO_URL_SET_INPUT'; payload: string }
  | { type: 'CRYPTO_URL_SET_OUTPUT'; payload: string }
  | { type: 'CRYPTO_URL_SET_MODE'; payload: 'encode' | 'decode' }
  | { type: 'CRYPTO_URL_SET_ENCODE_TYPE'; payload: 'component' | 'full' }
  | { type: 'CRYPTO_ESCAPE_SET_INPUT'; payload: string }
  | { type: 'CRYPTO_ESCAPE_SET_OUTPUT'; payload: string }
  | { type: 'CRYPTO_ESCAPE_SET_MODE'; payload: 'encode' | 'decode' }
  | { type: 'CRYPTO_BASE64_SET_INPUT'; payload: string }
  | { type: 'CRYPTO_BASE64_SET_OUTPUT'; payload: string }
  | { type: 'CRYPTO_BASE64_SET_MODE'; payload: 'encode' | 'decode' }
  | { type: 'CRYPTO_BASE64_SET_URL_SAFE'; payload: boolean }
  | { type: 'CRYPTO_BASE64_SET_OUTPUT_NOTICE'; payload: string | undefined }
  | { type: 'CRYPTO_HASH_SET_INPUT'; payload: string }
  | { type: 'CRYPTO_HASH_SET_RESULTS'; payload: Record<HashAlgo, string> }
  | { type: 'CRYPTO_HASH_SET_HMAC_RESULTS'; payload: Record<HmacAlgo, string> }
  | { type: 'CRYPTO_HASH_SET_MD5_FORMAT'; payload: Md5Format }
  | { type: 'CRYPTO_HASH_SET_HMAC_KEY'; payload: string }
  | { type: 'CRYPTO_SYM_SET_INPUT'; payload: string }
  | { type: 'CRYPTO_SYM_SET_OUTPUT'; payload: string }
  | { type: 'CRYPTO_SYM_SET_MODE'; payload: 'encrypt' | 'decrypt' }
  | { type: 'CRYPTO_SYM_SET_ALGORITHM'; payload: SymmetricAlgo }
  | { type: 'CRYPTO_SYM_SET_SYMMETRIC_MODE'; payload: SymmetricMode }
  | { type: 'CRYPTO_SYM_SET_KEY_FORMAT'; payload: KeyFormat }
  | { type: 'CRYPTO_SYM_SET_KEY'; payload: string }
  | { type: 'CRYPTO_SYM_SET_IV'; payload: string }
  | { type: 'CRYPTO_UID_SET_RESULTS'; payload: Array<{ id: string; type: string }> }
  | { type: 'CRYPTO_UID_SET_COUNT'; payload: number }
  | { type: 'CRYPTO_UID_SET_VERSION'; payload: UuidVersion }
  | { type: 'CRYPTO_UID_SET_CASE'; payload: UuidCase }
  | { type: 'CRYPTO_UID_SET_FORMAT'; payload: UuidFormat }
  | { type: 'CRYPTO_UID_SET_NANOID_LENGTH'; payload: number }
  | { type: 'CRYPTO_UID_SET_NANOID_ALPHABET'; payload: NanoidAlphabet }
  | { type: 'CRYPTO_RSA_SET_INPUT'; payload: string }
  | { type: 'CRYPTO_RSA_SET_OUTPUT'; payload: string }
  | { type: 'CRYPTO_RSA_SET_MODE'; payload: 'encrypt' | 'decrypt' }
  | { type: 'CRYPTO_RSA_SET_PUBLIC_KEY'; payload: string }
  | { type: 'CRYPTO_RSA_SET_PRIVATE_KEY'; payload: string }
  | { type: 'CRYPTO_RSA_SET_KEY_SIZE'; payload: 512 | 1024 | 2048 | 4096 }
  | { type: 'CRYPTO_RSA_SET_GENERATING'; payload: boolean }
  | { type: 'CRYPTO_RSA_SET_PADDING'; payload: 'pkcs1' | 'oaep' }
  | { type: 'CRYPTO_HISTORY_ADD'; payload: HistoryEntry }
  | { type: 'CRYPTO_HISTORY_CLEAR' };
