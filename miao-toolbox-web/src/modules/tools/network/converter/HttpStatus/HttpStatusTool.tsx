/**
 * HTTP 状态码参考
 * 结果区：分类 chips + 精确命中主卡片 + 列表卡片（可复制）
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Input, message } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import {
  formatHttpStatusText,
  searchHttpStatus,
  type HttpStatusInfo,
} from '../../utils/httpStatus';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './http-status.css';

const PAGE_KEY = 'tools-network-http-status';

type ClassKey = '1xx' | '2xx' | '3xx' | '4xx' | '5xx';

function classKey(code: number): ClassKey {
  if (code < 200) return '1xx';
  if (code < 300) return '2xx';
  if (code < 400) return '3xx';
  if (code < 500) return '4xx';
  return '5xx';
}

function copyText(text: string, label?: string) {
  void navigator.clipboard?.writeText(text).then(
    () => message.success(label ? `已复制 ${label}` : '已复制'),
    () => message.error('复制失败'),
  );
}

function MiniCopy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`ntl-hs-copy-btn${done ? ' ntl-hs-copy-btn--done' : ''}`}
      title={`复制 ${label}`}
      aria-label={`复制 ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        copyText(text, label);
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <CheckOutlined /> : <CopyOutlined />}
      {done ? '已复制' : '复制'}
    </button>
  );
}

function itemCopyText(i: HttpStatusInfo): string {
  return `${i.code} ${i.phrase}\n中文: ${i.zh}（${i.category}）\n常见原因: ${i.causes}\n建议: ${i.advice}`;
}

function StatusHero({ item }: { item: HttpStatusInfo }) {
  const ck = classKey(item.code);
  return (
    <div className={`ntl-hs-hero ntl-hs-hero--${ck}`} data-testid="http-status-hero">
      <div className="ntl-hs-hero-head">
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <span className="ntl-hs-hero-code">{item.code}</span>
          <div className="ntl-hs-hero-meta">
            <span className="ntl-hs-hero-phrase">{item.phrase}</span>
            <span className="ntl-hs-hero-zh">
              {item.zh} · {item.category}
            </span>
          </div>
        </div>
        <MiniCopy text={itemCopyText(item)} label={`${item.code}`} />
      </div>
      <div className="ntl-hs-hero-body">
        <div className="ntl-hs-field">
          <div className="ntl-hs-field-label">常见原因</div>
          <div className="ntl-hs-field-value">{item.causes}</div>
        </div>
        <div className="ntl-hs-field">
          <div className="ntl-hs-field-label">建议</div>
          <div className="ntl-hs-field-value">{item.advice}</div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ item }: { item: HttpStatusInfo }) {
  const ck = classKey(item.code);
  return (
    <button
      type="button"
      className="ntl-hs-card"
      onClick={() => copyText(itemCopyText(item), String(item.code))}
      title="点击复制"
      data-testid={`http-status-card-${item.code}`}
    >
      <div className="ntl-hs-card-top">
        <span className={`ntl-hs-card-code ntl-hs-card-code--${ck}`}>{item.code}</span>
        <span className="ntl-hs-card-phrase">{item.phrase}</span>
        <span className="ntl-hs-card-zh">{item.zh}</span>
        <span className="ntl-hs-card-cat">{item.category}</span>
      </div>
      <div className="ntl-hs-card-rows">
        <div>
          <strong>原因</strong>
          {item.causes}
        </div>
        <div>
          <strong>建议</strong>
          {item.advice}
        </div>
      </div>
    </button>
  );
}

function HttpStatusResultView({ items, query }: { items: HttpStatusInfo[]; query: string }) {
  const exact = useMemo(() => {
    const n = Number(query.trim());
    if (!Number.isFinite(n)) return null;
    return items.find((i) => i.code === n) ?? null;
  }, [items, query]);

  const rest = useMemo(() => {
    if (!exact) return items;
    return items.filter((i) => i.code !== exact.code);
  }, [items, exact]);

  const classes = useMemo(() => {
    const set = new Set(items.map((i) => classKey(i.code)));
    return Array.from(set);
  }, [items]);

  if (items.length === 0) {
    return (
      <p className="ntl-hs-empty" data-testid="http-status-result">
        未找到匹配的状态码
      </p>
    );
  }

  return (
    <div className="ntl-hs" data-testid="http-status-result">
      <div className="ntl-hs-status">
        <span className="ntl-hs-chip ntl-hs-chip--muted">
          <span className="ntl-hs-chip-k">hits</span>
          {items.length}
        </span>
        {classes.map((c) => (
          <span key={c} className={`ntl-hs-chip ntl-hs-chip--${c}`}>
            {c}
          </span>
        ))}
      </div>

      {exact && <StatusHero item={exact} />}

      {rest.length > 0 && (
        <div className="ntl-hs-list" data-testid="http-status-list">
          {rest.map((item) => (
            <StatusCard key={item.code} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

const HttpStatusTool: React.FC = () => {
  const { state, setField } = useTabPageStore(PAGE_KEY, {
    query: '429',
  });
  const { query } = state;
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HttpStatusInfo[]>(() => searchHttpStatus('429'));

  const resultText = useMemo(() => formatHttpStatusText(items), [items]);

  const run = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      setItems(searchHttpStatus(query));
      setLoading(false);
    }, 40);
  }, [query]);

  return (
    <NetworkToolLayout
      title="HTTP 状态码参考"
      icon={resolveNetworkIcon('NumberOutlined')}
      description="搜索状态码 · 中文含义 · 原因与建议 · 点击卡片可复制"
      submitText="查询"
      loading={loading}
      onSubmit={run}
      resultText={resultText}
      result={<HttpStatusResultView items={items} query={query} />}
    >
      <div className="ntl-form" data-testid="network-tool-input-slot">
        <section className="ntl-form-section">
          <div className="ntl-form-section-head">
            <span className="ntl-form-section-title">搜索</span>
            <span className="ntl-form-section-desc">状态码 · 英文短语 · 中文关键词</span>
          </div>
          <div className="ntl-form-section-body">
            <div className="ntl-form-single">
              <Input
                size="large"
                value={query}
                onChange={(e) => setField('query', e.target.value)}
                onPressEnter={run}
                placeholder="429 · Too Many · 限流 · Gateway …"
                data-testid="http-status-input"
                allowClear
              />
              <p className="ntl-form-single-tip">留空查询会列出全部常用状态码</p>
            </div>
          </div>
        </section>
      </div>
    </NetworkToolLayout>
  );
};

export default HttpStatusTool;
