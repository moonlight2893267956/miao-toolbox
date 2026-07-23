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
import { SafetyCertificateOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { sslAnalyze, type SslAnalyzerResult, type SslCertificateInfo } from '../../services/networkService';

const { Text } = Typography;

type Role = '叶子证书' | '中间证书' | '根证书' | '单证书';

function roleOf(index: number, total: number): Role {
  if (total === 1) return '单证书';
  if (index === 0) return '叶子证书';
  if (index === total - 1) return '根证书';
  return '中间证书';
}

function remainingTag(cert: SslCertificateInfo) {
  if (cert.expired) return <Tag color="error">已过期（{cert.daysRemaining} 天）</Tag>;
  if (cert.daysRemaining < 30) return <Tag color="warning">剩余 {cert.daysRemaining} 天</Tag>;
  return <Tag color="success">剩余 {cert.daysRemaining} 天</Tag>;
}

function CertCard({ cert, total }: { cert: SslCertificateInfo; total: number }) {
  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title={
        <span>
          <SafetyCertificateOutlined style={{ marginRight: 8 }} />
          {roleOf(cert.index, total)}（#{cert.index}）
          {remainingTag(cert)}
        </span>
      }
    >
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="主题">{cert.subject || '-'}</Descriptions.Item>
        <Descriptions.Item label="颁发者">{cert.issuer || '-'}</Descriptions.Item>
        <Descriptions.Item label="有效期">
          {cert.notBefore} ~ {cert.notAfter}
        </Descriptions.Item>
        <Descriptions.Item label="签名算法">{cert.signatureAlgorithm || '-'}</Descriptions.Item>
        <Descriptions.Item label="公钥">
          {cert.publicKeyAlgorithm || '-'}
          {cert.publicKeySize > 0 ? ` ${cert.publicKeySize} bit` : ''}
        </Descriptions.Item>
        <Descriptions.Item label="序列号">{cert.serialNumber || '-'}</Descriptions.Item>
        {(cert.san ?? []).length > 0 && (
          <Descriptions.Item label="SAN">
            {(cert.san ?? []).map((s) => (
              <Tag key={s} style={{ marginBottom: 4 }}>
                {s}
              </Tag>
            ))}
          </Descriptions.Item>
        )}
      </Descriptions>
      <Divider style={{ margin: '12px 0' }} plain>
        详细字段
      </Divider>
      <Descriptions column={1} size="small">
        {(cert.fields ?? []).map((f) => (
          <Descriptions.Item key={f.key} label={f.key}>
            <Text style={{ wordBreak: 'break-all' }}>{f.value || '-'}</Text>
          </Descriptions.Item>
        ))}
      </Descriptions>
    </Card>
  );
}

export default function SslAnalyzerTool() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SslAnalyzerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { host: string; port?: number; timeoutMs?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await sslAnalyze({
        host: values.host.trim(),
        port: values.port,
        timeoutMs: values.timeoutMs,
      });
      if (data.success) {
        setResult(data);
        setError(null);
      } else {
        setResult(null);
        setError(data.errorMessage ?? 'SSL 分析失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败');
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
    if (!result || !result.success) return null;
    // 友好降级：success=true + errorMessage（DNS 失败 / SSRF 拦截 / 超时 / 连接失败 / 握手失败）
    if (result.errorMessage) {
      const isBlocked = result.errorMessage.includes('不允许访问');
      return (
        <Alert
          type={isBlocked ? 'error' : 'warning'}
          showIcon
          message={isBlocked ? '请求被拦截' : 'SSL 分析提示'}
          description={result.errorMessage}
        />
      );
    }
    return (
      <>
        <Card size="small" style={{ marginBottom: 16 }} title="握手摘要">
          <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
            <Descriptions.Item label="主机">{result.host}</Descriptions.Item>
            <Descriptions.Item label="端口">{result.port}</Descriptions.Item>
            <Descriptions.Item label="解析 IP">{result.resolvedIp}</Descriptions.Item>
            <Descriptions.Item label="协议">{result.protocol || '-'}</Descriptions.Item>
            <Descriptions.Item label="加密套件">{result.cipherSuite || '-'}</Descriptions.Item>
            <Descriptions.Item label="握手耗时">{result.handshakeTimeMs} ms</Descriptions.Item>
            <Descriptions.Item label="信任状态">
              {result.peerVerified ? (
                <Tag color="success">受系统 CA 信任</Tag>
              ) : (
                <Tag color="error">不受信任</Tag>
              )}
            </Descriptions.Item>
          </Descriptions>
          {!result.peerVerified && result.certificateError && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              message="证书未通过系统 CA 信任校验"
              description={result.certificateError}
            />
          )}
        </Card>

        <Divider>证书链（{(result.chain ?? []).length}）</Divider>
        {(result.chain ?? []).length === 0 ? (
          <Empty description="未返回证书" />
        ) : (
          (result.chain ?? []).map((cert) => (
            <CertCard key={cert.index} cert={cert} total={(result.chain ?? []).length} />
          ))
        )}
      </>
    );
  }, [result, error]);

  return (
    <NetworkToolLayout
      title="SSL/TLS 证书分析器"
      icon={resolveNetworkIcon('SafetyCertificateOutlined')}
      description="分析目标域名的 SSL/TLS 证书链：信任状态、有效期、SAN、密钥算法与长度等。所有连接由服务端发起。"
      showSubmit
      submitText="分析证书"
      loading={loading}
      onSubmit={handleSubmit}
      result={resultNode}
      resultText={resultText}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ host: 'example.com', port: 443, timeoutMs: 15000 }}
        style={{ maxWidth: 720 }}
      >
        <Form.Item
          label="主机"
          name="host"
          rules={[{ required: true, message: '请输入主机（域名或 IP）' }]}
        >
          <Input placeholder="example.com 或 8.8.8.8" allowClear onPressEnter={handleSubmit} />
        </Form.Item>
        <Form.Item label="端口" name="port">
          <InputNumber min={1} max={65535} style={{ width: 160 }} />
        </Form.Item>
        <Form.Item label="超时（毫秒）" name="timeoutMs">
          <InputNumber min={1000} max={55000} step={1000} style={{ width: 160 }} />
        </Form.Item>
      </Form>
    </NetworkToolLayout>
  );
}
