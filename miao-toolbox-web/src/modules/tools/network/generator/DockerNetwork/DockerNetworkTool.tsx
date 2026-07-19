/**
 * Docker 网络配置生成器
 */
import React, { useCallback, useMemo } from 'react';
import { Checkbox, Input, Select } from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  defaultDockerNetworkForm,
  detectSubnetConflicts,
  formatConflictText,
  generateComposeNetwork,
  suggestGateway,
  type DockerNetworkForm,
} from '../../utils/dockerNetwork';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import '../generator-tools.css';

const PAGE_KEY = 'tools-network-docker-network';

const DockerNetworkTool: React.FC = () => {
  const { state, setState } = useTabPageStore(PAGE_KEY, {
    form: defaultDockerNetworkForm() as DockerNetworkForm,
  });
  const { form } = state;

  const yaml = useMemo(() => generateComposeNetwork(form), [form]);
  const conflicts = useMemo(() => detectSubnetConflicts(form.subnet), [form.subnet]);
  const conflictText = useMemo(() => formatConflictText(conflicts), [conflicts]);

  const resultText = useMemo(() => {
    return yaml + (conflicts.length ? `\n# 冲突检测\n# ${conflictText.replace(/\n/g, '\n# ')}\n` : '');
  }, [yaml, conflicts, conflictText]);

  const patch = useCallback(
    (p: Partial<DockerNetworkForm>) => {
      setState((prev) => {
        const next = { ...prev.form, ...p };
        // 子网变化且 gateway 仍是旧推断时，自动更新建议网关
        if (p.subnet !== undefined) {
          const suggested = suggestGateway(p.subnet);
          if (suggested && (!prev.form.gateway || prev.form.gateway === suggestGateway(prev.form.subnet))) {
            next.gateway = suggested;
          }
        }
        return { ...prev, form: next };
      });
    },
    [setState],
  );

  return (
    <NetworkToolLayout
      title="Docker 网络配置生成器"
      icon={resolveNetworkIcon('ContainerOutlined')}
      description="生成 Compose networks 配置，并检测与 Docker 默认/常用网段冲突"
      showSubmit={false}
      resultText={resultText}
      result={
        <div data-testid="docker-result">
          {conflicts.length > 0 && (
            <div style={{ marginBottom: 10 }} data-testid="docker-conflicts">
              {conflicts.map((c) => (
                <div key={c.cidr + c.name} className="ntl-gen-badge ntl-gen-badge--warn" style={{ margin: '0 6px 6px 0' }}>
                  {c.name} ({c.cidr})
                </div>
              ))}
            </div>
          )}
          <pre className="ntl-gen-pre" data-testid="docker-output">
            {yaml}
          </pre>
        </div>
      }
    >
      <div className="ntl-form" data-testid="docker-form">
        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">网络定义</span>
            <span className="ntl-form-section-desc">Compose networks 段</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-grid-2">
              <div className="ntl-form-field">
                <label>网络名</label>
                <Input
                  value={form.networkName}
                  onChange={(e) => patch({ networkName: e.target.value })}
                  data-testid="docker-name"
                />
              </div>
              <div className="ntl-form-field">
                <label>driver</label>
                <Select
                  value={form.driver}
                  options={['bridge', 'overlay', 'macvlan', 'host', 'none'].map((d) => ({
                    value: d,
                    label: d,
                  }))}
                  onChange={(v) => patch({ driver: v })}
                  data-testid="docker-driver"
                />
              </div>
            </div>
            <div className="ntl-form-row">
              <div className="ntl-form-field">
                <label>subnet (CIDR)</label>
                <Input
                  value={form.subnet}
                  onChange={(e) => patch({ subnet: e.target.value })}
                  placeholder="172.20.0.0/16"
                  data-testid="docker-subnet"
                />
              </div>
              <div className="ntl-form-field">
                <label>gateway</label>
                <Input
                  value={form.gateway}
                  onChange={(e) => patch({ gateway: e.target.value })}
                  data-testid="docker-gateway"
                />
              </div>
              <div className="ntl-form-field">
                <label>ip_range（可选）</label>
                <Input
                  value={form.ipRange}
                  onChange={(e) => patch({ ipRange: e.target.value })}
                  placeholder="172.20.5.0/24"
                />
              </div>
            </div>
            <div className="ntl-form-checks">
              <Checkbox
                checked={form.attachable}
                onChange={(e) => patch({ attachable: e.target.checked })}
              >
                attachable
              </Checkbox>
              <Checkbox
                checked={form.internal}
                onChange={(e) => patch({ internal: e.target.checked })}
              >
                internal
              </Checkbox>
            </div>
            <p className="ntl-form-hint-box">
              子网若与 Docker 默认 bridge（172.17.0.0/16）等重叠，结果区会给出冲突提示。
            </p>
          </div>
        </section>
      </div>
    </NetworkToolLayout>
  );
};

export default DockerNetworkTool;
