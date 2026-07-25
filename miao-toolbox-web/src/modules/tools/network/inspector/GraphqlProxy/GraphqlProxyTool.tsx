import { useMemo, useState } from 'react';
import {
  Alert,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  Tag,
  Typography,
} from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { proxyGraphql, type GraphqlProxyResult } from '../../services/networkService';

const { Text } = Typography;

function parseHeaders(raw?: string): Record<string, string> | undefined {
  if (!raw || !raw.trim()) return undefined;
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export default function GraphqlProxyTool() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GraphqlProxyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: {
    endpoint: string;
    query: string;
    variables?: string;
    headers?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await proxyGraphql({
        endpoint: values.endpoint.trim(),
        query: values.query,
        variables: values.variables?.trim() || undefined,
        headers: parseHeaders(values.headers),
      });
      setResult(data);
    } catch (e) {
      const resp = (e as { response?: { data?: { message?: string } } }).response?.data;
      setError(resp?.message ?? (e instanceof Error ? e.message : '请求失败'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => form.submit();

  const prettyBody = useMemo(() => {
    if (!result?.body) return '';
    try {
      return JSON.stringify(JSON.parse(result.body), null, 2);
    } catch {
      return result.body;
    }
  }, [result]);

  const resultNode = useMemo(() => {
    if (error && !result) {
      return <Alert type="error" showIcon message="代理失败" description={error} />;
    }
    if (!result) return null;
    return (
      <>
        <Card size="small" style={{ marginBottom: 16 }} title="响应概况">
          <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
            <Descriptions.Item label="状态码">
              <Tag color={result.statusCode >= 200 && result.statusCode < 400 ? 'success' : 'error'}>
                {result.statusCode}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="耗时">{result.elapsedMs} ms</Descriptions.Item>
          </Descriptions>
        </Card>

        <Divider>响应头</Divider>
        <Card size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} size="small" bordered>
            {Object.entries(result.headers || {}).map(([k, v]) => (
              <Descriptions.Item key={k} label={k}>
                <Text style={{ wordBreak: 'break-all' }}>{v}</Text>
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>

        <Divider>响应体（JSON）</Divider>
        <Card size="small">
          <pre
            style={{
              margin: 0,
              maxHeight: 360,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {prettyBody}
          </pre>
        </Card>
      </>
    );
  }, [result, error, prettyBody]);

  return (
    <NetworkToolLayout
      title="GraphQL 查询测试器"
      icon={resolveNetworkIcon('CodeOutlined')}
      description="服务端代发 POST 请求转发 GraphQL 查询（支持 Variables 与自定义 Header），展示 JSON 响应。目标地址受 SSRF 防护。"
      showSubmit
      submitText="执行查询"
      loading={loading}
      onSubmit={handleSubmit}
      result={resultNode}
      resultText={result ? JSON.stringify(result, null, 2) : ''}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          endpoint: 'https://countries.trevorblades.com/',
          query: 'query {\n  countries {\n    code\n    name\n  }\n}',
          variables: '',
          headers: '',
        }}
        style={{ maxWidth: 760 }}
      >
        <Form.Item
          label="端点 URL"
          name="endpoint"
          rules={[{ required: true, message: '请输入 GraphQL 端点 URL' }]}
        >
          <Input placeholder="https://api.example.com/graphql" allowClear onPressEnter={handleSubmit} />
        </Form.Item>
        <Form.Item
          label="查询语句（Query / Mutation）"
          name="query"
          rules={[{ required: true, message: '请输入查询语句' }]}
        >
          <Input.TextArea rows={8} placeholder="query { ... }" />
        </Form.Item>
        <Form.Item label="Variables（可选，JSON）" name="variables" extra="如 { 'id': '1' }">
          <Input.TextArea rows={3} placeholder='{ "id": "1" }' />
        </Form.Item>
        <Form.Item
          label="自定义 HTTP Header（可选）"
          name="headers"
          extra="每行一个，格式 Key: Value"
        >
          <Input.TextArea rows={3} placeholder="Authorization: Bearer xxx" />
        </Form.Item>
      </Form>
    </NetworkToolLayout>
  );
}
