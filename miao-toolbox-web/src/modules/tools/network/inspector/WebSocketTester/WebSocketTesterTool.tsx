import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Space } from 'antd';
import { DisconnectOutlined, SendOutlined, ThunderboltOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  connectWebSocket,
  disconnectWebSocket,
  sendWebSocket,
  subscribeWebSocketStream,
  type WebSocketEvent,
} from '../../services/networkService';
import './WebSocketTesterTool.css';

type Status = 'disconnected' | 'connecting' | 'connected';

const STATUS_META: Record<Status, { text: string; tone: string }> = {
  disconnected: { text: '未连接', tone: 'idle' },
  connecting: { text: '连接中…', tone: 'busy' },
  connected: { text: '已连接', tone: 'live' },
};

const TYPE_META: Record<string, { label: string }> = {
  connected: { label: 'connected' },
  sent: { label: 'sent →' },
  received: { label: '← recv' },
  closing: { label: 'closing' },
  closed: { label: 'closed' },
  error: { label: 'error' },
};

interface LogEntry extends WebSocketEvent {
  id: number;
  ts: string;
}

function now(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

export default function WebSocketTesterTool() {
  const [url, setUrl] = useState('wss://ws.postman-echo.com/raw');
  const [subprotocols, setSubprotocols] = useState('');
  const [status, setStatus] = useState<Status>('disconnected');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sent, setSent] = useState(0);
  const [received, setReceived] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const idRef = useRef(0);

  const appendLog = useCallback((e: WebSocketEvent) => {
    setLogs((prev) => [...prev, { ...e, id: idRef.current++, ts: now() }]);
    if (e.type === 'sent') setSent((n) => n + 1);
    if (e.type === 'received') setReceived((n) => n + 1);
  }, []);

  const doConnect = async () => {
    if (!url.trim()) {
      setError('请输入 ws:// 或 wss:// URL');
      return;
    }
    setError(null);
    setStatus('connecting');
    setLogs([]);
    setSent(0);
    setReceived(0);
    try {
      const sessionId = await connectWebSocket({
        url: url.trim(),
        subprotocols: subprotocols.trim() || undefined,
      });
      sessionRef.current = sessionId;
      stopRef.current = subscribeWebSocketStream(sessionId, {
        onEvent: (e) => {
          appendLog(e);
          if (e.type === 'connected') setStatus('connected');
          if (e.type === 'closed' || e.type === 'error') setStatus('disconnected');
        },
        onError: (msg) => setError(msg),
      });
    } catch (e) {
      setStatus('disconnected');
      const resp = (e as { response?: { data?: { message?: string } } }).response?.data;
      setError(resp?.message ?? (e instanceof Error ? e.message : '连接失败'));
    }
  };

  const doDisconnect = async () => {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
    const sid = sessionRef.current;
    if (sid) {
      try {
        await disconnectWebSocket(sid);
      } catch {
        /* ignore */
      }
    }
    sessionRef.current = null;
    setStatus('disconnected');
  };

  const doSend = async () => {
    const sid = sessionRef.current;
    if (!sid || !message.trim()) return;
    try {
      await sendWebSocket(sid, message);
      setMessage('');
    } catch (e) {
      const resp = (e as { response?: { data?: { message?: string } } }).response?.data;
      setError(resp?.message ?? (e instanceof Error ? e.message : '发送失败'));
    }
  };

  useEffect(
    () => () => {
      if (stopRef.current) stopRef.current();
    },
    [],
  );

  const statusMeta = STATUS_META[status];

  const resultNode = useMemo(() => {
    if (error && logs.length === 0) {
      return <Alert type="error" showIcon message="连接失败" description={error} />;
    }
    return (
      <div className="wst-console-wrap">
        <div className="wst-console-bar">
          <span className="wst-stat">
            <i className="wst-stat-ico wst-stat-ico--up" />
            已发送 <b>{sent}</b>
          </span>
          <span className="wst-stat">
            <i className="wst-stat-ico wst-stat-ico--down" />
            已接收 <b>{received}</b>
          </span>
          <span className="wst-stat wst-stat--muted">空闲 30s 自动断开</span>
        </div>

        <div className="wst-console" role="log" aria-live="polite">
          {logs.length === 0 ? (
            <div className="wst-console-empty">
              <span className="wst-prompt">$</span> 连接后事件将实时显示在这里…
            </div>
          ) : (
            logs.map((l) => {
              const meta = TYPE_META[l.type] ?? { label: l.type };
              const metaText =
                (l.code !== undefined ? `code=${l.code}  ` : '') + (l.reason ? l.reason : '');
              return (
                <div className="wst-line" data-type={l.type} key={l.id}>
                  <span className="wst-line-rail" aria-hidden />
                  <span className="wst-line-time">{l.ts}</span>
                  <span className="wst-line-type">{meta.label}</span>
                  {l.message ? (
                    <span className="wst-line-msg">{l.message}</span>
                  ) : metaText ? (
                    <span className="wst-line-msg wst-line-msg--muted">{metaText}</span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }, [logs, error, sent, received]);

  return (
    <NetworkToolLayout
      title="WebSocket 测试器"
      icon={resolveNetworkIcon('ThunderboltOutlined')}
      description="服务端代为建立 WebSocket 连接，实时收发消息；空闲 30s 自动断开。目标地址同样受 SSRF 防护。"
      showSubmit={false}
      result={resultNode}
      headerExtra={
        <div className={`wst-status wst-status--${statusMeta.tone}`}>
          <span className="wst-status-dot" />
          <span className="wst-status-text">{statusMeta.text}</span>
        </div>
      }
      extraActions={
        status === 'connected' ? (
          <Button danger icon={<DisconnectOutlined />} onClick={doDisconnect}>
            断开
          </Button>
        ) : null
      }
    >
      <div className="wst-field-group">
        <div className="wst-group-title">
          <span className="wst-group-dot" />
          连接配置
        </div>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            addonBefore="URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="wss://ws.postman-echo.com/raw"
            onPressEnter={doConnect}
          />
          <Input
            addonBefore="子协议"
            value={subprotocols}
            onChange={(e) => setSubprotocols(e.target.value)}
            placeholder="可选，逗号分隔，如 graphql-transport-ws"
            onPressEnter={doConnect}
          />
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={status === 'connecting'}
            onClick={doConnect}
            disabled={status === 'connected'}
            block
          >
            {status === 'connected' ? '已连接' : '建立连接'}
          </Button>
        </Space>
      </div>

      <div className="wst-divider" aria-hidden>
        <span>消息收发</span>
      </div>

      <div className="wst-field-group">
        <div className="wst-group-title">
          <span className="wst-group-dot wst-group-dot--send" />
          发送消息
        </div>
        <div className="wst-send-row">
          <Input
            className="wst-send-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="输入要发送的消息，回车发送"
            disabled={status !== 'connected'}
            onPressEnter={doSend}
          />
          <Button
            type="primary"
            ghost
            icon={<SendOutlined />}
            className="wst-send-btn"
            disabled={status !== 'connected'}
            onClick={doSend}
          >
            发送
          </Button>
        </div>
      </div>

      {error && logs.length > 0 && <Alert type="error" showIcon message={error} />}
    </NetworkToolLayout>
  );
}
