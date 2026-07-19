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

const DataFormatTool: React.FC = () => {
  const [from, setFrom] = useState<DataFormat>('json');
  const [to, setTo] = useState<DataFormat>('yaml');
  const [input, setInput] = useState(SAMPLE_JSON);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const convert = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      const result = convertDataFormat(input, from, to);
      setOutput(result.output);
      setError(result.error ?? null);
      setLoading(false);
    }, 80);
  }, [input, from, to]);

  const swapFormats = useCallback(() => {
    setFrom(to);
    setTo(from);
    if (output) {
      setInput(output);
      setOutput('');
      setError(null);
    }
  }, [from, to, output]);

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
                onClick={() => setFrom(f.key)}
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
                onClick={() => setTo(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <Input.TextArea
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="粘贴待转换文本…"
          spellCheck={false}
          data-testid="df-input"
        />
      </div>
    </NetworkToolLayout>
  );
};

export default DataFormatTool;
