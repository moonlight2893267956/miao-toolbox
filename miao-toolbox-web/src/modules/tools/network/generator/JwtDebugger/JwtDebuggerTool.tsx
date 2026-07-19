/**
 * JWT 构建器 / 调试器
 * 结果区：分色 Token 段 + 状态 chips + 时间声明 + Header/Payload 双栏
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Button, Input, Tabs, message } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  buildJwt,
  decodeJwt,
  formatJwtText,
  type DecodeJwtResult,
} from '../../utils/jwtDebugger';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import '../generator-tools.css';
import './jwt-debugger.css';

const { TextArea } = Input;
const PAGE_KEY = 'tools-network-jwt-debugger';

const SAMPLE_PAYLOAD = '{\n  "sub": "user-1",\n  "name": "阿渺",\n  "iat": 1516239022\n}';

type OkDecode = Extract<DecodeJwtResult, { ok: true }>;

function copyText(text: string, label?: string) {
  void navigator.clipboard?.writeText(text).then(
    () => message.success(label ? `已复制 ${label}` : '已复制'),
    () => message.error('复制失败'),
  );
}

function formatEpoch(sec: number | null): { unix: string; iso: string; local: string } | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  const d = new Date(sec * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return {
    unix: String(sec),
    iso: d.toISOString(),
    local: d.toLocaleString(),
  };
}

function relativeFromNow(sec: number | null, nowSec = Math.floor(Date.now() / 1000)): string | null {
  if (sec == null) return null;
  const diff = sec - nowSec;
  const abs = Math.abs(diff);
  const unit =
    abs < 60
      ? `${abs} 秒`
      : abs < 3600
        ? `${Math.round(abs / 60)} 分钟`
        : abs < 86400
          ? `${Math.round(abs / 3600)} 小时`
          : `${Math.round(abs / 86400)} 天`;
  if (diff > 0) return `${unit}后`;
  if (diff < 0) return `${unit}前`;
  return '现在';
}

/** 轻量 JSON 着色（安全：先 stringify 再转义） */
function colorizeJson(obj: unknown): React.ReactNode {
  const raw = JSON.stringify(obj, null, 2);
  // 简单 tokenize：key / string / number / bool / null
  const parts: React.ReactNode[] = [];
  const re =
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],]|\s+)/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(raw)) !== null) {
    const tok = m[0];
    let cls = '';
    if (/^"/.test(tok)) {
      cls = /:$/.test(tok) ? 'ntl-jwt-json-key' : 'ntl-jwt-json-str';
    } else if (tok === 'true' || tok === 'false') cls = 'ntl-jwt-json-bool';
    else if (tok === 'null') cls = 'ntl-jwt-json-null';
    else if (/^-?\d/.test(tok)) cls = 'ntl-jwt-json-num';
    parts.push(
      cls ? (
        <span key={i++} className={cls}>
          {tok}
        </span>
      ) : (
        <span key={i++}>{tok}</span>
      ),
    );
  }
  return parts.length ? parts : raw;
}

function MiniCopy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`ntl-jwt-copy-btn${done ? ' ntl-jwt-copy-btn--done' : ''}`}
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

function TokenSegments({ token }: { token: string }) {
  const [h, p, s] = token.split('.');
  if (!h || !p || s === undefined) {
    return <div className="ntl-jwt-token-body">{token}</div>;
  }
  return (
    <>
      <div className="ntl-jwt-token-body" data-testid="jwt-built-token">
        <span
          className="ntl-jwt-seg ntl-jwt-seg--header"
          title="Header — 点击复制"
          onClick={() => copyText(h, 'Header 段')}
        >
          {h}
        </span>
        <span className="ntl-jwt-dot">.</span>
        <span
          className="ntl-jwt-seg ntl-jwt-seg--payload"
          title="Payload — 点击复制"
          onClick={() => copyText(p, 'Payload 段')}
        >
          {p}
        </span>
        <span className="ntl-jwt-dot">.</span>
        <span
          className="ntl-jwt-seg ntl-jwt-seg--sig"
          title="Signature — 点击复制"
          onClick={() => copyText(s, 'Signature 段')}
        >
          {s}
        </span>
      </div>
      <div className="ntl-jwt-legend">
        <span className="ntl-jwt-legend-h">Header</span>
        <span className="ntl-jwt-legend-p">Payload</span>
        <span className="ntl-jwt-legend-s">Signature</span>
      </div>
    </>
  );
}

function JwtResultView({ decoded, token }: { decoded: OkDecode; token: string }) {
  const exp = formatEpoch(decoded.expiresAt);
  const iat = formatEpoch(decoded.issuedAt);
  const nbf = formatEpoch(decoded.notBefore);
  const expRel = relativeFromNow(decoded.expiresAt);
  const iatRel = relativeFromNow(decoded.issuedAt);

  const statusLabel = decoded.expired
    ? '已过期'
    : decoded.expiresAt != null
      ? '未过期'
      : '无 exp';
  const statusClass = decoded.expired
    ? 'ntl-jwt-chip--err'
    : decoded.expiresAt != null
      ? 'ntl-jwt-chip--ok'
      : 'ntl-jwt-chip--muted';

  const sigLabel =
    decoded.signatureValid === true
      ? '签名有效'
      : decoded.signatureValid === false
        ? '签名无效'
        : '签名未验证';
  const sigClass =
    decoded.signatureValid === true
      ? 'ntl-jwt-chip--ok'
      : decoded.signatureValid === false
        ? 'ntl-jwt-chip--err'
        : 'ntl-jwt-chip--muted';

  return (
    <div className="ntl-jwt" data-testid="jwt-result">
      {/* 状态 */}
      <div className="ntl-jwt-status" data-testid="jwt-status">
        <span className="ntl-jwt-chip ntl-jwt-chip--info">
          <span className="ntl-jwt-chip-k">alg</span>
          {decoded.parts.algorithm}
        </span>
        <span className={`ntl-jwt-chip ${statusClass}`} data-testid={decoded.expired ? 'jwt-expired' : 'jwt-valid'}>
          {statusLabel}
          {expRel && decoded.expiresAt != null ? ` · ${expRel}` : ''}
        </span>
        <span className={`ntl-jwt-chip ${sigClass}`}>{sigLabel}</span>
        {decoded.parts.header.typ != null && (
          <span className="ntl-jwt-chip ntl-jwt-chip--muted">
            <span className="ntl-jwt-chip-k">typ</span>
            {String(decoded.parts.header.typ)}
          </span>
        )}
      </div>

      {/* 分色 Token */}
      <div className="ntl-jwt-token-card">
        <div className="ntl-jwt-token-head">
          <span className="ntl-jwt-token-title">TOKEN</span>
          <MiniCopy text={token} label="完整 Token" />
        </div>
        <TokenSegments token={token} />
      </div>

      {/* 时间声明 */}
      {(exp || iat || nbf) && (
        <div className="ntl-jwt-claims" data-testid="jwt-claims">
          {exp && (
            <div className={`ntl-jwt-claim${decoded.expired ? ' ntl-jwt-claim--danger' : ''}`}>
              <div className="ntl-jwt-claim-label">exp 过期时间</div>
              <div className="ntl-jwt-claim-value">{exp.unix}</div>
              <div className="ntl-jwt-claim-sub">
                {exp.local}
                <br />
                {exp.iso}
                {expRel ? ` · ${expRel}` : ''}
              </div>
            </div>
          )}
          {iat && (
            <div className="ntl-jwt-claim">
              <div className="ntl-jwt-claim-label">iat 签发时间</div>
              <div className="ntl-jwt-claim-value">{iat.unix}</div>
              <div className="ntl-jwt-claim-sub">
                {iat.local}
                <br />
                {iat.iso}
                {iatRel ? ` · ${iatRel}` : ''}
              </div>
            </div>
          )}
          {nbf && (
            <div className="ntl-jwt-claim">
              <div className="ntl-jwt-claim-label">nbf 生效时间</div>
              <div className="ntl-jwt-claim-value">{nbf.unix}</div>
              <div className="ntl-jwt-claim-sub">
                {nbf.local}
                <br />
                {nbf.iso}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Header / Payload */}
      <div className="ntl-jwt-panels">
        <div className="ntl-jwt-panel">
          <div className="ntl-jwt-panel-head ntl-jwt-panel-head--header">
            <span className="ntl-jwt-panel-title">HEADER</span>
            <MiniCopy text={JSON.stringify(decoded.parts.header, null, 2)} label="Header" />
          </div>
          <pre className="ntl-jwt-panel-body" data-testid="jwt-header-json">
            {colorizeJson(decoded.parts.header)}
          </pre>
        </div>
        <div className="ntl-jwt-panel">
          <div className="ntl-jwt-panel-head ntl-jwt-panel-head--payload">
            <span className="ntl-jwt-panel-title">PAYLOAD</span>
            <MiniCopy text={JSON.stringify(decoded.parts.payload, null, 2)} label="Payload" />
          </div>
          <pre
            className={`ntl-jwt-panel-body${decoded.expired ? ' ntl-jwt-panel-body--expired' : ''}`}
            data-testid="jwt-decoded"
          >
            {colorizeJson(decoded.parts.payload)}
          </pre>
        </div>
      </div>
    </div>
  );
}

const JwtDebuggerTool: React.FC = () => {
  const { state, setField } = useTabPageStore(PAGE_KEY, {
    mode: 'decode' as 'decode' | 'build',
    token: '',
    secret: '',
    payloadJson: SAMPLE_PAYLOAD,
  });
  const { mode, token, secret, payloadJson } = state;
  const [decoded, setDecoded] = useState<OkDecode | null>(null);
  const [builtToken, setBuiltToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const displayToken = useMemo(() => {
    if (decoded) {
      // 优先用输入框 token；构建后也会写回 token
      return (token && token.trim()) || builtToken;
    }
    return builtToken || token;
  }, [decoded, token, builtToken]);

  const resultText = useMemo(() => {
    if (decoded) return formatJwtText(decoded);
    if (builtToken) return builtToken;
    return '';
  }, [builtToken, decoded]);

  const runDecode = useCallback(() => {
    const r = decodeJwt(token, secret || undefined);
    if (!r.ok) {
      setError(r.error);
      setDecoded(null);
      return;
    }
    setError(null);
    setDecoded(r);
  }, [token, secret]);

  const runBuild = useCallback(() => {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadJson) as Record<string, unknown>;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Payload 须为 JSON 对象');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Payload JSON 无效';
      setError(msg);
      message.error(msg);
      return;
    }
    const r = buildJwt({ payload, secret, algorithm: 'HS256' });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setBuiltToken(r.token);
    setField('token', r.token);
    const dec = decodeJwt(r.token, secret);
    if (dec.ok) setDecoded(dec);
    message.success('已生成 HS256 JWT');
  }, [payloadJson, secret, setField]);

  const onSubmit = mode === 'decode' ? runDecode : runBuild;

  return (
    <NetworkToolLayout
      title="JWT 构建器/调试器"
      icon={resolveNetworkIcon('SafetyOutlined')}
      description="解码 JWT、检查过期；使用 Secret 生成 / 校验 HS256 签名（纯本地）"
      submitText={mode === 'decode' ? '解码' : '生成 JWT'}
      onSubmit={onSubmit}
      resultText={resultText}
      error={error}
      result={
        decoded && displayToken ? (
          <JwtResultView decoded={decoded} token={displayToken} />
        ) : (
          <p className="ntl-jwt-empty" data-testid="jwt-result">
            解码或生成后，将以分色 Token、状态与 Header/Payload 分区展示
          </p>
        )
      }
    >
      <div className="ntl-form" data-testid="jwt-form">
        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">模式</span>
            <span className="ntl-form-section-desc">解码查看 · 或本地构建 HS256</span>
          </div>
          <div className="ntl-form-section-body ntl-form-section-body--tight">
            <Tabs
              activeKey={mode}
              onChange={(k) => setField('mode', k as 'decode' | 'build')}
              items={[
                { key: 'decode', label: '解码 / 验签' },
                { key: 'build', label: '构建 HS256' },
              ]}
            />
            {mode === 'decode' ? (
              <div className="ntl-form-field">
                <label>JWT Token</label>
                <TextArea
                  rows={4}
                  value={token}
                  onChange={(e) => setField('token', e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  data-testid="jwt-token-input"
                />
              </div>
            ) : (
              <div className="ntl-form-field">
                <label>Payload (JSON)</label>
                <TextArea
                  rows={6}
                  value={payloadJson}
                  onChange={(e) => setField('payloadJson', e.target.value)}
                  data-testid="jwt-payload-input"
                />
              </div>
            )}
            <div className="ntl-form-field">
              <label>Secret（仅本地，不会上传）</label>
              <Input.Password
                value={secret}
                onChange={(e) => setField('secret', e.target.value)}
                placeholder="HS* 密钥（解码时可填以验签）"
                data-testid="jwt-secret"
                autoComplete="off"
              />
            </div>
            {mode === 'build' && (
              <Button type="link" size="small" onClick={() => setField('mode', 'decode')} style={{ padding: 0 }}>
                生成后可切到「解码」核对
              </Button>
            )}
          </div>
        </section>
      </div>
    </NetworkToolLayout>
  );
};

export default JwtDebuggerTool;
