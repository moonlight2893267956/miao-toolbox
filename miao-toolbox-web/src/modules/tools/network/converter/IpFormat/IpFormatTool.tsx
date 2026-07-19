/**
 * IP 格式转换器
 * 结果区：状态 chips + 主 IP 卡片 + 格式网格 + CIDR 指标
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Input, message } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import {
  analyzeIp,
  formatIpResultText,
  type IpFormatResult,
} from '../../utils/ipFormat';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './ip-format.css';

const PAGE_KEY = 'tools-network-ip-format';
const DEFAULT_INPUT = '192.168.1.0/24';

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
      className={`ntl-ip-copy-btn${done ? ' ntl-ip-copy-btn--done' : ''}`}
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

function Metric({
  label,
  value,
  binary,
  accent,
}: {
  label: string;
  value: string;
  binary?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ntl-ip-metric${accent ? ' ntl-ip-metric--accent' : ''}`}
      onClick={() => copyText(value, label)}
      title={`点击复制 ${label}`}
    >
      <div className="ntl-ip-metric-label">
        <span>{label}</span>
        <span className="ntl-ip-metric-copy">
          <CopyOutlined />
        </span>
      </div>
      <div className={`ntl-ip-metric-value${binary ? ' ntl-ip-metric-value--binary' : ''}`}>
        {value}
      </div>
    </button>
  );
}

function IpResultView({ result }: { result: IpFormatResult }) {
  const c = result.cidr;
  return (
    <div className="ntl-ip" data-testid="ip-result">
      <div className="ntl-ip-status">
        <span className="ntl-ip-chip ntl-ip-chip--info">
          <span className="ntl-ip-chip-k">ip</span>
          IPv4
        </span>
        {c ? (
          <span className="ntl-ip-chip ntl-ip-chip--info">
            <span className="ntl-ip-chip-k">cidr</span>/{c.prefix}
          </span>
        ) : (
          <span className="ntl-ip-chip ntl-ip-chip--muted">单主机</span>
        )}
        {c && (
          <span className="ntl-ip-chip ntl-ip-chip--ok">
            <span className="ntl-ip-chip-k">hosts</span>
            {c.hostCount.toLocaleString()}
          </span>
        )}
      </div>

      <div className="ntl-ip-hero">
        <div className="ntl-ip-hero-head">
          <span className="ntl-ip-hero-title">ADDRESS</span>
          {result.dotted && <MiniCopy text={result.dotted} label="点分十进制" />}
        </div>
        <div className="ntl-ip-hero-body">
          <div className="ntl-ip-hero-ip" data-testid="ip-dotted">
            {result.dotted}
            {c ? `/${c.prefix}` : ''}
          </div>
          {c && (
            <div className="ntl-ip-hero-range">
              <span>可用主机</span>
              <strong>{c.firstHost}</strong>
              <span className="ntl-ip-arrow">→</span>
              <strong>{c.lastHost}</strong>
              <span style={{ opacity: 0.75 }}>（{c.hostCount} 台）</span>
            </div>
          )}
        </div>
      </div>

      <div className="ntl-ip-grid">
        {result.dotted && <Metric label="点分十进制" value={result.dotted} accent />}
        {result.decimal && <Metric label="十进制" value={result.decimal} />}
        {result.hex && <Metric label="十六进制" value={result.hex} />}
        {result.binary && (
          <Metric label="二进制" value={result.binary} binary accent />
        )}
      </div>

      {c && (
        <div className="ntl-ip-section" data-testid="ip-cidr-section">
          <div className="ntl-ip-section-head">
            <span className="ntl-ip-section-title">CIDR · /{c.prefix}</span>
            <MiniCopy
              text={`${c.network}/${c.prefix}`}
              label="网络 CIDR"
            />
          </div>
          <div className="ntl-ip-section-body">
            <div className="ntl-ip-grid">
              <Metric label="网络地址" value={c.network} accent />
              <Metric label="广播地址" value={c.broadcast} accent />
              <Metric label="子网掩码" value={c.mask} />
              <Metric label="首主机" value={c.firstHost} />
              <Metric label="末主机" value={c.lastHost} />
              <Metric label="主机数量" value={String(c.hostCount)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const IpFormatTool: React.FC = () => {
  const initial = useMemo(() => analyzeIp(DEFAULT_INPUT), []);
  const { state, setField, setState } = useTabPageStore(PAGE_KEY, {
    input: DEFAULT_INPUT,
    error: null as string | null,
  });
  const { input, error } = state;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IpFormatResult | null>(
    initial.error ? null : initial,
  );

  const resultText = useMemo(
    () => (result && !result.error ? formatIpResultText(result) : ''),
    [result],
  );

  const run = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      const r = analyzeIp(input);
      if (r.error) {
        setState((prev) => ({ ...prev, error: r.error ?? '解析失败' }));
        setResult(null);
      } else {
        setState((prev) => ({ ...prev, error: null }));
        setResult(r);
      }
      setLoading(false);
    }, 40);
  }, [input, setState]);

  return (
    <NetworkToolLayout
      title="IP 格式转换器"
      icon={resolveNetworkIcon('GlobalOutlined')}
      description="IPv4 / CIDR · 二进制 · 十进制 · 十六进制 · 地址范围"
      submitText="转换"
      loading={loading}
      onSubmit={run}
      resultText={resultText}
      error={error}
      result={
        result && !result.error ? (
          <IpResultView result={result} />
        ) : (
          <p className="ntl-ip-empty" data-testid="ip-result">
            输入 IPv4 / CIDR / 十进制 / 十六进制后点击转换
          </p>
        )
      }
    >
      <div className="ntl-form" data-testid="network-tool-input-slot">
        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">地址输入</span>
            <span className="ntl-form-section-desc">IPv4 · CIDR · 十进制 · 十六进制</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-single">
              <Input
                size="large"
                value={input}
                onChange={(e) => setField('input', e.target.value)}
                onPressEnter={run}
                placeholder="192.168.1.0/24 或 3232235776 或 0xc0a80100"
                data-testid="ip-input"
                spellCheck={false}
                allowClear
              />
              <p className="ntl-form-single-tip">
                支持点分十进制、CIDR（如 /24）、无符号十进制、0x 十六进制
              </p>
            </div>
          </div>
        </section>
      </div>
    </NetworkToolLayout>
  );
};

export default IpFormatTool;
