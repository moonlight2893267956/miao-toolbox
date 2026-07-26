import { useState } from 'react';
import { Alert, Button, Card, Input } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, LinkOutlined, SearchOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { resolveNetworkIcon } from '../../utils/iconMap';
import {
  parseRobots,
  type RobotsParserParams,
  type RobotsParserResult,
} from '../../services/networkService';
import './RobotsParserTool.css';

export default function RobotsParserTool() {
  const [domain, setDomain] = useState('google.com');
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RobotsParserResult | null>(null);

  const run = async () => {
    if (!domain.trim()) {
      setError('域名不能为空');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await parseRobots({ domain: domain.trim(), path: path.trim() || undefined } as RobotsParserParams);
      setResult(res);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '解析失败');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const resultNode = result ? (
    <div className="rb-result">
      {result.pathAllowed !== null && (
        <div
          className={`rb-verdict ${result.pathAllowed ? 'rb-verdict--allow' : 'rb-verdict--deny'}`}
        >
          <span className="rb-verdict-ic">
            {result.pathAllowed ? <CheckCircleFilled /> : <CloseCircleFilled />}
          </span>
          <span className="rb-verdict-txt">
            <span className="rb-verdict-title">
              {result.pathAllowed ? '该路径允许抓取' : '该路径被禁止抓取'}
            </span>
            {result.matchedRule ? (
              <span className="rb-verdict-desc">命中规则：{result.matchedRule}</span>
            ) : (
              <span className="rb-verdict-desc">无匹配规则，按默认允许处理</span>
            )}
          </span>
        </div>
      )}
      {result.groups.map((g, i) => (
        <Card className="rb-group" key={i} bordered={false}>
          <div className="rb-group-head">
            <span className="rb-ua-label">User-agent</span>
            <code className="rb-ua">{g.userAgent}</code>
          </div>
          <div className="rb-group-body">
            <div className="rb-rule rb-rule--allow">
              <span className="rb-rule-tag">Allow</span>
              <div className="rb-rule-tags">
                {g.allow.length ? (
                  g.allow.map((a) => (
                    <span className="rb-rule-tag-item" key={a}>
                      {a}
                    </span>
                  ))
                ) : (
                  <span className="rb-rule-none">无</span>
                )}
              </div>
            </div>
            <div className="rb-rule rb-rule--disallow">
              <span className="rb-rule-tag">Disallow</span>
              <div className="rb-rule-tags">
                {g.disallow.length ? (
                  g.disallow.map((d) => (
                    <span className="rb-rule-tag-item" key={d}>
                      {d}
                    </span>
                  ))
                ) : (
                  <span className="rb-rule-none">无</span>
                )}
              </div>
            </div>
          </div>
        </Card>
      ))}
      {result.sitemaps.length > 0 && (
        <div className="rb-sitemaps">
          <div className="rb-sitemaps-label">Sitemap 引用</div>
          <div className="rb-rule-tags">
            {result.sitemaps.map((s) => (
              <a className="rb-sitemap-link" key={s} href={s} target="_blank" rel="noreferrer">
                <LinkOutlined />
                {s}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : error ? (
    <Alert type="error" showIcon message="解析失败" description={error} />
  ) : null;

  return (
    <NetworkToolLayout
      className="rb-tool"
      title="robots.txt 解析器"
      icon={resolveNetworkIcon('RobotOutlined')}
      description="输入域名，服务端抓取 robots.txt 并解析 Allow/Disallow/Sitemap 规则；可检查指定路径是否允许抓取。"
      showSubmit={false}
      result={resultNode}
    >
      <div className="rb-form">
        <div className="rb-chrome">
          <span className="rb-dots" aria-hidden>
            <span className="rb-dot rb-dot--r" />
            <span className="rb-dot rb-dot--y" />
            <span className="rb-dot rb-dot--g" />
          </span>
          <span className="rb-proto">https://</span>
          <Input
            className="rb-addr"
            variant="borderless"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="google.com"
            onPressEnter={run}
          />
          <span className="rb-path-echo">/robots.txt</span>
        </div>
        <div className="rb-pathrow">
          <span className="rb-label">检查路径（可选）</span>
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="如 /admin（检查是否允许抓取）"
            onPressEnter={run}
          />
        </div>
        <Button
          className="rb-run"
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
