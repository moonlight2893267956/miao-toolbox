import { useState } from 'react';
import { Alert, Button, Input, Table, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  parseSitemap,
  type SitemapParserParams,
  type SitemapParserResult,
  type SitemapUrl,
} from '../../services/networkService';
import './SitemapParserTool.css';

export default function SitemapParserTool() {
  const [url, setUrl] = useState('https://www.php.net/sitemap.xml');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SitemapParserResult | null>(null);

  const run = async () => {
    if (!url.trim()) {
      setError('Sitemap URL 不能为空');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await parseSitemap({ url: url.trim() } as SitemapParserParams);
      setResult(res);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '解析失败');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnsType<SitemapUrl & { key: number }> = [
    {
      title: 'URL',
      dataIndex: 'loc',
      ellipsis: true,
      render: (v: string | null) =>
        v ? (
          <a className="sp-link" href={v} target="_blank" rel="noreferrer">
            {v}
          </a>
        ) : (
          '—'
        ),
    },
    { title: 'Lastmod', dataIndex: 'lastmod', width: 130, render: (v) => v || '—' },
    { title: 'Priority', dataIndex: 'priority', width: 100, render: (v) => v || '—' },
    { title: 'Changefreq', dataIndex: 'changefreq', width: 120, render: (v) => v || '—' },
  ];

  const resultNode = result ? (
    <div className="sp-result">
      <div className="sp-statbar">
        <div className="sp-stat">
          <span className="sp-stat-num">{result.total}</span>
          <span className="sp-stat-label">条 URL</span>
        </div>
        <Tag
          className={`sp-kind ${result.isIndex ? 'sp-kind--index' : 'sp-kind--set'}`}
          bordered={false}
        >
          {result.isIndex ? 'Sitemap Index' : 'URL 集'}
        </Tag>
        {result.isIndex && <span className="sp-hint">已递归子 sitemap 并聚合</span>}
      </div>
      <Table<SitemapUrl & { key: number }>
        className="sp-table"
        size="small"
        rowKey="key"
        rowClassName={() => 'sp-row'}
        columns={columns}
        dataSource={result.urls.map((u, i) => ({ ...u, key: i }))}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: '无 URL' }}
      />
    </div>
  ) : error ? (
    <Alert type="error" showIcon message="解析失败" description={error} />
  ) : null;

  return (
    <NetworkToolLayout
      className="sp-tool"
      title="Sitemap 解析器"
      icon={resolveNetworkIcon('PartitionOutlined')}
      description="输入 sitemap.xml URL，解析所有 URL 及 lastmod/priority/changefreq，支持 Sitemap Index 并统计总数。"
      showSubmit={false}
      result={resultNode}
    >
      <div className="sp-form">
        <div className="sp-chrome">
          <span className="sp-dots" aria-hidden>
            <span className="sp-dot sp-dot--r" />
            <span className="sp-dot sp-dot--y" />
            <span className="sp-dot sp-dot--g" />
          </span>
          <Input
            className="sp-addr"
            variant="borderless"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.php.net/sitemap.xml"
            onPressEnter={run}
          />
          <span className="sp-method">GET</span>
        </div>
        <Button
          className="sp-run"
          type="primary"
          icon={<SearchOutlined />}
          loading={loading}
          onClick={run}
          block
        >
          解析
        </Button>
      </div>
    </NetworkToolLayout>
  );
}
