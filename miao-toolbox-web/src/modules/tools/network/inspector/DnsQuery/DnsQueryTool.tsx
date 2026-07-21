import { useMemo, useState } from 'react';
import { Alert, Input, Select, Space, Table, Tag, Typography } from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { dnsQuery, type DnsQueryResult, type DnsRecordResult } from '../../services/networkService';
import { resolveNetworkIcon } from '../../utils/iconMap';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'PTR'];

const columns = [
  {
    title: '类型',
    dataIndex: 'type',
    key: 'type',
    width: 90,
    render: (t: string) => <Tag color="blue">{t}</Tag>,
  },
  { title: '记录名', dataIndex: 'name', key: 'name' },
  { title: 'TTL', dataIndex: 'ttl', key: 'ttl', width: 90 },
  { title: '值', dataIndex: 'value', key: 'value', ellipsis: true },
];

function extractError(e: unknown): string {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message || err?.message || 'DNS 查询失败';
}

export default function DnsQueryTool() {
  const [domain, setDomain] = useState('');
  const [types, setTypes] = useState<string[]>(['A', 'AAAA']);
  const [dnsServer, setDnsServer] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DnsQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!domain.trim()) {
      setError('请输入域名');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await dnsQuery({
        domain: domain.trim(),
        types,
        dnsServer: dnsServer.trim() || undefined,
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
          域名 {result.domain} · 解析器 {result.dnsServer} · 共 {result.total} 条
        </Typography.Text>
        <Table<DnsRecordResult>
          size="small"
          rowKey={(_, i) => `${i}`}
          columns={columns}
          dataSource={result.records}
          pagination={false}
          locale={{ emptyText: '无记录' }}
        />
      </Space>
    );
  }, [result, error]);

  return (
    <NetworkToolLayout
      title="DNS 查询"
      icon={resolveNetworkIcon('SearchOutlined')}
      description="通过服务端 DNS 解析器查询域名的多种记录类型（A / AAAA / CNAME / MX / TXT / NS / SOA / PTR）。"
      showSubmit
      submitText="查询"
      loading={loading}
      onSubmit={run}
      result={resultNode}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <div className="ntl-field-label">域名</div>
          <Input
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onPressEnter={run}
            allowClear
          />
        </div>
        <div>
          <div className="ntl-field-label">记录类型</div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            value={types}
            onChange={setTypes}
            options={RECORD_TYPES.map((t) => ({ label: t, value: t }))}
            placeholder="选择记录类型"
          />
        </div>
        <div>
          <div className="ntl-field-label">DNS 服务器（可选，默认系统解析器）</div>
          <Input
            placeholder="8.8.8.8 或 1.1.1.1:53"
            value={dnsServer}
            onChange={(e) => setDnsServer(e.target.value)}
            allowClear
          />
        </div>
      </Space>
    </NetworkToolLayout>
  );
}
