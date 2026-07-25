import { useMemo, useState } from 'react';
import {
  Alert,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  List,
  Tag,
  Typography,
} from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { checkCors, type CorsCheckResult } from '../../services/networkService';

const { Text, Paragraph } = Typography;

const SEVERITY_COLOR: Record<string, string> = {
  high: 'error',
  medium: 'warning',
  low: 'info',
};

export default function CorsCheckerTool() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CorsCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { url: string; origin?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await checkCors({
        url: values.url.trim(),
        origin: values.origin?.trim() || undefined,
      });
      setResult(data);
      if (!data.success) {
        setError(data.errorMessage ?? 'CORS 检查失败');
      }
    } catch (e) {
      const resp = (e as { response?: { data?: { message?: string } } }).response?.data;
      setError(resp?.message ?? (e instanceof Error ? e.message : '请求失败'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => form.submit();

  const resultText = result ? JSON.stringify(result, null, 2) : '';

  const resultNode = useMemo(() => {
    if (error && !result) {
      return <Alert type="error" showIcon message="检查失败" description={error} />;
    }
    if (!result) return null;
    if (!result.success) {
      const isBlocked = (result.errorMessage ?? '').includes('不允许访问');
      return (
        <Alert
          type={isBlocked ? 'error' : 'warning'}
          showIcon
          message={isBlocked ? '请求被拦截' : 'CORS 检查提示'}
          description={result.errorMessage}
        />
      );
    }
    return (
      <>
        <Card size="small" style={{ marginBottom: 16 }} title="预检概况">
          <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
            <Descriptions.Item label="指定 Origin 是否允许跨域" span={2}>
              {result.allowed ? (
                <Tag color="success">允许跨域</Tag>
              ) : (
                <Tag color="error">不允许跨域</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="状态码">
              <Tag color={result.statusCode >= 200 && result.statusCode < 400 ? 'success' : 'error'}>
                {result.statusCode}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="最终 URL">
              <Text style={{ wordBreak: 'break-all' }}>{result.finalUrl || '-'}</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Divider>Access-Control-Allow-* 响应头</Divider>
        <Card size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Allow-Origin">
              <Text style={{ wordBreak: 'break-all' }} copyable>
                {result.allowOrigin || '-'}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Allow-Methods">
              <Text style={{ wordBreak: 'break-all' }}>{result.allowMethods || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Allow-Headers">
              <Text style={{ wordBreak: 'break-all' }}>{result.allowHeaders || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Allow-Credentials">
              <Text style={{ wordBreak: 'break-all' }}>{result.allowCredentials || '-'}</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Divider>配置问题与修复建议</Divider>
        {result.issues.length === 0 ? (
          <Alert type="success" showIcon message="CORS 配置未发现明显问题" />
        ) : (
          <List
            size="small"
            dataSource={result.issues}
            renderItem={(it) => (
              <List.Item>
                <Alert
                  type={(SEVERITY_COLOR[it.severity] as 'error' | 'warning' | 'info') || 'info'}
                  showIcon
                  style={{ width: '100%' }}
                  message={
                    <span>
                      <Tag color={SEVERITY_COLOR[it.severity]}>{it.severity}</Tag>
                      {it.message}
                    </span>
                  }
                  description={it.fix ? <Paragraph style={{ marginBottom: 0 }}>建议：{it.fix}</Paragraph> : null}
                />
              </List.Item>
            )}
          />
        )}
      </>
    );
  }, [result, error]);

  return (
    <NetworkToolLayout
      title="CORS 策略检查器"
      icon={resolveNetworkIcon('ApiOutlined')}
      description="服务端代为发送 OPTIONS 预检请求，分析 Access-Control-Allow-* 响应头，判断是否允许指定 Origin 跨域，并给出修复建议。"
      showSubmit
      submitText="检查 CORS"
      loading={loading}
      onSubmit={handleSubmit}
      result={resultNode}
      resultText={resultText}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ url: 'https://api.github.com', origin: 'https://example.com' }}
        style={{ maxWidth: 720 }}
      >
        <Form.Item
          label="目标 URL"
          name="url"
          rules={[{ required: true, message: '请输入目标 URL（http/https）' }]}
        >
          <Input placeholder="https://api.example.com/v1/users" allowClear onPressEnter={handleSubmit} />
        </Form.Item>
        <Form.Item
          label="自定义 Origin（可选）"
          name="origin"
          extra="留空则只检查目标是否配置了 CORS；填入后验证该来源是否被允许跨域"
        >
          <Input placeholder="https://app.example.com" allowClear onPressEnter={handleSubmit} />
        </Form.Item>
      </Form>
    </NetworkToolLayout>
  );
}
