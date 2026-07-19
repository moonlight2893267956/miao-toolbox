/**
 * HTTP API 签名计算器 — 参数排序 → 待签串 → sign（纯本地）
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Button, Checkbox, Input, Segmented, Select, message } from 'antd';
import {
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  SIGN_PRESETS,
  computeApiSign,
  defaultDemoParams,
  formatSignResultText,
  getPreset,
  importParamsFromText,
  verifyApiSign,
  type SignEncoding,
  type SignParam,
  type SignPresetId,
  type SignComputeResult,
} from '../../utils/httpApiSign';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import '../generator-tools.css';
import './http-api-sign.css';

const { TextArea } = Input;
const PAGE_KEY = 'tools-network-http-api-sign';

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
      className={`ntl-as-copy-btn${done ? ' ntl-as-copy-btn--done' : ''}`}
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

function ResultView({
  result,
  match,
  expected,
}: {
  result: SignComputeResult;
  match: boolean | null;
  expected: string;
}) {
  const verifyChip =
    match === true
      ? { label: '验签匹配', cls: 'ntl-as-chip--ok', testId: 'api-sign-match' }
      : match === false
        ? { label: '验签不匹配', cls: 'ntl-as-chip--err', testId: 'api-sign-mismatch' }
        : { label: '未验签', cls: 'ntl-as-chip--muted', testId: 'api-sign-unverified' };

  const cardMod =
    match === true ? ' ntl-as-card--match' : match === false ? ' ntl-as-card--mismatch' : '';

  return (
    <div className="ntl-as" data-testid="api-sign-result">
      <div className="ntl-as-status">
        <span className="ntl-as-chip ntl-as-chip--info">
          <span className="ntl-as-chip-k">algo</span>
          {result.algo}
        </span>
        <span className="ntl-as-chip ntl-as-chip--info">
          <span className="ntl-as-chip-k">enc</span>
          {result.encoding}
        </span>
        <span className="ntl-as-chip ntl-as-chip--muted">
          <span className="ntl-as-chip-k">params</span>
          {result.usedParams.length}
        </span>
        <span className={`ntl-as-chip ${verifyChip.cls}`} data-testid={verifyChip.testId}>
          {verifyChip.label}
        </span>
      </div>

      {result.usedParams.length > 0 && (
        <div className="ntl-as-used" data-testid="api-sign-used-params">
          {result.usedParams.map((p) => (
            <span key={p.key} className="ntl-as-used-tag">
              {p.key}={p.value}
            </span>
          ))}
        </div>
      )}

      <div className={`ntl-as-card${cardMod}`}>
        <div className="ntl-as-card-head">
          <span className="ntl-as-card-title">SIGN</span>
          <MiniCopy text={result.sign} label="sign" />
        </div>
        <pre className="ntl-as-card-body ntl-as-card-body--sign" data-testid="api-sign-value">
          {result.sign}
        </pre>
      </div>

      <div className="ntl-as-dual">
        <div className="ntl-as-card">
          <div className="ntl-as-card-head">
            <span className="ntl-as-card-title">参数串（字典序）</span>
            <MiniCopy text={result.sortedParamString} label="参数串" />
          </div>
          <pre
            className="ntl-as-card-body ntl-as-card-body--muted"
            data-testid="api-sign-param-string"
          >
            {result.sortedParamString || '（空）'}
          </pre>
        </div>
        <div className="ntl-as-card">
          <div className="ntl-as-card-head">
            <span className="ntl-as-card-title">待签串</span>
            <MiniCopy text={result.stringToSign} label="待签串" />
          </div>
          <pre
            className="ntl-as-card-body ntl-as-card-body--muted"
            data-testid="api-sign-string-to-sign"
          >
            {result.stringToSign || '（空）'}
          </pre>
        </div>
      </div>

      {expected.trim() ? (
        <p className="ntl-as-hint">
          期望 sign：
          <code style={{ marginLeft: 6 }}>{expected.trim()}</code>
          {match === true ? ' · 匹配 ✓' : match === false ? ' · 不匹配 ✗' : ''}
        </p>
      ) : (
        <p className="ntl-as-hint">
          密钥仅在浏览器本地参与计算，不会上传。可填「期望 sign」做验签。
        </p>
      )}
    </div>
  );
}

const HttpApiSignTool: React.FC = () => {
  const { state, setField, setState } = useTabPageStore(PAGE_KEY, {
    params: defaultDemoParams() as SignParam[],
    secret: 'SECRET',
    presetId: 'open-platform-md5' as SignPresetId,
    encoding: 'hex-lower' as SignEncoding,
    excludeText: 'sign',
    includeEmpty: false,
    expected: '',
    importText: '',
  });

  const {
    params,
    secret,
    presetId,
    encoding,
    excludeText,
    includeEmpty,
    expected,
    importText,
  } = state;

  const [result, setResult] = useState<SignComputeResult | null>(null);
  const [match, setMatch] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resultText = useMemo(
    () => (result ? formatSignResultText(result, match) : ''),
    [result, match],
  );

  const excludeFields = useMemo(
    () =>
      excludeText
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [excludeText],
  );

  const run = useCallback(() => {
    if (!secret.trim() && getPreset(presetId).keyMode !== 'hmac-only') {
      // HMAC 也需要密钥
    }
    if (!secret.trim()) {
      setError('请输入密钥');
      setResult(null);
      setMatch(null);
      return;
    }
    setError(null);
    const r = computeApiSign(params, {
      presetId,
      secret,
      encoding,
      excludeFields,
      includeEmpty,
    });
    setResult(r);
    if (expected.trim()) {
      setMatch(verifyApiSign(r.sign, expected, r.encoding));
    } else {
      setMatch(null);
    }
  }, [params, secret, presetId, encoding, excludeFields, includeEmpty, expected]);

  const setParam = (index: number, field: 'key' | 'value', value: string) => {
    setState((prev) => {
      const next = prev.params.map((p, i) =>
        i === index ? { ...p, [field]: value } : p,
      );
      return { ...prev, params: next };
    });
  };

  const addParam = () => {
    setState((prev) => ({
      ...prev,
      params: [...prev.params, { key: '', value: '' }],
    }));
  };

  const removeParam = (index: number) => {
    setState((prev) => ({
      ...prev,
      params: prev.params.filter((_, i) => i !== index),
    }));
  };

  const doImport = () => {
    const r = importParamsFromText(importText);
    if (!r.ok) {
      setError(r.error);
      message.error(r.error);
      return;
    }
    setState((prev) => ({ ...prev, params: r.params }));
    setError(null);
    message.success(`已导入 ${r.params.length} 个参数（${r.source}）`);
  };

  const onPresetChange = (id: SignPresetId) => {
    const p = getPreset(id);
    setState((prev) => ({
      ...prev,
      presetId: id,
      encoding: p.encoding,
      excludeText: p.excludeFields.join(','),
      includeEmpty: p.includeEmpty,
    }));
  };

  return (
    <NetworkToolLayout
      title="HTTP API 签名计算器"
      icon={resolveNetworkIcon('SafetyCertificateOutlined')}
      description="参数字典序排序 → 待签串 → MD5/SHA256/HMAC 业务 sign（纯本地，与网关 HMAC 鉴权无关）"
      submitText="计算签名"
      onSubmit={run}
      resultText={resultText}
      error={error}
      result={
        result ? (
          <ResultView result={result} match={match} expected={expected} />
        ) : (
          <p className="ntl-as-empty" data-testid="api-sign-result">
            填写参数与密钥后计算，将展示 sign、参数串与待签串
          </p>
        )
      }
    >
      <div className="ntl-form" data-testid="api-sign-form">
        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">签名配置</span>
            <span className="ntl-form-section-desc">密钥仅浏览器本地使用，不会上传</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-grid-2">
              <div className="ntl-form-field">
                <label>预设模板</label>
                <Select
                  value={presetId}
                  options={SIGN_PRESETS.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                  onChange={(v) => onPresetChange(v)}
                  data-testid="api-sign-preset"
                />
              </div>
              <div className="ntl-form-field">
                <label>输出编码</label>
                <Segmented
                  value={encoding}
                  block
                  options={[
                    { value: 'hex-lower', label: 'Hex 小写' },
                    { value: 'hex-upper', label: 'Hex 大写' },
                    { value: 'base64', label: 'Base64' },
                  ]}
                  onChange={(v) => setField('encoding', v as SignEncoding)}
                  data-testid="api-sign-encoding"
                />
              </div>
            </div>
            <div className="ntl-form-field">
              <label>密钥 secret</label>
              <Input.Password
                value={secret}
                onChange={(e) => setField('secret', e.target.value)}
                data-testid="api-sign-secret"
                autoComplete="off"
                placeholder="开放平台 secret / HMAC key"
              />
            </div>
            <p className="ntl-form-hint-box">{getPreset(presetId).description}</p>
          </div>
        </section>

        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">业务参数</span>
            <span className="ntl-form-section-desc">计算时按 key 字典序排序拼接</span>
          </div>
          <div className="ntl-form-section-body ntl-form-section-body--tight">
            <div className="ntl-form-kv" data-testid="api-sign-params">
              <div className="ntl-form-kv-head">
                <span>Key</span>
                <span>Value</span>
                <span />
              </div>
              {params.map((p, i) => (
                <div className="ntl-form-kv-row" key={i}>
                  <Input
                    placeholder="key"
                    value={p.key}
                    onChange={(e) => setParam(i, 'key', e.target.value)}
                    data-testid={`api-sign-key-${i}`}
                    variant="borderless"
                  />
                  <Input
                    placeholder="value"
                    value={p.value}
                    onChange={(e) => setParam(i, 'value', e.target.value)}
                    data-testid={`api-sign-value-${i}`}
                    variant="borderless"
                  />
                  <div className="ntl-form-kv-del">
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => removeParam(i)}
                      aria-label="删除参数"
                    />
                  </div>
                </div>
              ))}
              <div className="ntl-form-kv-foot">
                <span className="ntl-form-kv-count">{params.length} 个参数</span>
                <Button type="dashed" icon={<PlusOutlined />} onClick={addParam} size="small">
                  添加参数
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">规则与验签</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-grid-2">
              <div className="ntl-form-field">
                <label>排除字段（逗号分隔）</label>
                <Input
                  value={excludeText}
                  onChange={(e) => setField('excludeText', e.target.value)}
                  placeholder="sign, signature"
                  data-testid="api-sign-exclude"
                />
              </div>
              <div className="ntl-form-field">
                <label>期望 sign（可选）</label>
                <Input
                  value={expected}
                  onChange={(e) => setField('expected', e.target.value)}
                  placeholder="粘贴期望的 sign 做比对"
                  data-testid="api-sign-expected"
                />
              </div>
            </div>
            <div className="ntl-form-checks">
              <Checkbox
                checked={includeEmpty}
                onChange={(e) => setField('includeEmpty', e.target.checked)}
              >
                空值参与签名
              </Checkbox>
            </div>
          </div>
        </section>

        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">快速导入</span>
            <span className="ntl-form-section-desc">URL · k=v&amp; · JSON 对象</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-import">
              <TextArea
                rows={2}
                value={importText}
                onChange={(e) => setField('importText', e.target.value)}
                placeholder="https://api.example.com/pay?amount=100&appId=demo"
                data-testid="api-sign-import"
              />
              <div className="ntl-form-import-actions">
                <Button
                  type="primary"
                  ghost
                  icon={<UploadOutlined />}
                  onClick={doImport}
                  data-testid="api-sign-import-btn"
                >
                  解析填充
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </NetworkToolLayout>
  );
};

export default HttpApiSignTool;
