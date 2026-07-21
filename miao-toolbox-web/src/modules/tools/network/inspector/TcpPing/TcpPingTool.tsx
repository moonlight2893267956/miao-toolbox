/**
 * TCP Ping 检查器 — 服务端 TCP 连接延迟探测
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Input, InputNumber, message } from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  tcpPing,
  tcpPingStream,
  type TcpPingProbe,
  type TcpPingResult,
} from '../../services/networkService';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './tcp-ping.css';

const PAGE_KEY = 'tools-network-tcp-ping';

function formatResultText(r: TcpPingResult | null, probes: TcpPingProbe[]): string {
  if (!r && probes.length === 0) return '';
  const lines: string[] = [];
  if (r) {
    lines.push(`host=${r.host} port=${r.port} ip=${r.resolvedIp ?? '—'}`);
    lines.push(
      `success=${r.successCount}/${r.count} fail=${r.failCount}` +
        (r.avgLatencyMs != null ? ` avg=${r.avgLatencyMs.toFixed(1)}ms` : ''),
    );
  }
  const list = probes.length ? probes : r?.probes ?? [];
  for (const p of list) {
    if (p.success) {
      lines.push(`#${p.seq} ok ${p.latencyMs ?? '—'}ms`);
    } else {
      lines.push(`#${p.seq} fail ${p.errorCode ?? ''} ${p.message ?? ''}`);
    }
  }
  return lines.join('\n');
}

const TcpPingTool: React.FC = () => {
  const { state, setField } = useTabPageStore(PAGE_KEY, {
    host: 'www.baidu.com',
    port: 443,
    count: 4,
    continuous: false,
  });
  const { host, port, count, continuous } = state;

  const [loading, setLoading] = useState(false);
  const [probes, setProbes] = useState<TcpPingProbe[]>([]);
  const [summary, setSummary] = useState<TcpPingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const resultText = useMemo(
    () => formatResultText(summary, probes),
    [summary, probes],
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

    if (continuous) {
      abortRef.current = tcpPingStream(
        { host: h, port: Number(port) || 443, count: Math.min(30, Math.max(1, Number(count) || 30)) },
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
      return;
    }

    void tcpPing({
      host: h,
      port: Number(port) || 443,
      count: Math.min(30, Math.max(1, Number(count) || 4)),
    })
      .then((r) => {
        setSummary(r);
        setProbes(r.probes ?? []);
      })
      .catch((e: unknown) => {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          (e instanceof Error ? e.message : '探测失败');
        setError(msg);
        message.error(msg);
      })
      .finally(() => setLoading(false));
  }, [host, port, count, continuous, stopStream]);

  return (
    <NetworkToolLayout
      title="TCP Ping 检查器"
      icon={resolveNetworkIcon('RadarChartOutlined')}
      description="通过服务端 TCP 连接测延迟（无 ICMP）；默认端口 443，支持连续探测"
      submitText={continuous ? '开始连续探测' : '检测'}
      loading={loading}
      keepResultWhileLoading={continuous}
      onSubmit={run}
      resultText={resultText}
      error={error}
      extraActions={
        continuous && loading ? (
          <Button danger onClick={stopStream} data-testid="tcp-ping-stop">
            停止
          </Button>
        ) : null
      }
      result={
        probes.length === 0 && !summary ? (
          <p className="ntl-tp-empty" data-testid="tcp-ping-result">
            输入主机并检测后，显示每次 TCP 连接延迟
          </p>
        ) : (
          <div className="ntl-tp" data-testid="tcp-ping-result">
            <div className="ntl-tp-status">
              {summary && (
                <>
                  <span className="ntl-tp-chip ntl-tp-chip--info" data-testid="tcp-ping-target">
                    <span className="ntl-tp-chip-k">target</span>
                    {summary.host}:{summary.port}
                  </span>
                  {summary.resolvedIp && (
                    <span className="ntl-tp-chip">
                      <span className="ntl-tp-chip-k">ip</span>
                      {summary.resolvedIp}
                    </span>
                  )}
                  <span className="ntl-tp-chip ntl-tp-chip--ok" data-testid="tcp-ping-ok">
                    成功 {summary.successCount}/{summary.count}
                  </span>
                  {summary.failCount > 0 && (
                    <span className="ntl-tp-chip ntl-tp-chip--err">
                      失败 {summary.failCount}
                    </span>
                  )}
                  {summary.avgLatencyMs != null && (
                    <span className="ntl-tp-chip ntl-tp-chip--info" data-testid="tcp-ping-avg">
                      平均 {summary.avgLatencyMs.toFixed(1)} ms
                    </span>
                  )}
                </>
              )}
              {!summary && probes.length > 0 && (
                <span className="ntl-tp-chip">已完成 {probes.length} 次…</span>
              )}
            </div>
            <div className="ntl-tp-list" data-testid="tcp-ping-probes">
              {probes.map((p) => (
                <div
                  key={p.seq}
                  className={`ntl-tp-row${p.success ? ' ntl-tp-row--ok' : ' ntl-tp-row--fail'}`}
                  data-testid={`tcp-ping-probe-${p.seq}`}
                >
                  <span className="ntl-tp-seq">#{p.seq}</span>
                  <span className="ntl-tp-latency">
                    {p.success ? `${p.latencyMs ?? '—'} ms` : 'fail'}
                  </span>
                  <span className={`ntl-tp-msg${p.success ? '' : ' ntl-tp-msg--fail'}`}>
                    {p.success
                      ? p.message || 'connected'
                      : `${p.errorCode ?? ''} ${p.message ?? ''}`.trim()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      }
    >
      <div className="ntl-form" data-testid="tcp-ping-form">
        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">目标</span>
            <span className="ntl-form-section-desc">服务端出站 · SSRF 防护</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-row">
              <div className="ntl-form-field ntl-form-field--grow">
                <label>主机</label>
                <Input
                  value={host}
                  onChange={(e) => setField('host', e.target.value)}
                  placeholder="example.com 或 IP"
                  data-testid="tcp-ping-host"
                  onPressEnter={run}
                />
              </div>
              <div className="ntl-form-field ntl-form-field--sm">
                <label>端口</label>
                <InputNumber
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(v) => setField('port', Number(v ?? 443))}
                  style={{ width: '100%' }}
                  data-testid="tcp-ping-port"
                />
              </div>
              <div className="ntl-form-field ntl-form-field--sm">
                <label>次数</label>
                <InputNumber
                  min={1}
                  max={30}
                  value={count}
                  onChange={(v) => setField('count', Number(v ?? 4))}
                  style={{ width: '100%' }}
                  data-testid="tcp-ping-count"
                />
              </div>
            </div>
            <div className="ntl-form-checks">
              <Checkbox
                checked={continuous}
                onChange={(e) => {
                  setField('continuous', e.target.checked);
                  if (e.target.checked && count < 10) setField('count', 30);
                  if (!e.target.checked && count === 30) setField('count', 4);
                }}
                data-testid="tcp-ping-continuous"
              >
                连续检测（SSE 逐次推送，约每秒 1 次，最多 30 次）
              </Checkbox>
            </div>
            <p className="ntl-form-hint-box">
              使用 TCP 三次握手测延迟，非 ICMP Ping。内网地址会被 SSRF 防护拦截。
            </p>
          </div>
        </section>
      </div>
    </NetworkToolLayout>
  );
};

export default TcpPingTool;
