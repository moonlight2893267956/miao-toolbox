/**
 * HMAC 签名生成 / 验证
 * 结果区：状态 chips + 主签名卡片 + Hex/Base64 双栏 + 验签对比
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Input, Select, Segmented, message } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  compareSignature,
  computeHmac,
  formatHmacText,
  groupHex,
  type HmacAlgorithm,
  type HmacEncoding,
  type HmacResult,
} from '../../utils/hmacSigner';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import '../generator-tools.css';
import './hmac-signer.css';

const { TextArea } = Input;
const PAGE_KEY = 'tools-network-hmac-signer';

const ALGOS: HmacAlgorithm[] = ['HMAC-SHA256', 'HMAC-SHA384', 'HMAC-SHA512'];

function copyText(text: string, label?: string) {
  void navigator.clipboard?.writeText(text).then(
    () => message.success(label ? `已复制 ${label}` : '已复制'),
    () => message.error('复制失败'),
  );
}

function MiniCopy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`ntl-hmac-copy-btn${done ? ' ntl-hmac-copy-btn--done' : ''}`}
      title={`复制 ${label}`}
      aria-label={`复制 ${label}`}
      onClick={() => {
        copyText(text, label);
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <CheckOutlined /> : <CopyOutlined />}
      {done ? '已复制' : '复制'}
    </button>
  );
}

function HmacResultView({
  result,
  match,
  expected,
}: {
  result: HmacResult;
  match: boolean | null;
  expected: string;
}) {
  const primary = result.encoding === 'base64' ? result.base64 : result.hex;
  const primaryDisplay =
    result.encoding === 'hex' ? groupHex(result.hex) : result.base64;

  const verifyChip =
    match === true
      ? { label: '验签匹配', cls: 'ntl-hmac-chip--ok', testId: 'hmac-match' }
      : match === false
        ? { label: '验签不匹配', cls: 'ntl-hmac-chip--err', testId: 'hmac-mismatch' }
        : { label: '未验签', cls: 'ntl-hmac-chip--muted', testId: 'hmac-unverified' };

  const cardMod =
    match === true
      ? ' ntl-hmac-sig-card--match'
      : match === false
        ? ' ntl-hmac-sig-card--mismatch'
        : '';

  return (
    <div className="ntl-hmac" data-testid="hmac-result">
      <div className="ntl-hmac-status" data-testid="hmac-status">
        <span className="ntl-hmac-chip ntl-hmac-chip--info">
          <span className="ntl-hmac-chip-k">alg</span>
          {result.algorithm.replace('HMAC-', '')}
        </span>
        <span className="ntl-hmac-chip ntl-hmac-chip--info">
          <span className="ntl-hmac-chip-k">bits</span>
          {result.bitLength}
        </span>
        <span className="ntl-hmac-chip ntl-hmac-chip--muted">
          <span className="ntl-hmac-chip-k">msg</span>
          {result.messageLength} 字符
        </span>
        <span className="ntl-hmac-chip ntl-hmac-chip--muted">
          <span className="ntl-hmac-chip-k">out</span>
          {result.encoding.toUpperCase()}
        </span>
        <span className={`ntl-hmac-chip ${verifyChip.cls}`} data-testid={verifyChip.testId}>
          {verifyChip.label}
        </span>
      </div>

      {/* 主签名（当前编码） */}
      <div className={`ntl-hmac-sig-card${cardMod}`}>
        <div className="ntl-hmac-sig-head">
          <span className="ntl-hmac-sig-title">
            SIGNATURE · {result.encoding.toUpperCase()}
          </span>
          <div className="ntl-hmac-sig-actions">
            <MiniCopy text={primary} label={result.encoding.toUpperCase()} />
          </div>
        </div>
        <div
          className={`ntl-hmac-sig-body${result.encoding === 'hex' ? ' ntl-hmac-sig-body--hex' : ''}`}
          data-testid="hmac-signature"
        >
          {primaryDisplay}
        </div>
        <div className="ntl-hmac-sig-meta">
          <span>
            {result.encoding === 'hex'
              ? `${result.hexLength} hex chars · ${result.bitLength / 8} bytes`
              : `Base64 · ${result.bitLength / 8} bytes digest`}
          </span>
          <span>纯本地计算，密钥不会上传</span>
        </div>
      </div>

      {/* Hex / Base64 双栏 */}
      <div className="ntl-hmac-dual">
        <div className="ntl-hmac-panel">
          <div className="ntl-hmac-panel-head ntl-hmac-panel-head--hex">
            <span className="ntl-hmac-panel-title">HEX</span>
            <MiniCopy text={result.hex} label="Hex" />
          </div>
          <pre className="ntl-hmac-panel-body ntl-hmac-panel-body--hex" data-testid="hmac-hex">
            {groupHex(result.hex)}
          </pre>
        </div>
        <div className="ntl-hmac-panel">
          <div className="ntl-hmac-panel-head ntl-hmac-panel-head--b64">
            <span className="ntl-hmac-panel-title">BASE64</span>
            <MiniCopy text={result.base64} label="Base64" />
          </div>
          <pre className="ntl-hmac-panel-body ntl-hmac-panel-body--b64" data-testid="hmac-base64">
            {result.base64}
          </pre>
        </div>
      </div>

      {/* 验签对比 */}
      {expected.trim() ? (
        <div
          className={`ntl-hmac-verify${
            match === true
              ? ' ntl-hmac-verify--match'
              : match === false
                ? ' ntl-hmac-verify--mismatch'
                : ''
          }`}
          data-testid="hmac-verify-panel"
        >
          <div className="ntl-hmac-verify-title">
            验签对比 · {match === true ? '匹配 ✓' : match === false ? '不匹配 ✗' : '—'}
          </div>
          <div className="ntl-hmac-verify-row">
            <span className="ntl-hmac-verify-label">期望</span>
            <span className="ntl-hmac-verify-val">{expected.trim()}</span>
          </div>
          <div className="ntl-hmac-verify-row">
            <span className="ntl-hmac-verify-label">计算</span>
            <span className="ntl-hmac-verify-val">{primary}</span>
          </div>
          {match === false && (
            <p className="ntl-hmac-hint" style={{ marginTop: 6 }}>
              已同时按 Hex / Base64 规范化比较（忽略空白与 hex 大小写）。请确认算法与密钥一致。
            </p>
          )}
        </div>
      ) : (
        <p className="ntl-hmac-hint">
          可选：在下方填入「期望签名」后点击计算，将与结果自动比对（支持 Hex 或 Base64）。
        </p>
      )}
    </div>
  );
}

const HmacSignerTool: React.FC = () => {
  const { state, setField } = useTabPageStore(PAGE_KEY, {
    messageText: 'hello',
    key: 'secret',
    algorithm: 'HMAC-SHA256' as HmacAlgorithm,
    encoding: 'hex' as HmacEncoding,
    expected: '',
  });
  const { messageText, key, algorithm, encoding, expected } = state;
  const [result, setResult] = useState<HmacResult | null>(null);
  const [match, setMatch] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resultText = useMemo(
    () => (result ? formatHmacText(result, match) : ''),
    [result, match],
  );

  const run = useCallback(() => {
    if (!key) {
      setError('请输入密钥');
      setResult(null);
      setMatch(null);
      return;
    }
    setError(null);
    const r = computeHmac(messageText, key, algorithm, encoding);
    setResult(r);
    if (expected.trim()) {
      // auto：同时识别 hex / base64 期望值
      setMatch(compareSignature(r, expected, 'auto'));
    } else {
      setMatch(null);
    }
  }, [messageText, key, algorithm, encoding, expected]);

  return (
    <NetworkToolLayout
      title="HMAC 签名生成/验证"
      icon={resolveNetworkIcon('LockOutlined')}
      description="消息 + 密钥 → HMAC-SHA256/384/512；同时给出 Hex 与 Base64；可选期望签名验签（纯本地）"
      submitText="计算"
      onSubmit={run}
      resultText={resultText}
      error={error}
      result={
        result ? (
          <HmacResultView result={result} match={match} expected={expected} />
        ) : (
          <p className="ntl-hmac-empty" data-testid="hmac-result">
            填写消息与密钥后计算，将展示签名、双编码与可选验签结果
          </p>
        )
      }
    >
      <div className="ntl-form" data-testid="hmac-form">
        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">消息与密钥</span>
            <span className="ntl-form-section-desc">纯本地计算，密钥不上传</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-field">
              <label>消息</label>
              <TextArea
                rows={4}
                value={messageText}
                onChange={(e) => setField('messageText', e.target.value)}
                data-testid="hmac-message"
                placeholder="待签名的原始消息"
              />
            </div>
            <div className="ntl-form-field">
              <label>密钥 secret</label>
              <Input.Password
                value={key}
                onChange={(e) => setField('key', e.target.value)}
                data-testid="hmac-key"
                autoComplete="off"
                placeholder="HMAC 密钥"
              />
            </div>
          </div>
        </section>

        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">算法与验签</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-grid-2">
              <div className="ntl-form-field">
                <label>算法</label>
                <Select
                  value={algorithm}
                  options={ALGOS.map((a) => ({ value: a, label: a }))}
                  onChange={(v) => setField('algorithm', v)}
                  data-testid="hmac-algo"
                />
              </div>
              <div className="ntl-form-field">
                <label>主输出编码</label>
                <Segmented
                  value={encoding}
                  options={[
                    { value: 'hex', label: 'Hex' },
                    { value: 'base64', label: 'Base64' },
                  ]}
                  onChange={(v) => setField('encoding', v as HmacEncoding)}
                  data-testid="hmac-encoding"
                  block
                />
              </div>
            </div>
            <div className="ntl-form-field">
              <label>期望签名（可选）</label>
              <Input
                value={expected}
                onChange={(e) => setField('expected', e.target.value)}
                placeholder="粘贴 Hex 或 Base64 签名进行比对"
                data-testid="hmac-expected"
              />
            </div>
          </div>
        </section>
      </div>
    </NetworkToolLayout>
  );
};

export default HmacSignerTool;
