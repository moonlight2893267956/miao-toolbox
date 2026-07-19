/**
 * 编码解码全家桶 — Base64 / URL / HTML 实体 / Hex
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Input, Switch } from 'antd';
import { CodeOutlined, SwapOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import {
  runCodec,
  type CodecDirection,
  type CodecKind,
} from '../../utils/codecs';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './codec-suite.css';

const KINDS: { key: CodecKind; label: string }[] = [
  { key: 'base64', label: 'Base64' },
  { key: 'url', label: 'URL' },
  { key: 'html', label: 'HTML 实体' },
  { key: 'hex', label: 'Hex' },
];

const CodecSuiteTool: React.FC = () => {
  const [kind, setKind] = useState<CodecKind>('base64');
  const [direction, setDirection] = useState<CodecDirection>('encode');
  const [urlSafe, setUrlSafe] = useState(false);
  const [input, setInput] = useState('hello world');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitLabel = direction === 'encode' ? '编码' : '解码';

  const run = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      const result = runCodec(kind, direction, input, { urlSafe });
      setOutput(result.output);
      setError(result.error ?? null);
      setLoading(false);
    }, 80);
  }, [kind, direction, input, urlSafe]);

  const swap = useCallback(() => {
    if (!output && !error) return;
    setInput(output);
    setOutput('');
    setError(null);
    setDirection((d) => (d === 'encode' ? 'decode' : 'encode'));
  }, [output, error]);

  const placeholders = useMemo(() => {
    if (direction === 'encode') {
      return kind === 'html' ? '输入含 <>& 的 HTML 片段…' : '输入待编码文本…';
    }
    switch (kind) {
      case 'base64':
        return '输入 Base64 字符串…';
      case 'url':
        return '输入百分号编码字符串…';
      case 'html':
        return '输入含 HTML 实体的文本…';
      case 'hex':
        return '输入 Hex（可含空格）…';
      default:
        return '输入…';
    }
  }, [kind, direction]);

  return (
    <NetworkToolLayout
      title="编码解码全家桶"
      icon={<CodeOutlined />}
      description="Base64 · URL · HTML 实体 · Hex 双向转换"
      submitText={submitLabel}
      loading={loading}
      onSubmit={run}
      resultText={output}
      error={error}
      inputLabel="原文"
      inputMeta={direction === 'encode' ? '待编码内容' : '待解码内容'}
      extraActions={
        <button type="button" className="ntl-ghost-btn" onClick={swap} title="结果填入输入并切换方向">
          <SwapOutlined /> 互换
        </button>
      }
    >
      <div data-testid="network-tool-input-slot" className="ntl-codec">
        <div className="ntl-codec-toolbar">
          <div className="ntl-chip-group" role="tablist" aria-label="编解码类型">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                role="tab"
                aria-selected={kind === k.key}
                className={`ntl-chip${kind === k.key ? ' is-on' : ''}`}
                data-testid={`codec-kind-${k.key}`}
                onClick={() => {
                  setKind(k.key);
                  setError(null);
                  setOutput('');
                }}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="ntl-codec-sep" aria-hidden />

          <div className="ntl-chip-group" role="group" aria-label="方向">
            <button
              type="button"
              className={`ntl-chip${direction === 'encode' ? ' is-on' : ''}`}
              data-testid="codec-dir-encode"
              onClick={() => setDirection('encode')}
            >
              编码
            </button>
            <button
              type="button"
              className={`ntl-chip${direction === 'decode' ? ' is-on' : ''}`}
              data-testid="codec-dir-decode"
              onClick={() => setDirection('decode')}
            >
              解码
            </button>
          </div>

          {kind === 'base64' && (
            <label className="ntl-option ntl-codec-option">
              <Switch size="small" checked={urlSafe} onChange={setUrlSafe} data-testid="codec-url-safe" />
              <span>URL-Safe</span>
            </label>
          )}
        </div>

        <Input.TextArea
          rows={6}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholders}
          spellCheck={false}
          data-testid="codec-input"
          className="ntl-codec-input"
        />
      </div>
    </NetworkToolLayout>
  );
};

export default CodecSuiteTool;
