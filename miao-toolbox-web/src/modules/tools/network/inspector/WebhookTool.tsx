import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Input, InputNumber, Popconfirm, message } from 'antd';
import {
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
  CaretDownFilled,
  ThunderboltOutlined,
} from '@ant-design/icons';
import NetworkToolLayout from '../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../utils/iconMap';
import axiosInstance from '../../../../services/axiosInstance';
import {
  createWebhook,
  deleteWebhook,
  getWebhookHistory,
  getWebhookInfo,
  saveWebhookResponse,
  subscribeWebhook,
  type WebhookHistoryItem,
  type WebhookInfo,
} from '../services/networkService';
import './webhook-tool.css';

/** 相对时间：刚刚 / N 秒前 / N 分钟前 / N 小时前 */
const formatAgo = (ts: number, now: number): string => {
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return '刚刚';
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
};

/** 根据 HTTP 状态码返回颜色色调 class（2xx 绿 / 3xx 蓝 / 4xx 橙 / 5xx 红 / 其他灰）。 */
const statusTone = (code: number): string => {
  if (code >= 500) return 'is-5xx';
  if (code >= 400) return 'is-4xx';
  if (code >= 300) return 'is-3xx';
  if (code >= 200) return 'is-2xx';
  return 'is-other';
};

const sampleTestPayload = { event: 'order.created', id: 'evt_123', paid: true };

type LiveStatus = 'idle' | 'live' | 'reconnecting' | 'offline';

const WebhookTool: React.FC = () => {
  const [hookId, setHookId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<WebhookInfo | null>(null);
  const [history, setHistory] = useState<WebhookHistoryItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusCode, setStatusCode] = useState<number>(200);
  const [customBody, setCustomBody] = useState('');
  const [customHeaders, setCustomHeaders] = useState<{ id: string; key: string; value: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('idle');
  const [copied, setCopied] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const stopSubscription = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setLiveStatus('idle');
  }, []);

  const activate = useCallback(
    async (id: string) => {
      try {
        const [i, h] = await Promise.all([getWebhookInfo(id), getWebhookHistory(id)]);
        setInfo(i);
        setHistory(h);
        if (i.customResponse) {
          setStatusCode(i.customResponse.statusCode || 200);
          setCustomBody(i.customResponse.body ?? '');
          setCustomHeaders(
            Object.entries(i.customResponse.headers ?? {}).map(([k, v]) => ({
              id: crypto.randomUUID(),
              key: k,
              value: v,
            })),
          );
        } else {
          setCustomHeaders([]);
        }
        stopSubscription();
        setLiveStatus('live');
        unsubscribeRef.current = subscribeWebhook(id, {
          onRequest: (item) => {
            setLiveStatus('live');
            setHistory((prev) => [item, ...prev].slice(0, 50));
            setInfo((prev) => (prev ? { ...prev, requestCount: prev.requestCount + 1 } : prev));
          },
          onError: (msg) => {
            setLiveStatus('reconnecting');
            message.warning(msg);
          },
        });
      } catch {
        setLiveStatus('offline');
        message.error('加载端点失败');
      }
    },
    [stopSubscription],
  );

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const resp = await createWebhook();
      setHookId(resp.hookId);
      setUrl(resp.url);
      await activate(resp.hookId);
      message.success('端点已创建，有效期 24 小时');
    } catch {
      message.error('创建失败');
    } finally {
      setCreating(false);
    }
  }, [activate]);

  const handleDelete = useCallback(async () => {
    if (!hookId) return;
    try {
      await deleteWebhook(hookId);
      stopSubscription();
      setHookId(null);
      setUrl('');
      setInfo(null);
      setHistory([]);
      setExpandedId(null);
      message.success('端点已删除');
    } catch {
      message.error('删除失败');
    }
  }, [hookId, stopSubscription]);

  const handleSaveResponse = useCallback(async () => {
    if (!hookId) return;
    setSaving(true);
    try {
      const headers: Record<string, string> = {};
      customHeaders.forEach((h) => {
        if (h.key.trim()) headers[h.key.trim()] = h.value;
      });
      await saveWebhookResponse(hookId, { statusCode, body: customBody, headers });
      message.success(statusCode > 0 ? '自定义响应已保存' : '已恢复默认响应');
      await activate(hookId);
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  }, [hookId, statusCode, customBody, customHeaders, activate]);

  const addHeader = useCallback(() => {
    setCustomHeaders((prev) => [...prev, { id: crypto.randomUUID(), key: '', value: '' }]);
  }, []);

  const updateHeader = useCallback((id: string, field: 'key' | 'value', val: string) => {
    setCustomHeaders((prev) => prev.map((h) => (h.id === id ? { ...h, [field]: val } : h)));
  }, []);

  const removeHeader = useCallback((id: string) => {
    setCustomHeaders((prev) => prev.filter((h) => h.id !== id));
  }, []);

  /** 一键向端点发送示例请求，演示实时信号（同源，无需离开页面） */
  const handleSendTest = useCallback(async () => {
    if (!hookId) return;
    setSending(true);
    try {
      await axiosInstance.post(`/api/network/webhook/${hookId}`, sampleTestPayload, {
        timeout: 10_000,
      });
      message.success('已发送示例请求，留意下方实时信号');
    } catch {
      message.error('发送失败');
    } finally {
      setSending(false);
    }
  }, [hookId]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      message.error('复制失败');
    }
  }, [url]);

  const handleCopyCurl = useCallback(async () => {
    const cmd = `curl -X POST '${url}' -H 'Content-Type: application/json' -d '${JSON.stringify(
      sampleTestPayload,
    )}'`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCurlCopied(true);
      setTimeout(() => setCurlCopied(false), 1600);
    } catch {
      message.error('复制失败');
    }
  }, [url]);

  useEffect(() => () => stopSubscription(), [stopSubscription]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const remainHours = info ? Math.max(0, Math.ceil((info.expiresAt - now) / 3_600_000)) : 0;
  const liveLabel =
    liveStatus === 'live'
      ? '实时接收中'
      : liveStatus === 'reconnecting'
        ? '重连中…'
        : liveStatus === 'offline'
          ? '已离线'
          : '待命';

  const children = !hookId ? (
    <div className="wh-create">
      <div className="wh-create-badge">
        <ThunderboltOutlined />
      </div>
      <h3 className="wh-create-title">搭建一座临时信号塔</h3>
      <p className="wh-create-desc">
        生成一个公开可访问的 Webhook 端点，把地址交给第三方服务（支付通知、CI
        钩子、表单上报等）。它们发来的每一次请求都会通过 SSE 实时推送到这里，并保留最近 50 条。
      </p>
      <button className="wh-create-cta" onClick={handleCreate} disabled={creating}>
        {creating ? '正在生成端点…' : (
          <>
            <PlusOutlined /> 创建端点
          </>
        )}
      </button>
      <div className="wh-create-steps">
        <span className="wh-step">
          <b>1</b> 点击创建，获得专属 URL
        </span>
        <span className="wh-step">
          <b>2</b> 交给第三方回调
        </span>
        <span className="wh-step">
          <b>3</b> 实时查看每一次请求
        </span>
      </div>
    </div>
  ) : (
    <div className="wh-config">
      <div className="wh-endpoint">
        <div className="wh-signal-bar" />
        <div className="wh-endpoint-top">
          <div className="wh-url-block">
            <span className="wh-url-label">
              <span className="wh-live-dot" data-status={liveStatus} />
              Webhook URL
            </span>
            <code className="wh-url-value">{url}</code>
          </div>
          <div className="wh-endpoint-actions">
            <button className={`wh-btn ${copied ? 'is-copied' : ''}`} onClick={handleCopy}>
              {copied ? <CheckOutlined /> : <CopyOutlined />}
              {copied ? '已复制' : '复制'}
            </button>
            <button className="wh-btn wh-btn--primary" onClick={handleSendTest} disabled={sending}>
              {sending ? '发送中…' : '发送测试请求'}
            </button>
            <Popconfirm title="确认删除该端点？" onConfirm={handleDelete} okText="删除" cancelText="取消">
              <button className="wh-btn wh-btn--danger">
                <DeleteOutlined /> 删除
              </button>
            </Popconfirm>
          </div>
        </div>
        <div className="wh-meta">
          <span className="wh-pill">
            <span className="wh-dot" data-status={liveStatus} />
            {liveLabel}
          </span>
          <span className="wh-pill">
            剩余 <b>{remainHours}</b> 小时
          </span>
          <span className="wh-pill wh-pill--count" key={info?.requestCount ?? 0}>
            已接收 <b>{info?.requestCount ?? 0}</b> 条
          </span>
        </div>
      </div>

      <div className="wh-custom">
        <div className="wh-custom-head">
          <span className="wh-custom-title">
            <span className="wh-dots">
              <i />
              <i />
              <i />
            </span>
            自定义响应（可选）
          </span>
          <button className="wh-btn wh-btn--primary" onClick={handleSaveResponse} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
        <div className="wh-custom-body">
          <InputNumber
            className="wh-status-input"
            min={100}
            max={599}
            value={statusCode}
            onChange={(v) => setStatusCode(v ?? 200)}
            addonBefore="状态码"
            style={{ width: 200 }}
          />
          <Input.TextArea
            className="wh-body-input"
            value={customBody}
            onChange={(e) => setCustomBody(e.target.value)}
            placeholder="响应体（JSON 文本）；状态码≤0 则使用默认 200"
            rows={2}
            style={{ flex: 1, minWidth: 240 }}
          />
          <p className="wh-custom-hint">
            第三方回调时，端点会按此处配置返回；不填则默认返回 200 与 {"{ \"ok\": true }"}。
          </p>
        </div>
        <div className="wh-custom-headers">
          <div className="wh-custom-headers-head">
            <span className="wh-detail-label">响应头（可选）</span>
            <button className="wh-btn wh-btn--sm" type="button" onClick={addHeader}>
              + 添加响应头
            </button>
          </div>
          {customHeaders.length === 0 ? (
            <div className="wh-kv-empty">暂无自定义响应头</div>
          ) : (
            <div className="wh-header-rows">
              {customHeaders.map((h) => (
                <div className="wh-header-row" key={h.id}>
                  <input
                    className="wh-hdr-input"
                    placeholder="Header-Name"
                    value={h.key}
                    onChange={(e) => updateHeader(h.id, 'key', e.target.value)}
                  />
                  <input
                    className="wh-hdr-input"
                    placeholder="value"
                    value={h.value}
                    onChange={(e) => updateHeader(h.id, 'value', e.target.value)}
                  />
                  <button
                    className="wh-hdr-del"
                    type="button"
                    onClick={() => removeHeader(h.id)}
                    aria-label="删除响应头"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <button className="wh-btn" onClick={handleCopyCurl} style={{ alignSelf: 'flex-start' }}>
        {curlCopied ? <CheckOutlined /> : <CopyOutlined />}
        {curlCopied ? '已复制 curl 命令' : '复制 curl 测试命令'}
      </button>
    </div>
  );

  const result = hookId ? (
    <div className="wh-history">
      <div className="wh-history-head">
        <span>实时请求（最近 {history.length} 条）</span>
        <span className="wh-stream-tag">
          <span className="wh-dot" />
          SSE 实时推送
        </span>
      </div>
      {history.length === 0 ? (
        <div className="wh-req-empty">
          <span className="wh-req-empty-icon">
            <ThunderboltOutlined />
          </span>
          <p>信号塔已就位，等待第三方发来第一次请求…</p>
          <p style={{ fontSize: 12, color: 'var(--miao-text-tertiary)' }}>
            也可以点上方「发送测试请求」立即看到效果。
          </p>
        </div>
      ) : (
        <ul className="wh-history-list">
          {history.map((item, idx) => {
            const isOpen = expandedId === item.id;
            return (
              <li
                key={item.id}
                className={`wh-req-card${isOpen ? ' is-open' : ''}${idx === 0 ? ' is-new' : ''}`}
              >
                <button
                  className="wh-req-head"
                  onClick={() => setExpandedId(isOpen ? null : item.id)}
                >
                  <span className="wh-method" data-method={item.method}>
                    {item.method}
                  </span>
                  <span className="wh-req-path" title={item.path}>
                    {item.path}
                  </span>
                  <span className="wh-req-sub">
                    <span className="wh-ip">{item.sourceIp}</span>
                    <span>·</span>
                    <span>{item.sizeBytes} B</span>
                    <span>·</span>
                    <span>{formatAgo(item.receivedAt, now)}</span>
                  </span>
                  <CaretDownFilled className="wh-req-caret" />
                </button>
                <div className="wh-req-detail">
                  <div className="wh-req-detail-inner">
                    <div className="wh-req-detail-pad">
                      <div className="wh-detail-section">
                        <span className="wh-detail-label">查询参数</span>
                        {Object.keys(item.queryParams).length ? (
                          <div className="wh-kv">
                            {Object.entries(item.queryParams).map(([k, v]) => (
                              <div className="wh-kv-row" key={k}>
                                <span className="wh-kv-key">{k}</span>
                                <span className="wh-kv-val">{v}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="wh-kv-empty">无</div>
                        )}
                      </div>
                      <div className="wh-detail-section">
                        <span className="wh-detail-label">请求头</span>
                        <div className="wh-kv">
                          {Object.entries(item.headers).map(([k, v]) => (
                            <div className="wh-kv-row" key={k}>
                              <span className="wh-kv-key">{k}</span>
                              <span className="wh-kv-val">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="wh-detail-section">
                        <span className="wh-detail-label">请求体</span>
                        <pre className="wh-body-block">{item.body ?? '(空)'}</pre>
                      </div>
                      <div className="wh-detail-section">
                        <span className="wh-detail-label">
                          响应内容
                          {typeof item.responseStatusCode === 'number' && (
                            <span className={`wh-status-badge ${statusTone(item.responseStatusCode)}`}>
                              {item.responseStatusCode}
                            </span>
                          )}
                        </span>
                        {typeof item.responseStatusCode !== 'number' ? (
                          <div className="wh-kv-empty">旧数据未记录响应内容</div>
                        ) : (
                          <>
                            {item.responseHeaders && Object.keys(item.responseHeaders).length > 0 && (
                              <>
                                <span className="wh-sub-label">响应头</span>
                                <div className="wh-kv">
                                  {Object.entries(item.responseHeaders).map(([k, v]) => (
                                    <div className="wh-kv-row" key={k}>
                                      <span className="wh-kv-key">{k}</span>
                                      <span className="wh-kv-val">{v}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                            <span className="wh-sub-label">响应体</span>
                            <pre className="wh-body-block">{item.responseBody ?? '(空)'}</pre>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  ) : null;

  return (
    <NetworkToolLayout
      title="Webhook 接收器"
      icon={resolveNetworkIcon('ThunderboltOutlined')}
      description="创建一个临时公开端点，实时接收并查看第三方回调请求（如支付通知、CI 钩子）。端点有效期 24 小时，请求通过 SSE 实时推送到本页面。"
      showSubmit={false}
      result={result}
    >
      <div className="wh-root">{children}</div>
    </NetworkToolLayout>
  );
};

export default WebhookTool;
