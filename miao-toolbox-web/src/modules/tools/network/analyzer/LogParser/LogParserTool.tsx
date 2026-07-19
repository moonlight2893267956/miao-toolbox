import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Input, Select } from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import HoverCopy from '../../components/HoverCopy';
import {
  SAMPLE_NGINX_LOG,
  formatLogResultText,
  parseLogs,
  type LogParseResult,
} from '../../utils/logParser';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './log-parser.css';

const { TextArea } = Input;
const PAGE_KEY = 'tools-network-log-parser';

const LEVEL_OPTIONS = [
  { value: '', label: '全部级别' },
  { value: 'error', label: 'error' },
  { value: 'warn', label: 'warn' },
  { value: 'info', label: 'info' },
  { value: 'debug', label: 'debug' },
];

const LogParserTool: React.FC = () => {
  const { state, setField, setState } = useTabPageStore(PAGE_KEY, {
    input: SAMPLE_NGINX_LOG,
    keyword: '',
    level: '',
    customRegex: '',
    result: parseLogs(SAMPLE_NGINX_LOG) as LogParseResult | null,
  });
  const { input, keyword, level, customRegex, result } = state;
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const run = useCallback(() => {
    setLoading(true);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setState((prev) => ({
        ...prev,
        result: parseLogs(prev.input, {
          keyword: prev.keyword,
          level: prev.level,
          customRegex: prev.customRegex,
        }),
      }));
      setLoading(false);
    }, 40);
  }, [setState]);

  const resultText = result ? formatLogResultText(result) : '';

  return (
    <NetworkToolLayout
      title="日志解析 / 分析器"
      icon={resolveNetworkIcon('FileSearchOutlined')}
      description="Nginx/Apache/JSON · 级别与关键词筛选 · 自定义正则"
      submitText="解析"
      loading={loading}
      onSubmit={run}
      resultText={resultText}
      error={result?.error ?? null}
      inputLabel="日志文本"
      inputMeta="自动识别格式"
      result={
        !result ? (
          <div className="ntl-lp-empty">解析后显示结果</div>
        ) : (
          <div className="ntl-lp" data-testid="log-result">
            <div className="ntl-lp-meta">
              <span className="ntl-lp-badge" data-testid="log-format">
                格式 · {result.detected}
                {result.customFilter ? ' · 正则筛选' : ''}
              </span>
              <span className="ntl-lp-badge" data-testid="log-count">
                {result.matched} / {result.total} 行
              </span>
            </div>
            {result.hint && (
              <div className="ntl-lp-hint" data-testid="log-hint">
                {result.hint}
              </div>
            )}
            {result.lines.length === 0 ? (
              <div className="ntl-lp-empty" data-testid="log-empty">
                无匹配行
              </div>
            ) : (
              <div className="ntl-lp-lines" data-testid="log-lines">
                {result.lines.map((l) => {
                  const lvl = (l.level || '').toLowerCase();
                  const cls =
                    lvl.includes('error') || lvl === 'fatal'
                      ? ' ntl-lp-line--error'
                      : lvl.includes('warn')
                        ? ' ntl-lp-line--warn'
                        : '';
                  const keys = Object.keys(l.fields).filter((k) => k !== 'message');
                  return (
                    <div
                      key={l.index}
                      className={`ntl-lp-line${cls}`}
                      data-testid={`log-line-${l.index}`}
                    >
                      <div className="ntl-lp-line-top">
                        <span>#{l.index + 1}</span>
                        <span>{l.format}</span>
                        {l.level && <span className="ntl-lp-level">{l.level}</span>}
                        <HoverCopy value={l.raw} label={`行 ${l.index + 1}`}>
                          <span className="ntl-lp-copy-hint">复制整行</span>
                        </HoverCopy>
                      </div>
                      {keys.length > 0 ? (
                        <div className="ntl-lp-fields">
                          {keys.map((k) => (
                            <HoverCopy key={k} value={l.fields[k]} label={k}>
                              <span>
                                <b>{k}</b>={l.fields[k]}
                              </span>
                            </HoverCopy>
                          ))}
                        </div>
                      ) : (
                        <HoverCopy value={l.raw} label={`行 ${l.index + 1}`} className="ntl-hover-copy--block">
                          <div className="ntl-lp-raw">{l.raw}</div>
                        </HoverCopy>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )
      }
    >
      <div data-testid="network-tool-input-slot">
        <div className="ntl-lp-filters" style={{ marginBottom: 12 }}>
          <div className="ntl-lp-field">
            <label>关键词</label>
            <Input
              value={keyword}
              onChange={(e) => setField('keyword', e.target.value)}
              placeholder="login / 500 …"
              data-testid="log-keyword"
              allowClear
            />
          </div>
          <div className="ntl-lp-field" style={{ maxWidth: 160 }}>
            <label>级别</label>
            <Select
              value={level}
              onChange={(v) => setField('level', v)}
              options={LEVEL_OPTIONS}
              data-testid="log-level"
              style={{ width: '100%' }}
            />
          </div>
          <div className="ntl-lp-field" style={{ flex: '1 1 220px' }}>
            <label>自定义正则（筛选行，可含捕获组）</label>
            <Input
              value={customRegex}
              onChange={(e) => setField('customRegex', e.target.value)}
              placeholder={'POST  或  user=(?<user>\\w+)'}
              data-testid="log-regex"
              allowClear
              spellCheck={false}
            />
          </div>
        </div>
        <TextArea
          value={input}
          onChange={(e) => setField('input', e.target.value)}
          rows={10}
          data-testid="log-input"
          spellCheck={false}
          style={{ fontFamily: 'var(--miao-font-mono, ui-monospace, Menlo, monospace)', fontSize: 12.5 }}
        />
      </div>
    </NetworkToolLayout>
  );
};

export default LogParserTool;
