/**
 * 网络工具详情页（动态路由）
 * 路径：/tools/network/:category/:toolId
 *
 * 壳层：限宽内容列 + 面包屑；业务工具按 toolId 懒加载。
 */
import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Button, Spin, Result } from 'antd';
import NetworkToolLayout from './components/NetworkToolLayout';
import NetworkBreadcrumb from './components/NetworkBreadcrumb';
import { listNetworkTools } from './services/networkService';
import { isNetworkToolOnline, type NetworkToolMeta } from './types';
import { resolveNetworkIcon } from './utils/iconMap';
import { useTabs, isTabbable, makeTabKey } from '../../../contexts/TabContext';
import './network.css';
import './components/NetworkToolLayout.css';

const CodecSuiteTool = lazy(() => import('./converter/CodecSuite/CodecSuiteTool'));
const DataFormatTool = lazy(() => import('./converter/DataFormat/DataFormatTool'));
const IpFormatTool = lazy(() => import('./converter/IpFormat/IpFormatTool'));
const TimestampTool = lazy(() => import('./converter/Timestamp/TimestampTool'));
const HttpStatusTool = lazy(() => import('./converter/HttpStatus/HttpStatusTool'));
const MimeTypeTool = lazy(() => import('./converter/MimeType/MimeTypeTool'));
const FileHashTool = lazy(() => import('./converter/FileHash/FileHashTool'));
const CookieAnalyzerTool = lazy(() => import('./analyzer/CookieAnalyzer/CookieAnalyzerTool'));
const UrlParserTool = lazy(() => import('./analyzer/UrlParser/UrlParserTool'));
const OpenApiViewerTool = lazy(() => import('./analyzer/OpenApiViewer/OpenApiViewerTool'));
const EmailHeaderTool = lazy(() => import('./analyzer/EmailHeader/EmailHeaderTool'));
const LogParserTool = lazy(() => import('./analyzer/LogParser/LogParserTool'));
const DiffCheckerTool = lazy(() => import('./analyzer/DiffChecker/DiffCheckerTool'));

const IMPLEMENTED_TOOLS: Record<string, React.LazyExoticComponent<React.FC>> = {
  'base64-codec': CodecSuiteTool,
  'data-format': DataFormatTool,
  'ip-format': IpFormatTool,
  timestamp: TimestampTool,
  'http-status': HttpStatusTool,
  'mime-type': MimeTypeTool,
  'file-hash': FileHashTool,
  'cookie-analyzer': CookieAnalyzerTool,
  'url-parser': UrlParserTool,
  'openapi-viewer': OpenApiViewerTool,
  'email-header': EmailHeaderTool,
  'log-parser': LogParserTool,
  'diff-checker': DiffCheckerTool,
};

function ToolChrome({
  tool,
  children,
}: {
  tool: NetworkToolMeta;
  children: React.ReactNode;
}) {
  // 最高只到「网络工具箱」一级：网络工具箱 / 当前工具
  const crumbs = useMemo(
    () => [
      { label: '网络工具箱', to: '/tools/network', testId: 'network-tool-back' },
      { label: tool.name },
    ],
    [tool.name],
  );

  return (
    <div className="ntl-page ntl-page--tool" data-testid="network-tool-page" data-tool-id={tool.id}>
      <div className="ntl-tool-chrome">
        <NetworkBreadcrumb items={crumbs} />
        <div className="ntl-tool-body">{children}</div>
      </div>
    </div>
  );
}

const NetworkToolPage: React.FC = () => {
  const { category = '', toolId = '' } = useParams<{ category: string; toolId: string }>();
  const location = useLocation();
  const { openTab, updateTab } = useTabs();
  const [tool, setTool] = useState<NetworkToolMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    listNetworkTools()
      .then((tools) => {
        if (cancelled) return;
        const found = tools.find((t) => t.id === toolId && t.category === category) ?? null;
        setTool(found);
        setNotFound(!found);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, toolId]);

  /* 工具加载完成后，确保当前路由对应 Tab 已创建/更新 */
  useEffect(() => {
    if (!tool || !isTabbable(location.pathname)) return;
    const key = makeTabKey(location.pathname);
    const icon = resolveNetworkIcon(tool.icon);
    // 延迟一帧，确保 AppLayout 的刷新恢复已执行
    const timer = setTimeout(() => {
      updateTab(key, { label: tool.name, icon });
      openTab({ key, label: tool.name, path: location.pathname, icon, closable: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [tool, location.pathname, openTab, updateTab]);

  if (loading) {
    return (
      <div className="ntl-page ntl-page--tool" data-testid="network-tool-page-loading">
        <div className="ntl-detail-loading">
          <Spin size="large" />
        </div>
      </div>
    );
  }

  if (notFound || !tool) {
    return (
      <div className="ntl-page ntl-page--tool" data-testid="network-tool-page-missing">
        <div className="ntl-tool-chrome">
          <NetworkBreadcrumb
            items={[
              { label: '网络工具箱', to: '/tools/network', testId: 'network-tool-back' },
              { label: '未找到' },
            ]}
          />
          <div className="ntl-detail-missing">
            <Result
              status="404"
              title="工具不存在"
              subTitle={`未找到 ${category}/${toolId}`}
              extra={
                <Button type="primary" onClick={goBack}>
                  返回网络工具箱
                </Button>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  const Implemented = IMPLEMENTED_TOOLS[tool.id];
  if (Implemented) {
    return (
      <ToolChrome tool={tool}>
        <Suspense
          fallback={
            <div className="ntl-detail-loading">
              <Spin size="large" />
            </div>
          }
        >
          <Implemented />
        </Suspense>
      </ToolChrome>
    );
  }

  const online = isNetworkToolOnline(tool.phase);
  const placeholder = online
    ? `「${tool.name}」功能开发中，当前为布局占位页。\n后续 Epic 将接入完整业务逻辑。`
    : `「${tool.name}」属于 Phase ${tool.phase}，即将推出。\n当前已开放 Phase ≤ 1，该能力尚未上线。`;

  return (
    <ToolChrome tool={tool}>
      <NetworkToolLayout
        title={tool.name}
        icon={resolveNetworkIcon(tool.icon)}
        description={tool.description}
        showSubmit={false}
        resultText={placeholder}
        headerExtra={
          <span className={`ntl-tool-card-badge${online ? ' ntl-tool-card-badge--live' : ' ntl-tool-card-badge--soon'}`}>
            {online ? `Phase ${tool.phase}` : '即将推出'}
          </span>
        }
        result={
          <div className="ntl-detail-placeholder" data-testid="network-tool-placeholder">
            <p className="ntl-detail-placeholder-title">
              {online ? '功能开发中' : '即将推出'}
            </p>
            <pre className="ntl-result-text">{placeholder}</pre>
            {!online && (
              <span className="ntl-detail-soon-tag" data-testid="network-tool-soon-tag">
                即将推出 · Phase {tool.phase}
              </span>
            )}
          </div>
        }
      >
        <div className="ntl-detail-input-hint" data-testid="network-tool-input-slot">
          <p>
            工具 ID：<code>{tool.id}</code>
          </p>
          <p>
            分类：<code>{tool.category}</code> · Phase {tool.phase}
          </p>
          <p className="ntl-detail-input-muted">
            {online
              ? '输入区将在具体工具 Story 中接入表单控件。'
              : '该阶段工具尚未上线，表单暂不可用。'}
          </p>
        </div>
      </NetworkToolLayout>
    </ToolChrome>
  );
};

export default NetworkToolPage;
