import { useMemo, useState } from 'react';
import {
  Alert,
  Card,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Progress,
  Tag,
  Typography,
} from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { ipReputation, type IpReputationResult } from '../../services/networkService';

const { Text } = Typography;

export default function IpReputationTool() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IpReputationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { ip: string; maxAgeInDays?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await ipReputation({
        ip: values.ip.trim(),
        maxAgeInDays: values.maxAgeInDays,
      });
      setResult(data);
      setError(null);
    } catch (e) {
      const resp = (e as { response?: { data?: { message?: string } } }).response?.data;
      setError(resp?.message ?? (e instanceof Error ? e.message : '请求失败'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    form.submit();
  };

  const resultText = result ? JSON.stringify(result, null, 2) : '';

  const resultNode = useMemo(() => {
    if (error) {
      return <Alert type="error" showIcon message="查询失败" description={error} />;
    }
    if (!result) return null;

    // 未配置 Key / 配额耗尽等友好提示
    if (result.message) {
      return (
        <Alert
          type={result.configured ? 'warning' : 'info'}
          showIcon
          message={result.configured ? '查询受限' : '未配置 API Key'}
          description={result.message}
        />
      );
    }

    const score = result.abuseConfidenceScore;
    const scoreColor = score >= 75 ? '#cf1322' : score >= 25 ? '#fa8c16' : '#52c41a';
    return (
      <>
        <Card size="small" style={{ marginBottom: 16 }} title={`IP ${result.ip} 信誉`}>
          <div style={{ marginBottom: 12 }}>
            <Text>滥用置信评分：</Text>
            <Progress
              percent={score}
              strokeColor={scoreColor}
              format={(p) => `${p}/100`}
              style={{ maxWidth: 360, marginTop: 4 }}
            />
          </div>
          <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
            <Descriptions.Item label="举报总数">{result.totalReports}</Descriptions.Item>
            <Descriptions.Item label="最近举报">
              {result.lastReportedAt ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="公共 IP">
              {result.isPublic ? <Tag color="blue">是</Tag> : <Tag>否</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="白名单">
              {result.isWhitelisted ? <Tag color="green">是</Tag> : <Tag>否</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="国家/地区">{result.countryCode ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="ISP">{result.isp ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="关联域名" span={2}>
              {result.domain ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="用途类型" span={2}>
              {result.usageType ?? '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Divider>最近举报（{result.reports?.length ?? 0}）</Divider>
        {result.reports && result.reports.length > 0 ? (
          result.reports.map((r, i) => (
            <Card key={i} size="small" style={{ marginBottom: 12 }} title={r.reportedAt ?? '未知时间'}>
              <div style={{ marginBottom: 4 }}>
                {r.categories.map((c) => (
                  <Tag key={c}>{c}</Tag>
                ))}
              </div>
              <Text type="secondary">{r.comment || '（无说明）'}</Text>
            </Card>
          ))
        ) : (
          <Empty description="无举报记录" />
        )}
      </>
    );
  }, [result, error]);

  return (
    <NetworkToolLayout
      title="IP 信誉检查器"
      icon={resolveNetworkIcon('AlertOutlined')}
      description="通过 AbuseIPDB 查询 IP 的滥用评分、举报次数与关联信息。API Key 经由环境变量 ABUSEIPDB_API_KEY 注入。"
      showSubmit
      submitText="查询"
      loading={loading}
      onSubmit={handleSubmit}
      result={resultNode}
      resultText={resultText}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ ip: '8.8.8.8', maxAgeInDays: 90 }}
        style={{ maxWidth: 720 }}
      >
        <Form.Item
          label="IP 地址"
          name="ip"
          rules={[{ required: true, message: '请输入 IPv4/IPv6 地址' }]}
        >
          <Input placeholder="8.8.8.8" allowClear onPressEnter={handleSubmit} />
        </Form.Item>
        <Form.Item label="统计窗口（天，1-365）" name="maxAgeInDays">
          <InputNumber min={1} max={365} style={{ width: 160 }} />
        </Form.Item>
      </Form>
    </NetworkToolLayout>
  );
}
