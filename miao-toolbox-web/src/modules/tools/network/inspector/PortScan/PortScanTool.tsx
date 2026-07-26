/**
 * 端口扫描器 — 批量探测目标主机端口开放状态与服务识别
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Input, InputNumber, Select, Tag } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  portScanStream,
  type PortScanProbe,
  type PortScanResult,
} from '../../services/networkService';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './port-scan.css';

const PAGE_KEY = 'tools-network-port-scan';

const PORT_PRESETS = [
  { label: '常见端口 (27个)', value: 'common' },
  { label: 'Web 服务', value: '80,443,8080,8443,8888,9090' },
  { label: '数据库', value: '3306,5432,1433,1521,6379,27017' },
  { label: '远程管理', value: '22,23,3389,5900' },
  { label: '邮件服务', value: '25,110,143,465,993,995' },
  { label: '1-1024 (知名端口)', value: '1-1024' },
];

function formatResultText(r: PortScanResult | null, probes: PortScanProbe[]): string {
  if (!r && probes.length === 0) return '';
  const lines: string[] = [];
  if (r) {
    lines.push(`host=${r.host} ip=${r.resolvedIp ?? '—'} range=${r.portRange}`);
    lines.push(`open=${r.openCount} closed=${r.closedCount} total=${r.totalPorts} elapsed=${r.elapsedMs}ms`);
  }
  const list = probes.length ? probes : r?.probes ?? [];
  for (const p of list) {
    if (p.open) {
      lines.push(`${p.port}/tcp OPEN ${p.service ?? 'Unknown'} ${p.latencyMs ?? '—'}ms`);
    } else {
      lines.push(`${p.port}/tcp CLOSED ${p.errorCode ?? ''} ${p.message ?? ''}`.trim());
    }
  }
  return lines.join('\n');
}

const PortScanTool: React.FC = () => {
  const { state, setField } = useTabPageStore(PAGE_KEY, {
    host: '',
    portRange: 'common',
    concurrency: 10,
    timeoutMs: 3000,
  });
  const { host, portRange, concurrency, timeoutMs } = state;

  const [loading, setLoading] = useState(false);
  const [probes, setProbes] = useState<PortScanProbe[]>([]);
  const [summary, setSummary] = useState<PortScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const resultText = useMemo(
    () => formatResultText(summary, probes),
    [summary, probes],
  );

  const openPorts = useMemo(
    () => probes.filter((p) => p.open).sort((a, b) => a.port - b.port),
    [probes],
  );

  const closedPorts = useMemo(
    () => probes.filter((p) => !p.open).sort((a, b) => a.port - b.port),
    [probes],
  );

  const stopStream = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const run = useCallback(() => {
    const h = host.trim();
    if (!h) {
      setError('请输入主机名或 IP');
      return;
    }
    setError(null);
    setProbes([]);
    setSummary(null);
    stopStream();
    setLoading(true);

    abortRef.current = portScanStream(
      {
        host: h,
        portRange: portRange || 'common',
        concurrency: Math.min(20, Math.max(1, Number(concurrency) || 10)),
        timeoutMs: Math.min(10000, Math.max(500, Number(timeoutMs) || 3000)),
      },
      {
        onProbe: (p) => setProbes((prev) => [...prev, p]),
        onSummary: (s) => {
          setSummary(s);
          setProbes(s.probes ?? []);
        },
        onDone: () => {
          setLoading(false);
          abortRef.current = null;
        },
        onError: (msg) => {
          setError(msg);
          setLoading(false);
          abortRef.current = null;
        },
      },
    );
  }, [host, portRange, concurrency, timeoutMs, stopStream]);

  const progressPct = summary
    ? 100
    : probes.length > 0
      ? Math.min(99, Math.round((probes.length / Math.max(probes.length + 1, 1)) * 100))
      : 0;

  return (
    <NetworkToolLayout
      title="端口扫描器"
      icon={resolveNetworkIcon('ScanOutlined')}
      description="批量探测目标主机端口开放状态，自动识别常见服务（仅 TCP 连接探测）"
      submitText="开始扫描"
      loading={loading}
      keepResultWhileLoading
      onSubmit={run}
      resultText={resultText}
      error={error}
      extraActions={
        loading ? (
          <Button danger onClick={stopStream} data-testid="port-scan-stop">
            停止
          </Button>
        ) : null
      }
      result={
        probes.length === 0 && !summary ? (
          <p className="ps-empty" data-testid="port-scan-result">
            输入目标并扫描后，显示端口开放状态与服务识别结果
          </p>
        ) : (
          <div className="ps" data-testid="port-scan-result">
            {/* 统计条 */}
            <div className="ps-stats">
              {summary && (
                <>
                  <span className="ps-stat-chip ps-stat-chip--target" data-testid="port-scan-target">
                    <span className="ps-stat-k">target</span>
                    {summary.host}
                  </span>
                  {summary.resolvedIp && (
                    <span className="ps-stat-chip">
                      <span className="ps-stat-k">ip</span>
                      {summary.resolvedIp}
                    </span>
                  )}
                  <span className="ps-stat-chip ps-stat-chip--range">
                    <span className="ps-stat-k">range</span>
                    {summary.portRange}
                  </span>
                </>
              )}
              <span className="ps-stat-chip ps-stat-chip--ok" data-testid="port-scan-open-count">
                <CheckCircleOutlined /> 开放 {openPorts.length}
              </span>
              <span className="ps-stat-chip ps-stat-chip--closed">
                <CloseCircleOutlined /> 关闭 {closedPorts.length}
              </span>
              {loading && (
                <span className="ps-stat-chip ps-stat-chip--loading">
                  <ClockCircleOutlined spin /> 扫描中 {probes.length}…
                </span>
              )}
              {summary && (
                <span className="ps-stat-chip ps-stat-chip--time">
                  耗时 {summary.elapsedMs}ms
                </span>
              )}
            </div>

            {/* 进度条 */}
            {loading && (
              <div className="ps-progress">
                <div className="ps-progress-bar" style={{ width: `${progressPct}%` }} />
              </div>
            )}

            {/* 开放端口列表 */}
            {openPorts.length > 0 && (
              <div className="ps-section">
                <h4 className="ps-section-title">
                  <CheckCircleOutlined style={{ color: 'var(--miao-success, #52c41a)' }} />
                  开放端口 ({openPorts.length})
                </h4>
                <div className="ps-port-grid" data-testid="port-scan-open-ports">
                  {openPorts.map((p) => (
                    <div key={p.port} className="ps-port-card ps-port-card--open">
                      <div className="ps-port-num">{p.port}</div>
                      <div className="ps-port-info">
                        <Tag color="green" className="ps-port-service">{p.service ?? 'Unknown'}</Tag>
                        {p.latencyMs != null && (
                          <span className="ps-port-latency">{p.latencyMs}ms</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 关闭端口（折叠） */}
            {closedPorts.length > 0 && (
              <details className="ps-section ps-section--closed" open={closedPorts.length <= 10}>
                <summary className="ps-section-title">
                  <CloseCircleOutlined style={{ color: 'var(--miao-error, #ff4d4f)' }} />
                  关闭/不可达端口 ({closedPorts.length})
                </summary>
                <div className="ps-closed-flow" data-testid="port-scan-closed-ports">
                  {closedPorts.map((p) => (
                    <span key={p.port} className="ps-closed-tag" title={p.message ?? p.errorCode ?? 'CLOSED'}>
                      <span className="ps-closed-tag__port">{p.port}</span>
                      <span className="ps-closed-tag__sep">/</span>
                      <span className="ps-closed-tag__status">
                        {p.errorCode === 'NETWORK_CONNECTION_REFUSED' ? '拒绝'
                          : p.errorCode === 'NETWORK_SSRF_BLOCKED' ? 'SSRF'
                          : p.errorCode === 'NETWORK_CONNECTION_TIMEOUT' ? '超时'
                          : '关闭'}
                      </span>
                    </span>
                  ))}
                </div>
              </details>
            )}
          </div>
        )
      }
    >
      <div className="ntl-form" data-testid="port-scan-form">
        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">扫描目标</span>
            <span className="ntl-form-section-desc">服务端出站 · SSRF 防护</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-row">
              <div className="ntl-form-field ntl-form-field--grow">
                <label>主机</label>
                <Input
                  value={host}
                  onChange={(e) => setField('host', e.target.value)}
                  placeholder="example.com 或 IP 地址"
                  data-testid="port-scan-host"
                  onPressEnter={run}
                />
              </div>
            </div>
            <div className="ntl-form-row">
              <div className="ntl-form-field ntl-form-field--grow">
                <label>端口范围</label>
                <Select
                  value={portRange}
                  onChange={(v) => setField('portRange', v)}
                  options={PORT_PRESETS}
                  data-testid="port-scan-preset"
                  style={{ width: '100%' }}
                />
              </div>
              <div className="ntl-form-field ntl-form-field--grow">
                <label>自定义（覆盖预设）</label>
                <Input
                  value={portRange === 'common' || PORT_PRESETS.some(p => p.value === portRange) ? '' : portRange}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setField('portRange', v || 'common');
                  }}
                  placeholder="如 80,443 或 1-1024 或 80,443,1000-1010"
                  data-testid="port-scan-custom-range"
                />
              </div>
            </div>
            <div className="ntl-form-row">
              <div className="ntl-form-field ntl-form-field--sm">
                <label>并发数</label>
                <InputNumber
                  min={1}
                  max={20}
                  value={concurrency}
                  onChange={(v) => setField('concurrency', Number(v ?? 10))}
                  style={{ width: '100%' }}
                  data-testid="port-scan-concurrency"
                />
              </div>
              <div className="ntl-form-field ntl-form-field--sm">
                <label>超时 (ms)</label>
                <InputNumber
                  min={500}
                  max={10000}
                  step={500}
                  value={timeoutMs}
                  onChange={(v) => setField('timeoutMs', Number(v ?? 3000))}
                  style={{ width: '100%' }}
                  data-testid="port-scan-timeout"
                />
              </div>
            </div>
            <p className="ntl-form-hint-box">
              仅扫描您拥有或已授权的目标。内网地址会被 SSRF 防护拦截。单次最多扫描 1000 个端口。
            </p>
          </div>
        </section>
      </div>
    </NetworkToolLayout>
  );
};

export default PortScanTool;
