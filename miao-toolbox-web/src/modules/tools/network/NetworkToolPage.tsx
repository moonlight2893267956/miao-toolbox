/**
 * 网络工具详情页（动态路由）
 * 路径：/tools/network/:category/:toolId
 *
 * 壳层：限宽内容列 + 面包屑；业务工具按 toolId 懒加载。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
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
  const navigate = useNavigate();
  const { openTab, updateTab } = useTabs();
  const [tool, setTool] = useState<NetworkToolMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  /* KeepAlive 模式下，React Router 上下文是共享的（所有缓存实例的
     useParams/useLocation 都返回当前路由的值），所以必须用 useRef 锁定
     每个实例自己的「挂载时路径」和「首次完成」状态，避免：
     1) 切到其他 Tab 时本实例的 useEffect 被错误触发，重新拉取数据
        覆盖原 tool 状态；
     2) 再切回时闭包里残留旧 tool，updateTab 拿旧 tool.name 覆盖
        本路径 Tab 的标题。 */
  const dataLoadedRef = useRef(false);
  const instancePathRef = useRef(location.pathname);
  const tabCreatedRef = useRef(false);
  /* 锁定本实例挂载时的 category / toolId，避免 KeepAlive 共享上下文
     导致切到其他 Tab 时 useParams 返回新值触发重新 fetch */
  const instanceCategoryRef = useRef(category);
  const instanceToolIdRef = useRef(toolId);

  const goBack = useCallback(() => {
    navigate('/tools/network');
  }, [navigate]);

  /* 数据加载：每个 KeepAlive 实例只在挂载时执行一次。
     关键修复：dataLoadedRef 在 fetch 成功完成后才设为 true，
     避免 cleanup cancelled 后 dataLoadedRef 已锁定导致永远无法重试。 */
  useEffect(() => {
    if (dataLoadedRef.current) return;
    setLoading(true);
    setNotFound(false);
    let cancelled = false;
    listNetworkTools()
      .then((tools) => {
        if (cancelled) return;
        const cat = instanceCategoryRef.current;
        const tid = instanceToolIdRef.current;
        const found = tools.find((t) => t.id === tid && t.category === cat) ?? null;
        setTool(found);
        setNotFound(!found);
        // 仅在成功拿到数据后才标记为已加载
        dataLoadedRef.current = true;
      })
      .catch(() => {
        if (cancelled) return;
        setNotFound(true);
        // 失败也标记已加载，避免无限重试
        dataLoadedRef.current = true;
      })
      .finally(() => {
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Tab 创建/更新：用本实例的 instancePathRef.current 而非共享的
     location.pathname，避免切到其他 Tab 后被错误触发时覆盖其他 Tab。 */
  useEffect(() => {
    if (tabCreatedRef.current || !tool) return;
    const path = instancePathRef.current;
    if (!isTabbable(path)) return;
    const key = makeTabKey(path);
    const icon = resolveNetworkIcon(tool.icon);
    tabCreatedRef.current = true;
    // 创建 Tab；如果 AppLayout 刷新恢复已创建了占位 Tab，这里用
    // updateTab 把标题/图标修正为工具真实名称。
    openTab({ key, label: tool.name, path, icon, closable: true });
    updateTab(key, { label: tool.name, icon });
  }, [tool, openTab, updateTab]);

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
    ? `「${tool.name}」即将完善，敬请期待。`
    : `「${tool.name}」即将推出，敬请期待。`;

  return (
    <ToolChrome tool={tool}>
      <NetworkToolLayout
        title={tool.name}
        icon={resolveNetworkIcon(tool.icon)}
        description={tool.description}
        showSubmit={false}
        resultText={placeholder}
        headerExtra={
          !online ? (
            <span className="ntl-tool-card-badge ntl-tool-card-badge--soon">即将推出</span>
          ) : null
        }
        result={
          <div className="ntl-detail-placeholder" data-testid="network-tool-placeholder">
            <p className="ntl-detail-placeholder-title">
              {online ? '功能完善中' : '即将推出'}
            </p>
            <pre className="ntl-result-text">{placeholder}</pre>
            {!online && (
              <span className="ntl-detail-soon-tag" data-testid="network-tool-soon-tag">
                即将推出
              </span>
            )}
          </div>
        }
      >
        <div className="ntl-detail-input-hint" data-testid="network-tool-input-slot">
          <p className="ntl-detail-input-muted">
            {online ? '该工具能力正在完善，稍后即可使用。' : '该工具尚未开放，上线后可在此使用。'}
          </p>
        </div>
      </NetworkToolLayout>
    </ToolChrome>
  );
};

export default NetworkToolPage;
