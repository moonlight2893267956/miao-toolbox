import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Input, Space, Tag, Typography } from 'antd';
import { DisconnectOutlined, ThunderboltOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  connectWebSocket,
  disconnectWebSocket,
  sendWebSocket,
  subscribeWebSocketStream,
  type WebSocketEvent,
} from '../../services/networkService';

const { Text, Paragraph } = Typography;

type Status = 'disconnected' | 'connecting' | 'connected';

interface LogEntry extends WebSocketEvent {
  id: number;
}

const TYPE_COLOR: Record<string, string> = {
  connected: 'success',
  sent: 'blue',
  received: 'green',
  closing: 'orange',
  closed: 'default',
  error: 'error',
};

const STATUS_TAG: Record<Status, { color: string; text: string }> = {
  disconnected: { color: 'default', text: '未连接' },
  connecting: { color: 'processing', text: '连接中' },
  connected: { color: 'success', text: '已连接' },
};

export default function WebSocketTesterTool() {
  const [url, setUrl] = useState('wss://echo.example.com');
  const [subprotocols, setSubprotocols] = useState('');
  const [status, setStatus] = useState<Status>('disconnected');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const idRef = useRef(0);

  const appendLog = useCallback((e: WebSocketEvent) => {
    setLogs((prev) => [...prev, { ...e, id: idRef.current++ }]);
  }, []);

  const doConnect = async () => {
    if (!url.trim()) {
      setError('请输入 ws:// 或 wss:// URL');
      return;
    }
    setError(null);
    setStatus('connecting');
    setLogs([]);
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

  const resultNode = useMemo(() => {
    if (error && logs.length === 0) {
      return <Alert type="error" showIcon message="连接失败" description={error} />;
    }
    if (logs.length === 0) {
      return <div className="ntl-result-empty">连接后事件将实时显示在这里</div>;
    }
    return (
      <div style={{ maxHeight: 420, overflow: 'auto' }}>
        {logs.map((l) => (
          <Card key={l.id} size="small" style={{ marginBottom: 8 }}>
            <Space wrap>
              <Tag color={TYPE_COLOR[l.type] || 'default'}>{l.type}</Tag>
              {l.code !== undefined && <Text type="secondary">code={l.code}</Text>}
              {l.reason && <Text type="secondary">{l.reason}</Text>}
            </Space>
            {l.message && (
              <Paragraph style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {l.message}
              </Paragraph>
            )}
          </Card>
        ))}
      </div>
    );
  }, [logs, error]);

  const statusTag = STATUS_TAG[status];

  return (
    <NetworkToolLayout
      title="WebSocket 测试器"
      icon={resolveNetworkIcon('ThunderboltOutlined')}
      description="服务端代为建立 WebSocket 连接，实时收发消息；空闲 30s 自动断开。目标地址同样受 SSRF 防护。"
      showSubmit={false}
      result={resultNode}
      headerExtra={<Tag color={statusTag.color}>{statusTag.text}</Tag>}
      extraActions={
        status === 'connected' ? (
          <Button danger icon={<DisconnectOutlined />} onClick={doDisconnect}>
            断开
          </Button>
        ) : null
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Input
          addonBefore="URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="wss://echo.example.com"
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
        >
          {status === 'connected' ? '已连接' : '连接'}
        </Button>
        <Input.Search
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="输入要发送的消息，回车发送"
          enterButton="发送"
          disabled={status !== 'connected'}
          onSearch={doSend}
        />
        {error && logs.length > 0 && <Alert type="error" showIcon message={error} />}
      </Space>
    </NetworkToolLayout>
  );
}
