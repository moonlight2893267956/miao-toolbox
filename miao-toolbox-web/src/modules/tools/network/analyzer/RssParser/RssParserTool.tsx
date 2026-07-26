import { useState } from 'react';
import { Alert, Button, Card, Input, List, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  parseRss,
  type RssParserParams,
  type RssParserResult,
} from '../../services/networkService';

export default function RssParserTool() {
  const [url, setUrl] = useState('https://hnrss.org/frontpage');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RssParserResult | null>(null);

  const run = async () => {
    if (!url.trim()) {
      setError('Feed URL 不能为空');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await parseRss({ url: url.trim() } as RssParserParams);
      setResult(res);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '解析失败');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const resultNode = result ? (
    <div>
      {result.channel && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            {result.channel.title || '未命名频道'}
          </Typography.Title>
          {result.channel.link && (
            <Typography.Link href={result.channel.link} target="_blank" rel="noreferrer">
              {result.channel.link}
            </Typography.Link>
          )}
          {result.channel.description && (
            <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginTop: 6 }}>
              {result.channel.description}
            </Typography.Paragraph>
          )}
        </Card>
      )}
      <List
        size="small"
        bordered
        dataSource={result.items}
        locale={{ emptyText: '无文章' }}
        renderItem={(it) => (
          <List.Item>
            <List.Item.Meta
              title={
                it.link ? (
                  <a href={it.link} target="_blank" rel="noreferrer">
                    {it.title}
                  </a>
                ) : (
                  it.title
                )
              }
              description={
                <>
                  {it.pubDate && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {it.pubDate}
                    </Typography.Text>
                  )}
                  {it.summary && (
                    <div style={{ marginTop: 2 }}>{it.summary}</div>
                  )}
                </>
              }
            />
          </List.Item>
        )}
      />
    </div>
  ) : error ? (
    <Alert type="error" showIcon message="解析失败" description={error} />
  ) : null;

  return (
    <NetworkToolLayout
      title="RSS 解析器"
      icon={resolveNetworkIcon('RssOutlined')}
      description="输入 RSS 2.0 / Atom Feed URL，服务端抓取并解析频道信息与文章列表。"
      showSubmit={false}
      result={resultNode}
    >
      <Input
        addonBefore="Feed"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com/feed.xml"
        onPressEnter={run}
      />
      <Button
        type="primary"
        icon={<SearchOutlined />}
        loading={loading}
        onClick={run}
        block
        style={{ marginTop: 16 }}
      >
        解析
      </Button>
    </NetworkToolLayout>
  );
}
