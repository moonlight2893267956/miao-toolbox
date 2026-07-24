import { useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  InputNumber,
  Radio,
  Select,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  App,
} from 'antd';
import {
  ClearOutlined,
  CompressOutlined,
  CopyOutlined,
  DeleteOutlined,
  FormatPainterOutlined,
  LinkOutlined,
  SendOutlined,
} from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import JsonRawEditor from '../../../json-workbench/components/JsonRawEditor';
import CodeMirrorReadOnly from './CodeMirrorReadOnly';
import PlainTextEditor from './PlainTextEditor';
import KeyValueEditor, { type KeyValueRow } from './KeyValueEditor';
import {
  httpRequestBuilder,
  type HttpRequestBuilderResult,
  type HttpRequestHeaderItem,
} from '../../services/networkService';
import './http-request-builder.css';

const { Text } = Typography;

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const METHOD_COLOR: Record<HttpMethod, string> = {
  GET: '#16a34a',
  POST: '#2563eb',
  PUT: '#f59e0b',
  PATCH: '#8b5cf6',
  DELETE: '#ef4444',
  HEAD: '#14b8a6',
  OPTIONS: '#64748b',
  TRACE: '#64748b',
};

const BODY_TYPES = [
  { value: 'json', label: 'JSON' },
  { value: 'form', label: 'Form' },
  { value: 'raw', label: 'Raw' },
] as const;

const COMMON_HEADERS = [
  { label: 'Content-Type: JSON', key: 'Content-Type', value: 'application/json' },
  { label: 'Accept: JSON', key: 'Accept', value: 'application/json' },
  { label: 'Authorization', key: 'Authorization', value: 'Bearer ' },
  { label: 'User-Agent', key: 'User-Agent', value: 'miao-toolbox/1.0' },
];

let rowSeq = 0;
const newRow = (): KeyValueRow => ({ id: `h_${rowSeq++}`, key: '', value: '', enabled: true });

function statusColor(code: number): string {
  if (code >= 200 && code < 300) return 'success';
  if (code >= 300 && code < 400) return 'blue';
  if (code >= 400 && code < 500) return 'warning';
  if (code >= 500) return 'error';
  return 'default';
}

function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function prettyJson(text: string | null): string {
  if (text == null) return '';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function serializeFormBody(fields: KeyValueRow[]): string {
  return fields
    .filter((f) => f.enabled !== false && f.key.trim())
    .map((f) => `${encodeURIComponent(f.key.trim())}=${encodeURIComponent(f.value)}`)
    .join('&');
}

export default function HttpRequestBuilderTool() {
  const { message } = App.useApp();

  const [method, setMethod] = useState<HttpMethod>('POST');
  const [url, setUrl] = useState('https://example.com/api/resource');
  const [headers, setHeaders] = useState<KeyValueRow[]>([newRow()]);
  const [bodyType, setBodyType] = useState<'json' | 'form' | 'raw'>('json');
  const [jsonBody, setJsonBody] = useState('{}');
  const [formFields, setFormFields] = useState<KeyValueRow[]>([newRow()]);
  const [rawBody, setRawBody] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(15000);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HttpRequestBuilderResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string>('请求未完成');

  const [reqTab, setReqTab] = useState('body');
  const [respTab, setRespTab] = useState('body');
  const [viewMode, setViewMode] = useState<'pretty' | 'raw'>('pretty');

  const headerCount = headers.filter((h) => h.key.trim() && h.enabled !== false).length;
  const bodyDisabled = method === 'GET' || method === 'HEAD';

  const activeBodyLength = (() => {
    if (bodyDisabled) return 0;
    if (bodyType === 'json') return jsonBody.length;
    if (bodyType === 'form') return serializeFormBody(formFields).length;
    return rawBody.length;
  })();

  const buildBodyPayload = (): { bodyType?: string; body: string } => {
    if (bodyDisabled) return { body: '' };
    if (bodyType === 'json') return { bodyType: 'json', body: jsonBody };
    if (bodyType === 'form') return { bodyType: 'form', body: serializeFormBody(formFields) };
    return { bodyType: 'raw', body: rawBody };
  };

  const handleSend = async () => {
    const target = url.trim();
    if (!target) {
      message.warning('请先填写请求 URL');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setErrorTitle('请求未完成');
    try {
      const cleanedHeaders: HttpRequestHeaderItem[] = headers
        .filter((h) => h.key.trim() && h.enabled !== false)
        .map((h) => ({ name: h.key.trim(), value: h.value }));
      const payload = buildBodyPayload();
      const data = await httpRequestBuilder({
        url: target,
        method,
        headers: cleanedHeaders,
        bodyType: payload.bodyType,
        body: payload.body,
        timeoutMs,
      });
      if (!data.success) {
        setResult(null);
        setErrorTitle('请求被拦截');
        setErrorMessage(data.errorMessage ?? '请求未能完成');
      } else {
        setResult(data);
      }
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { message?: string } }; message?: string };
      const status = err.response?.status;
      const backendMsg = err.response?.data?.message;
      if (status === 404) {
        setErrorTitle('请求未完成');
        setErrorMessage(
          '目标接口不存在（HTTP 404）。后端可能尚未部署此功能或路径错误。请确认已 push 最新代码并等待部署完成。',
        );
      } else if (status === 401 || status === 403) {
        setErrorTitle('请求被拒绝');
        setErrorMessage(`请求被拒绝（HTTP ${status}）：权限不足或未认证。`);
      } else if (backendMsg) {
        setErrorTitle('请求未完成');
        setErrorMessage(backendMsg);
      } else {
        setErrorTitle('请求未完成');
        setErrorMessage(
          `无法连接到目标服务（${err.message ?? '网络错误'}）。请确认 miao-toolbox-api 已启动，且当前网络允许访问该地址。`,
        );
      }
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFormat = () => {
    try {
      setJsonBody(JSON.stringify(JSON.parse(jsonBody), null, 2));
      message.success('已格式化');
    } catch {
      message.error('JSON 格式无效，无法格式化');
    }
  };
  const handleMinify = () => {
    try {
      setJsonBody(JSON.stringify(JSON.parse(jsonBody)));
      message.success('已压缩');
    } catch {
      message.error('JSON 格式无效，无法压缩');
    }
  };
  const handleCopyResponse = async () => {
    if (!result?.body) return;
    try {
      await navigator.clipboard.writeText(displayBody);
      message.success('已复制响应体');
    } catch {
      message.error('复制失败');
    }
  };
  const handleClearBody = () => {
    if (bodyType === 'json') setJsonBody('{}');
    else if (bodyType === 'form') setFormFields([newRow()]);
    else setRawBody('');
  };
  const getActiveBodyText = (): string => {
    if (bodyType === 'json') return jsonBody;
    if (bodyType === 'form') return serializeFormBody(formFields);
    return rawBody;
  };
  const copyBodyText = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制请求体');
    } catch {
      message.error('复制失败');
    }
  };

  const displayBody = result?.body
    ? viewMode === 'pretty'
      ? prettyJson(result.body)
      : result.body
    : '';

  const resultText = displayBody;

  const resultNode = (() => {
    if (errorMessage) {
      const blocked = errorTitle === '请求被拦截';
      return (
        <Alert
          type={blocked ? 'error' : 'warning'}
          showIcon
          message={errorTitle}
          description={errorMessage}
        />
      );
    }
    if (loading && !result) {
      return (
        <div className="hrb-spin-wrap">
          <Spin tip="请求发送中…" />
        </div>
      );
    }
    if (!result) {
      return <Empty description="发送请求后，响应结果将显示在这里" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    const bodyLang = result.body && /^\s*[[{]/.test(result.body) ? 'json' : 'text';

    return (
      <>
        <div className="hrb-status-card">
          <div className="hrb-status-card-main">
            <Tag color={statusColor(result.statusCode)} className="hrb-status-code">
              {result.statusCode}
            </Tag>
            <span className="hrb-status-text">{result.statusText}</span>
          </div>
          <div className="hrb-status-card-meta">
            <span className="hrb-meta-pill">
              <Text type="secondary">耗时</Text>
              <strong>{result.elapsedMs} ms</strong>
            </span>
            <span className="hrb-meta-pill">
              <Text type="secondary">大小</Text>
              <strong>{formatBytes(result.bodyBytes)}</strong>
              {result.truncated && <Tag color="gold">已截断</Tag>}
            </span>
          </div>
          {result.finalUrl && (
            <div className="hrb-status-card-url" title={result.finalUrl}>
              <LinkOutlined />
              <span>{result.finalUrl}</span>
            </div>
          )}
        </div>

        <Tabs
          activeKey={respTab}
          onChange={setRespTab}
          items={[
            {
              key: 'body',
              label: (
                <span>
                  响应体
                  <Tag className="hrb-tab-badge">{bodyLang === 'json' ? 'JSON' : 'TEXT'}</Tag>
                </span>
              ),
              children: (
                <div className="hrb-editor-shell">
                  <div className="hrb-editor-shell-head">
                    <div className="hrb-editor-shell-left">
                      <Radio.Group
                        className="hrb-body-mode"
                        value={viewMode}
                        onChange={(e) => setViewMode(e.target.value as 'pretty' | 'raw')}
                        optionType="button"
                        buttonStyle="solid"
                        options={[
                          { value: 'pretty', label: 'Pretty' },
                          { value: 'raw', label: 'Raw' },
                        ]}
                      />
                    </div>
                    <div className="hrb-editor-shell-right">
                      <Tooltip title="复制响应体">
                        <Button
                          size="small"
                          type="text"
                          icon={<CopyOutlined />}
                          onClick={handleCopyResponse}
                          disabled={!result.body}
                        />
                      </Tooltip>
                    </div>
                  </div>
                  <div className="hrb-editor-shell-body hrb-editor-shell-body--fixed">
                    {result.body ? (
                      <CodeMirrorReadOnly value={displayBody} language={bodyLang} height="100%" />
                    ) : (
                      <div className="hrb-empty-body">（无响应体）</div>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'headers',
              label: (
                <span>
                  响应头
                  <Tag className="hrb-tab-badge">{result.headers.length}</Tag>
                </span>
              ),
              children: (
                <div className="hrb-resp-headers">
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="key"
                    dataSource={result.headers.map((h, i) => ({ key: i, name: h.name, value: h.value }))}
                    columns={[
                      {
                        title: '名称',
                        dataIndex: 'name',
                        width: '38%',
                        render: (v: string) => <Text className="hrb-mono">{v}</Text>,
                      },
                      {
                        title: '值',
                        dataIndex: 'value',
                        render: (v: string) => <Text className="hrb-break">{v || '-'}</Text>,
                      },
                    ]}
                  />
                </div>
              ),
            },
          ]}
        />
      </>
    );
  })();

  const bodyEditor = (() => {
    if (bodyDisabled) {
      return (
        <div className="hrb-body-empty">
          <div className="hrb-body-empty-icon">
            <DeleteOutlined />
          </div>
          <Text type="secondary" className="hrb-body-empty-title">
            {method} 请求不包含请求体
          </Text>
          <Text type="secondary" className="hrb-body-empty-desc">
            切换到 POST / PUT / PATCH / DELETE 等方法后可编辑请求体。
          </Text>
        </div>
      );
    }

    const activeText = getActiveBodyText();

    return (
      <div className="hrb-editor-shell" data-body-type={bodyType}>
        <div className="hrb-editor-shell-head">
          <div className="hrb-editor-shell-left">
            <Radio.Group
              className="hrb-body-mode"
              value={bodyType}
              onChange={(e) => setBodyType(e.target.value as 'json' | 'form' | 'raw')}
              optionType="button"
              buttonStyle="solid"
              options={BODY_TYPES as unknown as { label: string; value: string }[]}
            />
          </div>
          <div className="hrb-editor-shell-right">
            <span className="hrb-char-count">{activeBodyLength} 字符</span>
            {bodyType === 'json' && (
              <>
                <Tooltip title="格式化（2 空格缩进）">
                  <Button
                    size="small"
                    type="text"
                    icon={<FormatPainterOutlined />}
                    onClick={handleFormat}
                    disabled={!jsonBody}
                  />
                </Tooltip>
                <Tooltip title="压缩为单行">
                  <Button
                    size="small"
                    type="text"
                    icon={<CompressOutlined />}
                    onClick={handleMinify}
                    disabled={!jsonBody}
                  />
                </Tooltip>
              </>
            )}
            <span className="hrb-divider" />
            <Tooltip title="复制请求体">
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined />}
                onClick={() => copyBodyText(activeText)}
                disabled={!activeText}
              />
            </Tooltip>
            <Tooltip title="清空请求体">
              <Button
                size="small"
                type="text"
                icon={<ClearOutlined />}
                onClick={handleClearBody}
                disabled={!activeText}
              />
            </Tooltip>
          </div>
        </div>

        {bodyType === 'json' && (
          <div className="hrb-editor-shell-body hrb-editor-shell-body--json">
            <JsonRawEditor
              value={jsonBody}
              onChange={setJsonBody}
              parseError={null}
              scrollTarget={null}
              onScrollTargetHandled={() => {}}
            />
          </div>
        )}

        {bodyType === 'form' && (
          <div className="hrb-editor-shell-body hrb-editor-shell-body--form">
            <KeyValueEditor
              rows={formFields}
              onChange={setFormFields}
              keyPlaceholder="Field"
              valuePlaceholder="Value"
              showEnabled
              emptyHint="添加表单字段，禁用的字段不会发送"
            />
            <div className="hrb-form-encoded">
              <div className="hrb-form-encoded-label">
                <span>URL 编码预览</span>
                <Button
                  size="small"
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={() => copyBodyText(serializeFormBody(formFields))}
                  disabled={!serializeFormBody(formFields)}
                >
                  复制
                </Button>
              </div>
              <code className="hrb-form-encoded-code">{serializeFormBody(formFields) || '（空）'}</code>
            </div>
          </div>
        )}

        {bodyType === 'raw' && (
          <div className="hrb-editor-shell-body hrb-editor-shell-body--raw">
            <PlainTextEditor
              value={rawBody}
              onChange={setRawBody}
              placeholder="在此输入原始请求体内容（不自动设置 Content-Type）"
            />
          </div>
        )}
      </div>
    );
  })();

  return (
    <NetworkToolLayout
      title="HTTP 请求构建器"
      icon={resolveNetworkIcon('SendOutlined')}
      description="在服务端构造并发送任意 HTTP 请求，支持自定义方法、请求头、请求体与超时设置。常用于调试接口、联调第三方服务（请求由后端代理发出，避免浏览器跨域）。"
      showSubmit={false}
      result={resultNode}
      resultText={resultText}
    >
      <div className="hrb-request-bar" data-method={method}>
        <Select
          className="hrb-method-select"
          value={method}
          onChange={(v) => setMethod(v as HttpMethod)}
          popupMatchSelectWidth={false}
          options={HTTP_METHODS.map((m) => ({
            value: m,
            label: <span style={{ color: METHOD_COLOR[m], fontWeight: 600 }}>{m}</span>,
          }))}
        />
        <Input
          className="hrb-url-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPressEnter={handleSend}
          placeholder="https://api.example.com/path"
          spellCheck={false}
        />
        <Button
          className="hrb-url-send"
          type="primary"
          icon={<SendOutlined />}
          loading={loading}
          onClick={handleSend}
        >
          发送
        </Button>
      </div>

      <Tabs
        activeKey={reqTab}
        onChange={setReqTab}
        items={[
          {
            key: 'headers',
            label: (
              <span>
                请求头
                {headerCount > 0 && <Tag className="hrb-tab-badge">{headerCount}</Tag>}
              </span>
            ),
            children: (
              <div className="hrb-headers">
                <KeyValueEditor
                  rows={headers}
                  onChange={setHeaders}
                  keyPlaceholder="Header"
                  valuePlaceholder="Value"
                  chips={COMMON_HEADERS}
                  emptyHint="无自定义请求头"
                />
              </div>
            ),
          },
          {
            key: 'body',
            label: (
              <span>
                请求体
                {activeBodyLength > 0 && <Tag className="hrb-tab-badge">{activeBodyLength}</Tag>}
              </span>
            ),
            disabled: bodyDisabled,
            children: bodyEditor,
          },
          {
            key: 'settings',
            label: '设置',
            children: (
              <div className="hrb-settings">
                <div className="hrb-setting-item">
                  <div className="hrb-setting-label">
                    <Text strong>超时时间</Text>
                    <Text type="secondary">请求最长等待时间（1000–60000 ms）</Text>
                  </div>
                  <InputNumber
                    min={1000}
                    max={60000}
                    step={1000}
                    value={timeoutMs}
                    onChange={(v) => setTimeoutMs(v ?? 15000)}
                    addonAfter="ms"
                    style={{ width: 180 }}
                  />
                </div>
              </div>
            ),
          },
        ]}
      />
    </NetworkToolLayout>
  );
}
