/**
 * URL 解析器 — 拆解字段 + 编辑 query 实时重组
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Input, message } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import HoverCopy from '../../components/HoverCopy';
import {
  formatUrlPartsText,
  parseUrl,
  reassembleFromParts,
  type QueryParam,
  type UrlParts,
} from '../../utils/urlParser';
import { resolveNetworkIcon } from '../../utils/iconMap';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './url-parser.css';

const SAMPLE = 'https://example.com:8080/api?q=hello&lang=zh#section';

function copyText(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => message.success('已复制'),
    () => message.error('复制失败'),
  );
}

const UrlParserTool: React.FC = () => {
  const [input, setInput] = useState(SAMPLE);
  const [parts, setParts] = useState<UrlParts | null>(() => {
    const r = parseUrl(SAMPLE);
    return r.ok ? r.parts : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const assembled = useMemo(() => {
    if (!parts?.hostname) return '';
    try {
      return reassembleFromParts(parts);
    } catch {
      return '';
    }
  }, [parts]);

  const run = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      const r = parseUrl(input);
      if (!r.ok) {
        setError(r.error);
        setParts(null);
      } else {
        setError(null);
        setParts(r.parts);
      }
      setLoading(false);
    }, 40);
  }, [input]);

  const patch = useCallback((patchObj: Partial<UrlParts>) => {
    setParts((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patchObj };
      // 同步 host 展示字段
      if ('hostname' in patchObj || 'port' in patchObj) {
        const port = next.port?.trim();
        next.host = port ? `${next.hostname}:${port}` : next.hostname;
      }
      try {
        next.search = (() => {
          const s = reassembleFromParts({ ...next });
          const u = new URL(s);
          next.href = u.href;
          next.origin = u.origin;
          return u.search;
        })();
      } catch {
        /* keep */
      }
      return next;
    });
    setError(null);
  }, []);

  const setParam = (index: number, field: keyof QueryParam, value: string) => {
    setParts((prev) => {
      if (!prev) return prev;
      const params = prev.params.map((p, i) =>
        i === index ? { ...p, [field]: value } : p,
      );
      const next = { ...prev, params };
      try {
        const href = reassembleFromParts(next);
        const u = new URL(href);
        next.href = u.href;
        next.search = u.search;
        next.origin = u.origin;
        next.host = u.host;
      } catch {
        /* keep editing */
      }
      return next;
    });
  };

  const addParam = () => {
    setParts((prev) => {
      if (!prev) return prev;
      return { ...prev, params: [...prev.params, { key: '', value: '' }] };
    });
  };

  const removeParam = (index: number) => {
    setParts((prev) => {
      if (!prev) return prev;
      const params = prev.params.filter((_, i) => i !== index);
      const next = { ...prev, params };
      try {
        const href = reassembleFromParts(next);
        const u = new URL(href);
        next.href = u.href;
        next.search = u.search;
        next.origin = u.origin;
      } catch {
        /* */
      }
      return next;
    });
  };

  const resultText = parts
    ? `${formatUrlPartsText(parts)}${assembled ? `\n\n重组: ${assembled}` : ''}`
    : '';

  return (
    <NetworkToolLayout
      title="URL 解析器"
      icon={resolveNetworkIcon('LinkOutlined')}
      description="拆解 protocol / host / path / query · 编辑参数实时重组"
      submitText="解析"
      loading={loading}
      onSubmit={run}
      resultText={resultText}
      error={error}
      inputLabel="URL"
      inputMeta="支持无协议（自动补 https）"
      result={
        !parts ? (
          <div className="ntl-result-empty" data-testid="url-empty">
            解析后显示 URL 各部分
          </div>
        ) : (
          <div className="ntl-up" data-testid="url-result">
            <div className="ntl-up-assembled" data-testid="url-assembled">
              <span className="ntl-up-assembled-label">重组 URL（可编辑参数后实时更新）</span>
              <div className="ntl-up-assembled-row">
                <code className="ntl-up-assembled-url" data-testid="url-assembled-text">
                  {assembled || parts.href}
                </code>
                <button
                  type="button"
                  className="ntl-up-copy"
                  title="复制重组 URL"
                  onClick={() => copyText(assembled || parts.href)}
                >
                  <CopyOutlined />
                </button>
              </div>
            </div>

            <div className="ntl-up-fields" data-testid="url-fields">
              {(
                [
                  ['protocol', 'Protocol', parts.protocol],
                  ['hostname', 'Hostname', parts.hostname],
                  ['port', 'Port', parts.port],
                  ['pathname', 'Path', parts.pathname],
                  ['hash', 'Hash', parts.hash],
                  ['origin', 'Origin', parts.origin],
                ] as const
              ).map(([key, label, value]) => (
                <div
                  key={key}
                  className={`ntl-up-field${key === 'origin' || key === 'pathname' ? ' ntl-up-field--wide' : ''}`}
                >
                  <div className="ntl-up-field-head">
                    <label htmlFor={`url-field-${key}`}>{label}</label>
                    <HoverCopy value={value} label={label} iconOnly />
                  </div>
                  <input
                    id={`url-field-${key}`}
                    data-testid={`url-field-${key}`}
                    value={value}
                    readOnly={key === 'origin'}
                    onChange={(e) => {
                      if (key === 'origin') return;
                      patch({ [key]: e.target.value } as Partial<UrlParts>);
                    }}
                    spellCheck={false}
                  />
                </div>
              ))}
            </div>

            <div className="ntl-up-section-title">
              <span>Query 参数</span>
              <button type="button" className="ntl-up-add" onClick={addParam} data-testid="url-param-add">
                <PlusOutlined /> 新增
              </button>
            </div>

            <div className="ntl-up-params" data-testid="url-params">
              {parts.params.length === 0 ? (
                <div className="ntl-up-empty-params">暂无 query 参数，点击「新增」添加</div>
              ) : (
                <table className="ntl-up-params-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Value</th>
                      <th className="ntl-up-params-actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.params.map((p, i) => (
                      <tr key={i} data-testid={`url-param-row-${i}`}>
                        <td>
                          <input
                            value={p.key}
                            onChange={(e) => setParam(i, 'key', e.target.value)}
                            placeholder="key"
                            data-testid={`url-param-key-${i}`}
                            spellCheck={false}
                          />
                        </td>
                        <td>
                          <input
                            value={p.value}
                            onChange={(e) => setParam(i, 'value', e.target.value)}
                            placeholder="value"
                            data-testid={`url-param-value-${i}`}
                            spellCheck={false}
                          />
                        </td>
                        <td className="ntl-up-params-actions">
                          <button
                            type="button"
                            className="ntl-up-icon-btn ntl-up-icon-btn--danger"
                            title="删除"
                            aria-label={`删除参数 ${p.key || i}`}
                            onClick={() => removeParam(i)}
                            data-testid={`url-param-del-${i}`}
                          >
                            <DeleteOutlined />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      }
    >
      <div data-testid="network-tool-input-slot">
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder={SAMPLE}
          data-testid="url-input"
          spellCheck={false}
          style={{ fontFamily: 'var(--miao-font-mono, ui-monospace, Menlo, monospace)' }}
        />
      </div>
    </NetworkToolLayout>
  );
};

export default UrlParserTool;
