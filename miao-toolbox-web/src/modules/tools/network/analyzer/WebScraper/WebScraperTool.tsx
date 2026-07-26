import { useState } from 'react';
import { Alert, Button, Input, Radio, Typography } from 'antd';
import { CodeOutlined, FilterOutlined, LinkOutlined, SearchOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  webScrape,
  type WebScrapeParams,
  type WebScrapeResult,
} from '../../services/networkService';
import './WebScraperTool.css';

export default function WebScraperTool() {
  const [url, setUrl] = useState('https://example.com');
  const [selector, setSelector] = useState('h1');
  const [mode, setMode] = useState<'text' | 'attr'>('text');
  const [attribute, setAttribute] = useState('href');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WebScrapeResult | null>(null);

  const run = async () => {
    if (!url.trim() || !selector.trim()) {
      setError('URL 与 CSS 选择器均不能为空');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await webScrape({
        url: url.trim(),
        selector: selector.trim(),
        mode,
        attribute,
      } as WebScrapeParams);
      setResult(res);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '抓取失败');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const chipLabel =
    mode === 'attr' ? `${selector} → ${attribute}` : selector;

  const resultNode = result ? (
    <div className="ws-result">
      <div className="ws-result-bar">
        <span className="ws-count">
          匹配 <b>{result.total}</b> 项
        </span>
        <span className="ws-mode-pill">
          {result.mode === 'attr' ? '属性提取' : '文本提取'}
        </span>
      </div>
      {result.matches.length > 0 ? (
        <div className="ws-matches">
          {result.matches.map((m, i) => (
            <div
              className="ws-match"
              key={i}
              style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
            >
              <span className="ws-idx">{i + 1}</span>
              <code className="ws-tag" title={chipLabel}>
                {chipLabel}
              </code>
              <Typography.Text copyable className="ws-val">
                {result.mode === 'attr' ? m.attrValue ?? '' : m.text ?? ''}
              </Typography.Text>
            </div>
          ))}
        </div>
      ) : (
        <div className="ws-empty">
          <FilterOutlined style={{ fontSize: 20, color: 'var(--tool-accent)' }} />
          选择器未命中任何元素，换个选择器试试
        </div>
      )}
    </div>
  ) : error ? (
    <Alert type="error" showIcon message="抓取失败" description={error} />
  ) : null;

  return (
    <NetworkToolLayout
      title="Web 抓取器"
      icon={resolveNetworkIcon('Html5Outlined')}
      description="输入目标 URL 与 CSS 选择器，服务端抓取页面并按选择器提取文本或属性（如 a[href]）。"
      showSubmit={false}
      className="ws-tool"
      result={resultNode}
    >
      <div className="ws-form">
        <div className="ws-chrome">
          <span className="ws-dots" aria-hidden>
            <i className="ws-dot ws-dot--r" />
            <i className="ws-dot ws-dot--y" />
            <i className="ws-dot ws-dot--g" />
          </span>
          <span className="ws-url-echo">{url || '未指定目标网址'}</span>
          <span className="ws-method">GET · 服务端</span>
        </div>

        <div className="ws-field">
          <span className="ws-label">
            <LinkOutlined className="ws-label-ic" />
            目标网址
          </span>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            onPressEnter={run}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="ws-connector">
          <span>选择元素</span>
        </div>

        <div className="ws-field">
          <span className="ws-label">
            <CodeOutlined className="ws-label-ic" />
            CSS 选择器
          </span>
          <Input
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
            placeholder="h1 或 a[href]"
            onPressEnter={run}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="ws-controls">
          <div className="ws-mode">
            <span className="ws-label">提取模式</span>
            <Radio.Group
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio value="text">文本</Radio>
              <Radio value="attr">属性</Radio>
            </Radio.Group>
          </div>
          {mode === 'attr' && (
            <div className="ws-attr">
              <span className="ws-label">属性名</span>
              <Input
                value={attribute}
                onChange={(e) => setAttribute(e.target.value)}
                placeholder="href"
                onPressEnter={run}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        <Button
          type="primary"
          className="ws-run"
          icon={<SearchOutlined />}
          loading={loading}
          onClick={run}
          block
        >
          {loading ? '抓取中…' : '开始抓取'}
        </Button>
      </div>
    </NetworkToolLayout>
  );
}
