/**
 * CIDR / 子网计算器
 * 结果区：状态 chips + 主 CIDR 卡片 + 指标网格 + 子网划分表
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Input, InputNumber, message } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  formatCidrText,
  parseCidr,
  splitIPv4Subnets,
  type CidrInfo,
  type IPv4CidrInfo,
  type SubnetSplit,
} from '../../utils/cidrCalculator';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import '../generator-tools.css';
import './cidr-calculator.css';

const PAGE_KEY = 'tools-network-cidr-calculator';

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
      className={`ntl-cidr-copy-btn${done ? ' ntl-cidr-copy-btn--done' : ''}`}
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
  hint,
  accent,
  ok,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  ok?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ntl-cidr-metric${accent ? ' ntl-cidr-metric--accent' : ''}${ok ? ' ntl-cidr-metric--ok' : ''}`}
      onClick={() => copyText(value, label)}
      title={`点击复制 ${label}`}
    >
      <div className="ntl-cidr-metric-label">
        <span>{label}</span>
        <span className="ntl-cidr-metric-copy">
          <CopyOutlined />
        </span>
      </div>
      <div className="ntl-cidr-metric-value">{value}</div>
      {hint ? <div className="ntl-cidr-metric-hint">{hint}</div> : null}
    </button>
  );
}

function CidrResultView({
  info,
  subnets,
  newPrefix,
}: {
  info: CidrInfo;
  subnets: SubnetSplit[];
  newPrefix: number;
}) {
  const v4 = info.version === 4 ? (info as IPv4CidrInfo) : null;

  return (
    <div className="ntl-cidr" data-testid="cidr-result">
      <div className="ntl-cidr-status">
        <span className="ntl-cidr-chip ntl-cidr-chip--info">
          <span className="ntl-cidr-chip-k">ip</span>
          IPv{info.version}
        </span>
        <span className="ntl-cidr-chip ntl-cidr-chip--info">
          <span className="ntl-cidr-chip-k">prefix</span>/{info.prefix}
        </span>
        <span className="ntl-cidr-chip ntl-cidr-chip--muted">
          <span className="ntl-cidr-chip-k">host bits</span>
          {info.hostBits}
        </span>
        {v4 ? (
          <span className="ntl-cidr-chip ntl-cidr-chip--ok">
            <span className="ntl-cidr-chip-k">hosts</span>
            {v4.usableHosts.toLocaleString()}
          </span>
        ) : (
          <span className="ntl-cidr-chip ntl-cidr-chip--ok">
            <span className="ntl-cidr-chip-k">addrs</span>
            {info.totalAddresses}
          </span>
        )}
      </div>

      <div className="ntl-cidr-hero">
        <div className="ntl-cidr-hero-head">
          <span className="ntl-cidr-hero-title">NETWORK</span>
          <MiniCopy text={info.cidr} label="CIDR" />
        </div>
        <div className="ntl-cidr-hero-body">
          <div className="ntl-cidr-hero-cidr">{info.cidr}</div>
          {v4 && v4.firstHost && v4.lastHost ? (
            <div className="ntl-cidr-hero-range">
              <span>可用范围</span>
              <strong>{v4.firstHost}</strong>
              <span className="ntl-cidr-arrow">→</span>
              <strong>{v4.lastHost}</strong>
              <span style={{ opacity: 0.75 }}>
                （共 {v4.usableHosts.toLocaleString()} 台）
              </span>
            </div>
          ) : (
            <div className="ntl-cidr-hero-range">
              <span>网络地址</span>
              <strong>{info.network}</strong>
            </div>
          )}
        </div>
      </div>

      {v4 ? (
        <div className="ntl-cidr-grid">
          <Metric label="网络地址" value={v4.network} accent />
          <Metric label="广播地址" value={v4.broadcast} accent />
          <Metric label="子网掩码" value={v4.netmask} />
          <Metric label="通配掩码" value={v4.wildcard} hint="wildcard mask" />
          <Metric label="前缀" value={`/${v4.prefix}`} />
          <Metric label="主机位" value={String(v4.hostBits)} />
          <Metric label="地址总数" value={String(v4.totalAddresses)} />
          <Metric label="可用主机" value={String(v4.usableHosts)} ok />
          {v4.firstHost && <Metric label="首主机" value={v4.firstHost} />}
          {v4.lastHost && <Metric label="末主机" value={v4.lastHost} />}
        </div>
      ) : (
        <div className="ntl-cidr-grid">
          <Metric label="网络地址" value={info.network} accent />
          <Metric label="前缀" value={`/${info.prefix}`} />
          <Metric label="主机位" value={String(info.hostBits)} />
          <Metric label="地址总数" value={String(info.totalAddresses)} ok />
        </div>
      )}

      {subnets.length > 0 && (
        <div className="ntl-cidr-subnets" data-testid="cidr-subnets">
          <div className="ntl-cidr-subnets-head">
            <span className="ntl-cidr-subnets-title">
              子网划分 · /{info.prefix} → /{newPrefix}
            </span>
            <span className="ntl-cidr-subnets-meta">
              显示 {subnets.length} 条
              {subnets.length >= 256 ? '（已截断）' : ''}
            </span>
          </div>
          <div className="ntl-cidr-table-wrap">
            <table className="ntl-cidr-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>CIDR</th>
                  <th>网络</th>
                  <th>广播</th>
                  <th>首主机</th>
                  <th>末主机</th>
                  <th>可用</th>
                </tr>
              </thead>
              <tbody>
                {subnets.map((s) => (
                  <tr key={s.cidr}>
                    <td className="ntl-cidr-td-idx">{s.index}</td>
                    <td className="ntl-cidr-td-cidr">
                      <button
                        type="button"
                        className="ntl-cidr-copy-btn"
                        style={{ fontWeight: 700, color: '#0958d9', padding: 0 }}
                        onClick={() => copyText(s.cidr, '子网 CIDR')}
                        title="复制 CIDR"
                      >
                        {s.cidr}
                      </button>
                    </td>
                    <td>{s.network}</td>
                    <td>{s.broadcast}</td>
                    <td>{s.firstHost ?? '—'}</td>
                    <td>{s.lastHost ?? '—'}</td>
                    <td>{s.usableHosts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const CidrCalculatorTool: React.FC = () => {
  const { state, setField, setState } = useTabPageStore(PAGE_KEY, {
    input: '10.0.0.0/24',
    newPrefix: 26,
  });
  const { input, newPrefix } = state;
  const [info, setInfo] = useState<CidrInfo | null>(() => {
    const r = parseCidr('10.0.0.0/24');
    return r.ok ? r.info : null;
  });
  const [subnets, setSubnets] = useState<SubnetSplit[]>(() => {
    const r = parseCidr('10.0.0.0/24');
    if (!r.ok || r.info.version !== 4) return [];
    const split = splitIPv4Subnets(r.info, 26);
    return split.ok ? split.subnets : [];
  });
  const [error, setError] = useState<string | null>(null);

  const resultText = useMemo(() => {
    if (!info) return '';
    let t = formatCidrText(info);
    if (subnets.length > 0) {
      t +=
        '\n\n--- 子网划分 ---\n' +
        subnets
          .map(
            (s) =>
              `#${s.index} ${s.cidr}  net=${s.network}  bcast=${s.broadcast}  hosts=${s.usableHosts}`,
          )
          .join('\n');
    }
    return t;
  }, [info, subnets]);

  const run = useCallback(() => {
    const r = parseCidr(input);
    if (!r.ok) {
      setError(r.error);
      setInfo(null);
      setSubnets([]);
      return;
    }
    setError(null);
    setInfo(r.info);
    if (r.info.version === 4) {
      const split = splitIPv4Subnets(r.info, newPrefix);
      if (split.ok) {
        setSubnets(split.subnets);
      } else {
        setSubnets([]);
        if (newPrefix !== r.info.prefix) message.warning(split.error);
      }
    } else {
      setSubnets([]);
    }
  }, [input, newPrefix]);

  return (
    <NetworkToolLayout
      title="CIDR/子网计算器"
      icon={resolveNetworkIcon('ApartmentOutlined')}
      description="计算网络地址、广播、可用主机范围，支持 IPv4 子网划分与 IPv6 基础解析"
      submitText="计算"
      onSubmit={run}
      resultText={resultText}
      error={error}
      result={
        info ? (
          <CidrResultView info={info} subnets={subnets} newPrefix={newPrefix} />
        ) : (
          <p className="ntl-cidr-empty" data-testid="cidr-result">
            输入 CIDR（如 10.0.0.0/24）后点击计算
          </p>
        )
      }
    >
      <div className="ntl-form" data-testid="cidr-form">
        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">网络地址</span>
            <span className="ntl-form-section-desc">IPv4 子网划分 · IPv6 基础解析</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-row">
              <div className="ntl-form-field ntl-form-field--grow">
                <label>CIDR</label>
                <Input
                  value={input}
                  onChange={(e) => setField('input', e.target.value)}
                  placeholder="10.0.0.0/24 或 2001:db8::/32"
                  data-testid="cidr-input"
                  onPressEnter={run}
                />
              </div>
              <div className="ntl-form-field ntl-form-field--md">
                <label>划分子网前缀 (IPv4)</label>
                <InputNumber
                  min={0}
                  max={32}
                  value={newPrefix}
                  onChange={(v) => setState((p) => ({ ...p, newPrefix: Number(v ?? p.newPrefix) }))}
                  style={{ width: '100%' }}
                  data-testid="cidr-new-prefix"
                />
              </div>
            </div>
            <p className="ntl-form-hint-box">
              示例：10.0.0.0/24 划分到 /26 会得到 4 个子网；IPv6 如 2001:db8::/32
            </p>
          </div>
        </section>
      </div>
    </NetworkToolLayout>
  );
};

export default CidrCalculatorTool;
