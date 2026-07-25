import { useMemo, useState } from 'react';
import {
  Alert,
  Card,
  Descriptions,
  Divider,
  Form,
  InputNumber,
  Input,
  Progress,
  Tag,
  Typography,
} from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { checkSecurityHeader, type SecurityHeaderCheckResponse } from '../../services/networkService';

const { Text } = Typography;

const GRADE_COLOR: Record<string, string> = {
  A: '#2faf6b',
  B: '#3aa675',
  C: '#2b7fff',
  D: '#e08a1e',
  E: '#e5641d',
  F: '#e5484d',
};

const SEVERITY_COLOR: Record<string, string> = {
  high: 'error',
  medium: 'warning',
  low: 'default',
};

export default function SecurityHeaderTool() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SecurityHeaderCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { url: string; timeoutMs?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await checkSecurityHeader({
        url: values.url.trim(),
        timeoutMs: values.timeoutMs,
      });
      setResult(data);
      if (!data.success) {
        setError(data.errorMessage ?? '安全头检查失败');
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
          message={isBlocked ? '请求被拦截' : '安全头检查提示'}
          description={result.errorMessage}
        />
      );
    }
    const gradeColor = GRADE_COLOR[result.grade] ?? '#888';
    const passed = result.items.filter((i) => i.present).length;
    return (
      <>
        <Card size="small" style={{ marginBottom: 16 }} title="综合安全评级">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: 34,
                fontWeight: 700,
                color: '#fff',
                background: gradeColor,
                flexShrink: 0,
              }}
            >
              {result.grade}
            </div>
            <div style={{ flex: 1 }}>
              <Progress
                percent={result.score}
                strokeColor={gradeColor}
                status={result.score >= 60 ? 'normal' : 'exception'}
              />
              <Text type="secondary">
                得分 {result.score} / 100 · 已配置 {passed}/{result.items.length} 项关键安全头
              </Text>
            </div>
          </div>
        </Card>

        <Divider>逐项检查结果</Divider>
        <Card size="small">
          <Descriptions column={1} size="small" bordered>
            {result.items.map((it) => (
              <Descriptions.Item
                key={it.name}
                label={
                  <span>
                    {it.present ? (
                      <Tag color="success">已配置</Tag>
                    ) : (
                      <Tag color={SEVERITY_COLOR[it.severity]}>缺失</Tag>
                    )}
                    <Text strong>{it.name}</Text>
                  </span>
                }
              >
                {it.present ? (
                  <Text style={{ wordBreak: 'break-all' }}>{it.value}</Text>
                ) : (
                  <Text type="secondary" style={{ wordBreak: 'break-all' }}>
                    建议：{it.recommendation}
                  </Text>
                )}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
      </>
    );
  }, [result, error]);

  return (
    <NetworkToolLayout
      title="安全头检查器"
      icon={resolveNetworkIcon('SafetyCertificateOutlined')}
      description="逐项检查 HSTS / CSP / X-Frame-Options 等关键安全响应头，缺失项给出推荐配置，并给出 A-F 综合安全等级。"
      showSubmit
      submitText="检查安全头"
      loading={loading}
      onSubmit={handleSubmit}
      result={resultNode}
      resultText={resultText}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ url: 'https://example.com', timeoutMs: 8000 }}
        style={{ maxWidth: 720 }}
      >
        <Form.Item
          label="目标 URL"
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
