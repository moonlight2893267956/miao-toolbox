import React, { useCallback, useState } from 'react';
import { Input, message } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import {
  formatMimeText,
  lookupMime,
  type MimeEntry,
} from '../../utils/mimeTypes';
import { resolveNetworkIcon } from '../../utils/iconMap';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './mime-type.css';

function majorOf(mime: string): string {
  const m = mime.split('/')[0]?.toLowerCase() || 'application';
  if (['image', 'audio', 'video', 'text', 'font', 'application'].includes(m)) {
    return m;
  }
  return 'application';
}

function MimeResultList({ items }: { items: MimeEntry[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="ntl-mime-empty" data-testid="mime-empty">
        未找到匹配的 MIME 类型
      </div>
    );
  }

  const copyOne = (text: string, key: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        message.success('已复制 MIME');
        setCopied(key);
        window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
      },
      () => message.error('复制失败'),
    );
  };

  return (
    <ul className="ntl-mime-list" data-testid="mime-list">
      {items.map((e) => {
        const key = `${e.ext}-${e.mime}`;
        const major = majorOf(e.mime);
        const isCopied = copied === key;
        return (
          <li
            className={`ntl-mime-card ntl-mime-card--${major}`}
            key={key}
            data-major={major}
          >
            <span className="ntl-mime-ext" title={e.ext}>
              {e.ext}
            </span>
            <div className="ntl-mime-body">
              <button
                type="button"
                className="ntl-mime-type"
                title="点击复制 MIME"
                onClick={() => copyOne(e.mime, key)}
              >
                {e.mime}
              </button>
              <span className="ntl-mime-desc">{e.desc}</span>
            </div>
            <button
              type="button"
              className={`ntl-mime-copy${isCopied ? ' ntl-mime-copy--done' : ''}`}
              title={isCopied ? '已复制' : `复制 ${e.mime}`}
              aria-label={isCopied ? '已复制' : `复制 ${e.mime}`}
              onClick={() => copyOne(e.mime, key)}
            >
              {isCopied ? <CheckOutlined /> : <CopyOutlined />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const MimeTypeTool: React.FC = () => {
  const [query, setQuery] = useState('.json');
  const [items, setItems] = useState<MimeEntry[]>(() => lookupMime('.json'));
  const [loading, setLoading] = useState(false);

  const run = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      setItems(lookupMime(query));
      setLoading(false);
    }, 40);
  }, [query]);

  const resultText = formatMimeText(items);
  const countLabel =
    items.length === 0 ? '无匹配' : `${items.length} 条结果`;

  return (
    <NetworkToolLayout
      title="MIME 类型参考"
      icon={resolveNetworkIcon('FileOutlined')}
      description="扩展名 ↔ MIME 互查"
      submitText="查询"
      loading={loading}
      onSubmit={run}
      resultText={resultText}
      inputLabel="查询"
      inputMeta="扩展名 / MIME / 关键字"
      result={
        <div className="ntl-mime-result">
          <div className="ntl-mime-toolbar">
            <span className="ntl-mime-count">{countLabel}</span>
            <span className="ntl-mime-tip">点击类型即可复制</span>
          </div>
          <MimeResultList items={items} />
        </div>
      }
    >
      <div data-testid="network-tool-input-slot">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={run}
          placeholder=".json · application/json · image · 图片"
          data-testid="mime-input"
          allowClear
        />
      </div>
    </NetworkToolLayout>
  );
};

export default MimeTypeTool;
