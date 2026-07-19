/**
 * Nginx 配置生成器 — 多场景组合
 */
import React, { useCallback, useMemo } from 'react';
import { Checkbox, Input, InputNumber } from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  NGINX_SCENARIO_LABELS,
  defaultNginxState,
  generateNginxConfig,
  type NginxFormState,
  type NginxScenario,
} from '../../utils/nginxConfig';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import '../generator-tools.css';

const { TextArea } = Input;
const PAGE_KEY = 'tools-network-nginx-config';

const ALL_SCENARIOS = Object.keys(NGINX_SCENARIO_LABELS) as NginxScenario[];

const NginxConfigTool: React.FC = () => {
  const { state, setState } = useTabPageStore(PAGE_KEY, {
    form: defaultNginxState() as NginxFormState,
  });
  const { form } = state;

  const resultText = useMemo(() => generateNginxConfig(form), [form]);

  const patch = useCallback(
    (p: Partial<NginxFormState>) => {
      setState((prev) => ({ ...prev, form: { ...prev.form, ...p } }));
    },
    [setState],
  );

  const toggleScenario = (s: NginxScenario, on: boolean) => {
    setState((prev) => {
      const set = new Set(prev.form.scenarios);
      if (on) set.add(s);
      else set.delete(s);
      return { ...prev, form: { ...prev.form, scenarios: Array.from(set) } };
    });
  };

  const has = (s: NginxScenario) => form.scenarios.includes(s);

  return (
    <NetworkToolLayout
      title="Nginx 配置生成器"
      icon={resolveNetworkIcon('CloudServerOutlined')}
      description="场景化组合生成 Nginx server/location 配置（反代 / HTTPS / 缓存 / CORS / 负载均衡）"
      showSubmit={false}
      resultText={resultText}
      result={
        <pre className="ntl-gen-pre" data-testid="nginx-output">
          {resultText}
        </pre>
      }
    >
      <div className="ntl-form" data-testid="nginx-form">
        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">场景</span>
            <span className="ntl-form-section-desc">可多选组合叠加</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-checks">
              {ALL_SCENARIOS.map((s) => (
                <Checkbox
                  key={s}
                  checked={has(s)}
                  onChange={(e) => toggleScenario(s, e.target.checked)}
                  data-testid={`nginx-scenario-${s}`}
                >
                  {NGINX_SCENARIO_LABELS[s]}
                </Checkbox>
              ))}
            </div>
          </div>
        </section>

        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">Server</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-row">
              <div className="ntl-form-field ntl-form-field--grow">
                <label>server_name</label>
                <Input
                  value={form.serverName}
                  onChange={(e) => patch({ serverName: e.target.value })}
                  data-testid="nginx-server-name"
                />
              </div>
              <div className="ntl-form-field ntl-form-field--sm">
                <label>listen</label>
                <InputNumber
                  min={1}
                  max={65535}
                  value={form.listenPort}
                  onChange={(v) => patch({ listenPort: Number(v ?? 80) })}
                  style={{ width: '100%' }}
                  disabled={has('https')}
                />
              </div>
              <div className="ntl-form-field ntl-form-field--md">
                <label>location</label>
                <Input
                  value={form.locationPath}
                  onChange={(e) => patch({ locationPath: e.target.value })}
                  data-testid="nginx-location"
                />
              </div>
            </div>
          </div>
        </section>

        {(has('reverse_proxy') ||
          has('load_balance') ||
          has('https') ||
          has('cors') ||
          has('cache')) && (
          <section className="ntl-form-section">
            <div className="ntl-form-section-head">
              <span className="ntl-form-section-title">场景参数</span>
            </div>
            <div className="ntl-form-section-body">
              {has('reverse_proxy') && !has('load_balance') && (
                <div className="ntl-form-field">
                  <label>后端 upstream URL</label>
                  <Input
                    value={form.upstreamUrl}
                    onChange={(e) => patch({ upstreamUrl: e.target.value })}
                    placeholder="http://127.0.0.1:3000"
                    data-testid="nginx-upstream"
                  />
                </div>
              )}

              {has('load_balance') && (
                <div className="ntl-form-field">
                  <label>后端列表（每行 host:port）</label>
                  <TextArea
                    rows={3}
                    value={form.backends}
                    onChange={(e) => patch({ backends: e.target.value })}
                    data-testid="nginx-backends"
                  />
                </div>
              )}

              {has('https') && (
                <div className="ntl-form-grid-2">
                  <div className="ntl-form-field">
                    <label>ssl_certificate</label>
                    <Input
                      value={form.sslCert}
                      onChange={(e) => patch({ sslCert: e.target.value })}
                    />
                  </div>
                  <div className="ntl-form-field">
                    <label>ssl_certificate_key</label>
                    <Input value={form.sslKey} onChange={(e) => patch({ sslKey: e.target.value })} />
                  </div>
                </div>
              )}

              {has('cors') && (
                <div className="ntl-form-field">
                  <label>CORS Origin</label>
                  <Input
                    value={form.corsOrigin}
                    onChange={(e) => patch({ corsOrigin: e.target.value })}
                    data-testid="nginx-cors-origin"
                  />
                </div>
              )}

              {has('cache') && (
                <div className="ntl-form-grid-2">
                  <div className="ntl-form-field">
                    <label>cache path</label>
                    <Input
                      value={form.cachePath}
                      onChange={(e) => patch({ cachePath: e.target.value })}
                    />
                  </div>
                  <div className="ntl-form-field">
                    <label>cache valid</label>
                    <Input
                      value={form.cacheValid}
                      onChange={(e) => patch({ cacheValid: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </NetworkToolLayout>
  );
};

export default NginxConfigTool;
