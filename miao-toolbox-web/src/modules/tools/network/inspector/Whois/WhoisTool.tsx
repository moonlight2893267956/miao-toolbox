import { useMemo, useState } from 'react';
import { Alert, Collapse, Descriptions, Input, InputNumber, Space, Typography } from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { whoisQuery, type WhoisQueryResult } from '../../services/networkService';
import { resolveNetworkIcon } from '../../utils/iconMap';

function extractError(e: unknown): string {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message || err?.message || 'WHOIS 查询失败';
}

export default function WhoisTool() {
  const [target, setTarget] = useState('');
  const [whoisServer, setWhoisServer] = useState('');
  const [timeoutMs, setTimeoutMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WhoisQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!target.trim()) {
      setError('请输入域名或 IP');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await whoisQuery({
        target: target.trim(),
        whoisServer: whoisServer.trim() || undefined,
        timeoutMs: timeoutMs ?? undefined,
      });
      setResult(res);
    } catch (e) {
      setError(extractError(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const resultNode = useMemo(() => {
    if (error) return <Alert type="error" showIcon message={error} />;
    if (!result) return null;
    return (
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          {result.target} · 类型 {result.queryType} · 服务器 {result.whoisServer} ·
          {result.found ? ` 解析到 ${result.fields.length} 个字段` : ' 未查到记录'}
        </Typography.Text>
        {result.fields.length > 0 && (
          <Descriptions bordered size="small" column={1}>
            {result.fields.map((f, i) => (
              <Descriptions.Item key={i} label={f.key}>
                {f.value}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
        <Collapse
          size="small"
          items={[
            {
              key: 'raw',
              label: '查看原始 WHOIS 文本',
              children: (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    margin: 0,
                    maxHeight: 320,
                    overflow: 'auto',
                  }}
                >
                  {result.raw}
                </pre>
              ),
            },
          ]}
        />
      </Space>
    );
  }, [result, error]);

  return (
    <NetworkToolLayout
      title="WHOIS 查询"
      icon={resolveNetworkIcon('IdcardOutlined')}
      description="查询域名或 IP 的 WHOIS 注册信息（注册商、创建/过期时间、组织、ASN 等）。所有查询由服务端发起。"
      showSubmit
      submitText="查询"
      loading={loading}
      onSubmit={run}
      result={resultNode}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <div className="ntl-field-label">目标（域名或 IP）</div>
          <Input
            placeholder="example.com 或 8.8.8.8"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onPressEnter={run}
            allowClear
          />
        </div>
        <div>
          <div className="ntl-field-label">WHOIS 服务器（可选，默认自动 referral）</div>
          <Input
            placeholder="whois.verisign-grs.com 或 8.8.8.8:43"
            value={whoisServer}
            onChange={(e) => setWhoisServer(e.target.value)}
            allowClear
          />
        </div>
        <div>
          <div className="ntl-field-label">超时（毫秒，1000-55000，默认 30000）</div>
          <InputNumber
            style={{ width: '100%' }}
            min={1000}
            max={55000}
            step={1000}
            value={timeoutMs}
            onChange={(v) => setTimeoutMs(v)}
            placeholder="30000"
          />
        </div>
      </Space>
    </NetworkToolLayout>
  );
}
