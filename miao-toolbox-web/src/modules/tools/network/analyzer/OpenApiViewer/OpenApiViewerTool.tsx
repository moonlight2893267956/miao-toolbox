/**
 * OpenAPI / Swagger 查看器
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Input } from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import {
  SAMPLE_OAS3,
  SAMPLE_SWAGGER2,
  formatOpenApiSummary,
  parseOpenApiDocument,
  type OpenApiDocumentView,
  type OpenApiEndpoint,
} from '../../utils/openapiViewer';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './openapi-viewer.css';

const { TextArea } = Input;
const PAGE_KEY = 'tools-network-openapi-viewer';

function initialOpenApi() {
  const r = parseOpenApiDocument(SAMPLE_OAS3);
  if (!r.ok) {
    return { doc: null as OpenApiDocumentView | null, activeId: null as string | null };
  }
  return {
    doc: r.doc as OpenApiDocumentView,
    activeId: (r.doc.groups[0]?.endpoints[0]?.id ?? null) as string | null,
  };
}

function MethodBadge({ method }: { method: string }) {
  const m = method.toLowerCase();
  return (
    <span className={`ntl-oa-method ntl-oa-method--${m}`}>{method.toUpperCase()}</span>
  );
}

function EndpointDetail({ ep }: { ep: OpenApiEndpoint }) {
  return (
    <div className="ntl-oa-detail-body" data-testid="openapi-detail">
      <div className="ntl-oa-detail-path">
        <MethodBadge method={ep.method} />
        <code data-testid="openapi-detail-path">{ep.path}</code>
        {ep.deprecated && <span className="ntl-oa-deprecated">deprecated</span>}
      </div>
      {ep.summary && (
        <p className="ntl-oa-desc" style={{ margin: 0 }} data-testid="openapi-detail-summary">
          {ep.summary}
        </p>
      )}
      {ep.description && <p className="ntl-oa-desc">{ep.description}</p>}
      {ep.operationId && (
        <div className="ntl-oa-muted">
          operationId: <span className="ntl-oa-mono">{ep.operationId}</span>
        </div>
      )}

      <section className="ntl-oa-section" data-testid="openapi-params">
        <h4>参数 Parameters</h4>
        {ep.parameters.length === 0 ? (
          <div className="ntl-oa-muted">无参数</div>
        ) : (
          <div className="ntl-oa-table-wrap">
            <table className="ntl-oa-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>In</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {ep.parameters.map((p) => (
                  <tr key={`${p.in}-${p.name}`}>
                    <td className="ntl-oa-mono">{p.name}</td>
                    <td>{p.in}</td>
                    <td className="ntl-oa-mono">{p.schemaType || '—'}</td>
                    <td>{p.required ? '是' : '否'}</td>
                    <td>{p.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ntl-oa-section" data-testid="openapi-request-body">
        <h4>请求体 Request Body</h4>
        {!ep.requestBody ? (
          <div className="ntl-oa-muted">无请求体</div>
        ) : (
          <>
            <div className="ntl-oa-muted">
              {ep.requestBody.required ? '必填' : '可选'}
              {ep.requestBody.contentTypes.length > 0 &&
                ` · ${ep.requestBody.contentTypes.join(', ')}`}
            </div>
            {ep.requestBody.description && (
              <p className="ntl-oa-desc">{ep.requestBody.description}</p>
            )}
            {ep.requestBody.preview && (
              <pre className="ntl-oa-pre" data-testid="openapi-request-preview">
                {ep.requestBody.preview}
              </pre>
            )}
          </>
        )}
      </section>

      <section className="ntl-oa-section" data-testid="openapi-responses">
        <h4>响应 Responses</h4>
        {ep.responses.length === 0 ? (
          <div className="ntl-oa-muted">无响应定义</div>
        ) : (
          ep.responses.map((r) => (
            <div className="ntl-oa-resp" key={r.status}>
              <div className="ntl-oa-resp-head">
                <span className="ntl-oa-status">{r.status}</span>
                <span className="ntl-oa-desc" style={{ margin: 0 }}>
                  {r.description || '—'}
                </span>
                {r.contentTypes.length > 0 && (
                  <span className="ntl-oa-ct">{r.contentTypes.join(', ')}</span>
                )}
              </div>
              {r.preview && <pre className="ntl-oa-pre">{r.preview}</pre>}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

const OpenApiViewerTool: React.FC = () => {
  const boot = initialOpenApi();
  const { state, setField, setState } = useTabPageStore(PAGE_KEY, {
    input: SAMPLE_OAS3,
    doc: boot.doc,
    error: null as string | null,
    activeId: boot.activeId,
  });
  const { input, doc, error, activeId } = state;
  const [loading, setLoading] = useState(false);

  const activeEp = useMemo(() => {
    if (!doc || !activeId) return null;
    for (const g of doc.groups) {
      const found = g.endpoints.find((e) => e.id === activeId);
      if (found) return found;
    }
    return null;
  }, [doc, activeId]);

  const run = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      const r = parseOpenApiDocument(input);
      if (!r.ok) {
        setState((prev) => ({
          ...prev,
          error: r.error,
          doc: null,
          activeId: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          error: null,
          doc: r.doc,
          activeId: r.doc.groups[0]?.endpoints[0]?.id ?? null,
        }));
      }
      setLoading(false);
    }, 40);
  }, [input, setState]);

  const loadSample = (sample: string) => {
    const r = parseOpenApiDocument(sample);
    if (r.ok) {
      setState({
        input: sample,
        doc: r.doc,
        error: null,
        activeId: r.doc.groups[0]?.endpoints[0]?.id ?? null,
      });
    } else {
      setField('input', sample);
    }
  };

  const resultText = doc ? formatOpenApiSummary(doc) : '';

  return (
    <NetworkToolLayout
      title="OpenAPI / Swagger 查看器"
      icon={resolveNetworkIcon('ApiOutlined')}
      description="粘贴 OAS 3 / Swagger 2 文档 · 分组浏览端点"
      submitText="解析"
      loading={loading}
      onSubmit={run}
      resultText={resultText}
      error={error}
      inputLabel="OpenAPI 文档"
      inputMeta="JSON 或 YAML"
      result={
        !doc ? (
          <div className="ntl-result-empty" data-testid="openapi-empty">
            解析后显示 API 文档
          </div>
        ) : (
          <div className="ntl-oa" data-testid="openapi-result">
            <div className="ntl-oa-meta">
              <h3 className="ntl-oa-title" data-testid="openapi-title">
                {doc.title}
              </h3>
              <span className="ntl-oa-badge" data-testid="openapi-spec-version">
                {doc.specVersion}
              </span>
              <span className="ntl-oa-badge" data-testid="openapi-endpoint-count">
                {doc.endpointCount} 个端点
              </span>
              {doc.version && (
                <span className="ntl-oa-badge">v{doc.version}</span>
              )}
            </div>
            {doc.description && <p className="ntl-oa-desc">{doc.description}</p>}
            {doc.servers.length > 0 && (
              <div className="ntl-oa-servers" data-testid="openapi-servers">
                {doc.servers.join(' · ')}
              </div>
            )}

            <div className="ntl-oa-layout">
              <aside className="ntl-oa-list" data-testid="openapi-list">
                <div className="ntl-oa-panel-head">端点列表</div>
                <div className="ntl-oa-list-body">
                  {doc.groups.map((g) => (
                    <div className="ntl-oa-tag" key={g.name} data-testid={`openapi-tag-${g.name}`}>
                      <div className="ntl-oa-tag-name">
                        {g.name}
                        <span className="ntl-oa-tag-count">({g.endpoints.length})</span>
                      </div>
                      {g.endpoints.map((ep) => (
                        <button
                          key={`${g.name}-${ep.id}`}
                          type="button"
                          className={`ntl-oa-ep${activeId === ep.id ? ' is-active' : ''}`}
                          data-testid={`openapi-ep-${ep.method}-${ep.path.replace(/\W+/g, '_')}`}
                          onClick={() => setField('activeId', ep.id)}
                        >
                          <MethodBadge method={ep.method} />
                          <div className="ntl-oa-ep-main">
                            <div className="ntl-oa-ep-path">{ep.path}</div>
                            {ep.summary && (
                              <div className="ntl-oa-ep-sum">{ep.summary}</div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </aside>

              <section className="ntl-oa-detail">
                <div className="ntl-oa-panel-head">端点详情</div>
                {activeEp ? (
                  <EndpointDetail ep={activeEp} />
                ) : (
                  <div className="ntl-oa-detail-empty">选择左侧端点查看详情</div>
                )}
              </section>
            </div>
          </div>
        )
      }
    >
      <div data-testid="network-tool-input-slot">
        <div className="ntl-oa-samples" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className="ntl-oa-sample-btn"
            data-testid="openapi-sample-oas3"
            onClick={() => loadSample(SAMPLE_OAS3)}
          >
            载入 OAS3 示例
          </button>
          <button
            type="button"
            className="ntl-oa-sample-btn"
            data-testid="openapi-sample-swagger2"
            onClick={() => loadSample(SAMPLE_SWAGGER2)}
          >
            载入 Swagger2 示例
          </button>
        </div>
        <TextArea
          value={input}
          onChange={(e) => setField('input', e.target.value)}
          rows={10}
          placeholder="粘贴 openapi: 3.0 或 swagger: '2.0' 文档（JSON / YAML）"
          data-testid="openapi-input"
          spellCheck={false}
          style={{
            fontFamily: 'var(--miao-font-mono, ui-monospace, Menlo, monospace)',
            fontSize: 12.5,
          }}
        />
      </div>
    </NetworkToolLayout>
  );
};

export default OpenApiViewerTool;
