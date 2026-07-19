/**
 * Curl 命令生成器 — 表单 ↔ curl/wget/httpie
 * Body 类型：无 / JSON / Form / Raw（对齐常见在线工具交互）
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Button, Checkbox, Input, Select, Segmented, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  defaultCurlState,
  generateCommand,
  normalizeCurlState,
  parseCurlCommand,
  type CurlBodyType,
  type CurlFormState,
  type CurlOutputFormat,
  type HttpMethod,
} from '../../utils/curlGenerator';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import '../generator-tools.css';

const { TextArea } = Input;
const PAGE_KEY = 'tools-network-curl-generator';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const BODY_OPTIONS: { value: CurlBodyType; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'json', label: 'JSON' },
  { value: 'form', label: 'Form' },
  { value: 'raw', label: 'Raw' },
];

const JSON_SAMPLE = '{\n  "name": "demo"\n}';

const DEFAULT_FORM = defaultCurlState({
  method: 'POST',
  url: 'https://api.example.com/v1/items',
  bodyType: 'json',
  body: JSON_SAMPLE,
  formFields: [
    { key: 'username', value: 'demo' },
    { key: 'password', value: 'secret' },
  ],
  rawContentType: 'text/plain',
  headers: [{ key: 'Accept', value: 'application/json' }],
});

const CurlGeneratorTool: React.FC = () => {
  const { state, setField, setState } = useTabPageStore(PAGE_KEY, {
    form: DEFAULT_FORM as CurlFormState,
    format: 'curl' as CurlOutputFormat,
    importText: '',
  });
  // Tab 浅合并会整块覆盖 form，旧缓存缺 bodyType/formFields 等 → 必须 normalize
  const form = useMemo(() => normalizeCurlState(state.form), [state.form]);
  const format = state.format;
  const importText = state.importText;
  const [error, setError] = useState<string | null>(null);

  const resultText = useMemo(() => generateCommand(form, format), [form, format]);

  const patchForm = useCallback(
    (patch: Partial<CurlFormState>) => {
      setState((prev) => ({
        ...prev,
        form: normalizeCurlState({ ...normalizeCurlState(prev.form), ...patch }),
      }));
      setError(null);
    },
    [setState],
  );

  const setBodyType = (bodyType: CurlBodyType) => {
    setState((prev) => {
      const base = normalizeCurlState(prev.form);
      const next = { ...base, bodyType };
      // 切换到 JSON 且 body 空时给示例
      if (bodyType === 'json' && !next.body.trim()) {
        next.body = JSON_SAMPLE;
      }
      if (bodyType === 'form' && next.formFields.length === 0) {
        next.formFields = [
          { key: 'username', value: 'demo' },
          { key: 'password', value: 'secret' },
        ];
      }
      // 有 body 时若仍是 GET/HEAD，改为 POST 以便生成 -d
      if (bodyType !== 'none' && (next.method === 'GET' || next.method === 'HEAD')) {
        next.method = 'POST';
      }
      return { ...prev, form: next };
    });
    setError(null);
  };

  const setHeader = (index: number, field: 'key' | 'value', value: string) => {
    setState((prev) => {
      const base = normalizeCurlState(prev.form);
      const headers = base.headers.map((h, i) =>
        i === index ? { ...h, [field]: value } : h,
      );
      return { ...prev, form: { ...base, headers } };
    });
  };

  const addHeader = () => {
    setState((prev) => {
      const base = normalizeCurlState(prev.form);
      return {
        ...prev,
        form: { ...base, headers: [...base.headers, { key: '', value: '' }] },
      };
    });
  };

  const removeHeader = (index: number) => {
    setState((prev) => {
      const base = normalizeCurlState(prev.form);
      return {
        ...prev,
        form: { ...base, headers: base.headers.filter((_, i) => i !== index) },
      };
    });
  };

  const setFormField = (index: number, field: 'key' | 'value', value: string) => {
    setState((prev) => {
      const base = normalizeCurlState(prev.form);
      const formFields = base.formFields.map((f, i) =>
        i === index ? { ...f, [field]: value } : f,
      );
      return { ...prev, form: { ...base, formFields } };
    });
  };

  const addFormField = () => {
    setState((prev) => {
      const base = normalizeCurlState(prev.form);
      return {
        ...prev,
        form: {
          ...base,
          formFields: [...base.formFields, { key: '', value: '' }],
        },
      };
    });
  };

  const removeFormField = (index: number) => {
    setState((prev) => {
      const base = normalizeCurlState(prev.form);
      return {
        ...prev,
        form: {
          ...base,
          formFields: base.formFields.filter((_, i) => i !== index),
        },
      };
    });
  };

  const doImport = () => {
    const r = parseCurlCommand(importText);
    if (!r.ok) {
      setError(r.error);
      message.error(r.error);
      return;
    }
    setState((prev) => ({
      ...prev,
      form: normalizeCurlState({ ...normalizeCurlState(prev.form), ...r.state }),
    }));
    setError(null);
    message.success('已导入 curl 命令');
  };

  const bodyType = form.bodyType;
  const showBodyEditor = bodyType !== 'none';

  return (
    <NetworkToolLayout
      title="Curl 命令生成器"
      icon={resolveNetworkIcon('ConsoleSqlOutlined')}
      description="表单生成 curl / wget / httpie；Body 支持无 / JSON / Form / Raw；可导入 curl 反向解析"
      showSubmit={false}
      resultText={resultText}
      error={error}
      result={
        <pre className="ntl-gen-pre" data-testid="curl-output">
          {resultText}
        </pre>
      }
    >
      <div className="ntl-form" data-testid="curl-generator-form">
        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">请求</span>
            <span className="ntl-form-section-desc">方法 · URL · 输出格式</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-row">
              <div className="ntl-form-field ntl-form-field--sm">
                <label>方法</label>
                <Select
                  value={form.method}
                  options={METHODS.map((m) => ({ value: m, label: m }))}
                  onChange={(v) => patchForm({ method: v })}
                  data-testid="curl-method"
                />
              </div>
              <div className="ntl-form-field ntl-form-field--grow">
                <label>URL</label>
                <Input
                  value={form.url}
                  onChange={(e) => patchForm({ url: e.target.value })}
                  placeholder="https://..."
                  data-testid="curl-url"
                />
              </div>
              <div className="ntl-form-field ntl-form-field--md">
                <label>输出格式</label>
                <Select
                  value={format}
                  options={[
                    { value: 'curl', label: 'curl' },
                    { value: 'wget', label: 'wget' },
                    { value: 'httpie', label: 'httpie' },
                  ]}
                  onChange={(v) => setField('format', v)}
                  data-testid="curl-format"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">Headers</span>
          </div>
          <div className="ntl-form-section-body ntl-form-section-body--tight">
            <div className="ntl-form-kv">
              <div className="ntl-form-kv-head">
                <span>Key</span>
                <span>Value</span>
                <span />
              </div>
              {form.headers.map((h, i) => (
                <div className="ntl-form-kv-row" key={i}>
                  <Input
                    placeholder="Key"
                    value={h.key}
                    onChange={(e) => setHeader(i, 'key', e.target.value)}
                    data-testid={`curl-header-key-${i}`}
                    variant="borderless"
                  />
                  <Input
                    placeholder="Value"
                    value={h.value}
                    onChange={(e) => setHeader(i, 'value', e.target.value)}
                    data-testid={`curl-header-value-${i}`}
                    variant="borderless"
                  />
                  <div className="ntl-form-kv-del">
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => removeHeader(i)}
                      aria-label="删除 Header"
                    />
                  </div>
                </div>
              ))}
              <div className="ntl-form-kv-foot">
                <span className="ntl-form-kv-count">{form.headers.length} 个 Header</span>
                <Button type="dashed" icon={<PlusOutlined />} onClick={addHeader} size="small">
                  添加 Header
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="ntl-form-section" data-testid="curl-body-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">Body</span>
            <span className="ntl-form-section-desc">无 · JSON · Form · Raw</span>
          </div>
          <div className="ntl-form-section-body">
            <Segmented
              value={bodyType}
              options={BODY_OPTIONS}
              onChange={(v) => setBodyType(v as CurlBodyType)}
              data-testid="curl-body-type"
              block
            />

            {bodyType === 'none' && (
              <p className="ntl-form-hint-box" data-testid="curl-body-none-hint">
                无请求体。GET/HEAD 通常无需 Body；需要提交数据请选择 JSON / Form / Raw。
              </p>
            )}

            {bodyType === 'json' && (
              <TextArea
                rows={5}
                value={form.body}
                onChange={(e) => patchForm({ body: e.target.value })}
                data-testid="curl-body"
                placeholder='{"key":"value"}'
              />
            )}

            {bodyType === 'form' && (
              <div data-testid="curl-form-fields">
                <p className="ntl-form-hint" style={{ marginBottom: 8 }}>
                  application/x-www-form-urlencoded · 生成多个 <code>-d key=value</code>
                </p>
                <div className="ntl-form-kv">
                  <div className="ntl-form-kv-head">
                    <span>Name</span>
                    <span>Value</span>
                    <span />
                  </div>
                  {form.formFields.map((f, i) => (
                    <div className="ntl-form-kv-row" key={i}>
                      <Input
                        placeholder="name"
                        value={f.key}
                        onChange={(e) => setFormField(i, 'key', e.target.value)}
                        data-testid={`curl-form-key-${i}`}
                        variant="borderless"
                      />
                      <Input
                        placeholder="value"
                        value={f.value}
                        onChange={(e) => setFormField(i, 'value', e.target.value)}
                        data-testid={`curl-form-value-${i}`}
                        variant="borderless"
                      />
                      <div className="ntl-form-kv-del">
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => removeFormField(i)}
                          aria-label="删除字段"
                        />
                      </div>
                    </div>
                  ))}
                  <div className="ntl-form-kv-foot">
                    <span className="ntl-form-kv-count">{form.formFields.length} 个字段</span>
                    <Button type="dashed" icon={<PlusOutlined />} onClick={addFormField} size="small">
                      添加字段
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {bodyType === 'raw' && (
              <>
                <div className="ntl-form-field">
                  <label>Content-Type（已手动配置 Header 则跳过）</label>
                  <Input
                    value={form.rawContentType}
                    onChange={(e) => patchForm({ rawContentType: e.target.value })}
                    placeholder="text/plain / application/xml ..."
                    data-testid="curl-raw-content-type"
                    list="curl-raw-ct-suggestions"
                  />
                  <datalist id="curl-raw-ct-suggestions">
                    <option value="text/plain" />
                    <option value="application/xml" />
                    <option value="text/xml" />
                    <option value="text/html" />
                    <option value="application/javascript" />
                    <option value="application/octet-stream" />
                  </datalist>
                </div>
                <TextArea
                  rows={5}
                  value={form.body}
                  onChange={(e) => patchForm({ body: e.target.value })}
                  data-testid="curl-body-raw"
                  placeholder="原始请求体文本"
                />
              </>
            )}

            {showBodyEditor && (form.method === 'GET' || form.method === 'HEAD') && (
              <p className="ntl-form-hint">当前方法为 {form.method}，生成命令时不会附带 Body。</p>
            )}
          </div>
        </section>

        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">选项与导入</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-checks">
              <Checkbox
                checked={form.followRedirects}
                onChange={(e) => patchForm({ followRedirects: e.target.checked })}
              >
                -L 跟随重定向
              </Checkbox>
              <Checkbox
                checked={form.insecure}
                onChange={(e) => patchForm({ insecure: e.target.checked })}
              >
                -k 忽略证书
              </Checkbox>
              <Checkbox
                checked={form.includeHeaders}
                onChange={(e) => patchForm({ includeHeaders: e.target.checked })}
              >
                -i 包含响应头
              </Checkbox>
              <Checkbox
                checked={form.compressed}
                onChange={(e) => patchForm({ compressed: e.target.checked })}
              >
                --compressed
              </Checkbox>
            </div>
            <div className="ntl-form-import">
              <TextArea
                rows={2}
                value={importText}
                onChange={(e) => setField('importText', e.target.value)}
                placeholder="粘贴 curl 命令反向解析..."
                data-testid="curl-import"
              />
              <div className="ntl-form-import-actions">
                <Button onClick={doImport} data-testid="curl-import-btn">
                  解析填充
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </NetworkToolLayout>
  );
};

export default CurlGeneratorTool;
