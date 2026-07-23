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
  Tag,
  Typography,
} from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { httpHeaderAnalyze, type HttpHeaderAnalyzerResult, type HttpHeaderField } from '../../services/networkService';

const { Text } = Typography;

const CATEGORY_ORDER = ['安全', '缓存', '内容协商', 'CORS', '服务器', '其他'];

const CATEGORY_COLOR: Record<string, string> = {
  安全: 'green',
  缓存: 'blue',
  内容协商: 'cyan',
  CORS: 'purple',
  服务器: 'orange',
  其他: 'default',
};

export default function HttpHeaderTool() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HttpHeaderAnalyzerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { url: string; timeoutMs?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await httpHeaderAnalyze({
        url: values.url.trim(),
        timeoutMs: values.timeoutMs,
      });
      if (data.success) {
        setResult(data);
        setError(null);
      } else {
        setResult(null);
        setError(data.errorMessage ?? 'HTTP 头分析失败');
      }
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
      return <Alert type="error" showIcon message="分析失败" description={error} />;
    }
    if (!result) return null;
    // 友好降级：success=true + errorMessage（如 DNS 失败、SSRF 拦截、连接超时等）
    if (result.errorMessage) {
      const isBlocked = result.errorMessage.includes('不允许访问');
      return (
        <Alert
          type={isBlocked ? 'error' : 'warning'}
          showIcon
          message={isBlocked ? '请求被拦截' : 'HTTP 头分析提示'}
          description={result.errorMessage}
        />
      );
    }
    const categories = result.categories ?? {};
    return (
      <>
        <Card size="small" style={{ marginBottom: 16 }} title="请求概况">
          <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
            <Descriptions.Item label="状态码">
              <Tag color={result.statusCode >= 200 && result.statusCode < 400 ? 'success' : 'error'}>
                {result.statusCode} {result.statusText}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="耗时">{result.elapsedMs} ms</Descriptions.Item>
            <Descriptions.Item label="最终 URL" span={2}>
              <Text style={{ wordBreak: 'break-all' }}>{result.finalUrl || result.url}</Text>
            </Descriptions.Item>
          </Descriptions>
          {result.missingSecurityHeaders.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              message="缺失的关键安全响应头"
              description={
                <span>
                  {result.missingSecurityHeaders.map((h) => (
                    <Tag key={h} color="warning" style={{ marginBottom: 4 }}>
                      {h}
                    </Tag>
                  ))}
                </span>
              }
            />
          ) : (
            <Alert
              type="success"
              showIcon
              style={{ marginTop: 12 }}
              message="关键安全响应头均已配置"
            />
          )}
        </Card>

        <Divider>响应头分类（共 {Object.values(categories).flat().length} 项）</Divider>
        {CATEGORY_ORDER.filter((c) => categories[c]?.length).map((category) => (
          <Card
            key={category}
            size="small"
            style={{ marginBottom: 12 }}
            title={
              <span>
                <Tag color={CATEGORY_COLOR[category]}>{category}</Tag>
                {categories[category].length} 项
              </span>
            }
          >
            <Descriptions column={1} size="small" bordered>
              {categories[category].map((f: HttpHeaderField) => (
                <Descriptions.Item key={f.key} label={f.key}>
                  <Text style={{ wordBreak: 'break-all' }}>{f.value || '-'}</Text>
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        ))}
        {Object.keys(categories).length === 0 && <Empty description="无响应头" />}
      </>
    );
  }, [result, error]);

  return (
    <NetworkToolLayout
      title="HTTP Header 分析器"
      icon={resolveNetworkIcon('ProfileOutlined')}
      description="抓取目标 URL 的响应头，按类别分组展示，并标记缺失的关键安全响应头（HSTS/CSP/X-Content-Type-Options/X-Frame-Options/Referrer-Policy）。"
      showSubmit
      submitText="分析头"
      loading={loading}
      onSubmit={handleSubmit}
      result={resultNode}
      resultText={resultText}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ url: 'https://example.com', timeoutMs: 15000 }}
        style={{ maxWidth: 720 }}
      >
        <Form.Item
          label="URL"
          name="url"
          rules={[{ required: true, message: '请输入目标 URL（http/https）' }]}
        >
          <Input placeholder="https://example.com" allowClear onPressEnter={handleSubmit} />
        </Form.Item>
        <Form.Item label="超时（毫秒）" name="timeoutMs">
          <InputNumber min={1000} max={60000} step={1000} style={{ width: 160 }} />
        </Form.Item>
      </Form>
    </NetworkToolLayout>
  );
}
