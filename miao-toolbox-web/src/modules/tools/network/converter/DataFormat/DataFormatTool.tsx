/**
 * 数据格式转换器 — JSON / YAML / CSV / TOML
 */
import React, { useCallback, useState } from 'react';
import { Input } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import {
  convertDataFormat,
  type DataFormat,
} from '../../utils/formatConverter';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';

const FORMATS: { key: DataFormat; label: string }[] = [
  { key: 'json', label: 'JSON' },
  { key: 'yaml', label: 'YAML' },
  { key: 'csv', label: 'CSV' },
  { key: 'toml', label: 'TOML' },
];

const SAMPLE_JSON = `{
  "name": "miao-toolbox",
  "enabled": true,
  "tags": ["network", "dev"]
}`;

const PAGE_KEY = 'tools-network-data-format';

const DataFormatTool: React.FC = () => {
  const { state, setField, setState } = useTabPageStore(PAGE_KEY, {
    from: 'json' as DataFormat,
    to: 'yaml' as DataFormat,
    input: SAMPLE_JSON,
    output: '',
    error: null as string | null,
  });
  const { from, to, input, output, error } = state;
  const [loading, setLoading] = useState(false);

  const convert = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      const result = convertDataFormat(input, from, to);
      setState((prev) => ({
        ...prev,
        output: result.output,
        error: result.error ?? null,
      }));
      setLoading(false);
    }, 80);
  }, [input, from, to, setState]);

  const swapFormats = useCallback(() => {
    setState((prev) => {
      const next = {
        ...prev,
        from: prev.to,
        to: prev.from,
      };
      if (prev.output) {
        next.input = prev.output;
        next.output = '';
        next.error = null;
      }
      return next;
    });
  }, [setState]);

  return (
    <NetworkToolLayout
      title="数据格式转换器"
      icon={resolveNetworkIcon('SwapOutlined')}
      description="JSON · YAML · CSV · TOML 双向转换"
      submitText="转换"
      loading={loading}
      onSubmit={convert}
      resultText={output}
      error={error}
      inputLabel="源文本"
      inputMeta={`${from.toUpperCase()} → ${to.toUpperCase()}`}
      extraActions={
        <button type="button" className="ntl-ghost-btn" onClick={swapFormats} title="交换源/目标格式">
          <SwapOutlined /> 交换格式
        </button>
      }
    >
      <div data-testid="network-tool-input-slot">
        {/* 源 / 目标分行，加大上下间距 */}
        <div className="ntl-format-row">
          <span className="ntl-toolbar-label">源</span>
          <div className="ntl-chip-group" role="tablist" aria-label="源格式">
            {FORMATS.map((f) => (
              <button
                key={`from-${f.key}`}
                type="button"
                role="tab"
                aria-selected={from === f.key}
                className={`ntl-chip${from === f.key ? ' is-on' : ''}`}
                data-testid={`df-from-${f.key}`}
                onClick={() => setField('from', f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ntl-format-row">
          <span className="ntl-toolbar-label">目标</span>
          <div className="ntl-chip-group" role="tablist" aria-label="目标格式">
            {FORMATS.map((f) => (
              <button
                key={`to-${f.key}`}
                type="button"
                role="tab"
                aria-selected={to === f.key}
                className={`ntl-chip${to === f.key ? ' is-on' : ''}`}
                data-testid={`df-to-${f.key}`}
                onClick={() => setField('to', f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <Input.TextArea
          rows={8}
          value={input}
          onChange={(e) => setField('input', e.target.value)}
          placeholder="粘贴待转换文本…"
          spellCheck={false}
          data-testid="df-input"
        />
      </div>
    </NetworkToolLayout>
  );
};

export default DataFormatTool;
