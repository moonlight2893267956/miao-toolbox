import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Empty, Input, Spin, message } from 'antd';
import {
  GlobalOutlined,
  ArrowRightOutlined,
  SearchOutlined,
  CloseCircleFilled,
} from '@ant-design/icons';
import { listNetworkTools } from './services/networkService';
import {
  NETWORK_CATEGORY_LABELS,
  NETWORK_CATEGORY_ORDER,
  isNetworkToolOnline,
  type NetworkToolMeta,
} from './types';
import { resolveNetworkIcon } from './utils/iconMap';
import { useTabs, isTabbable, makeTabKey } from '../../../contexts/TabContext';
import './network.css';

type PhaseFilter = 'all' | '1' | '2' | '3';

const PHASE_OPTIONS: { value: PhaseFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: '1', label: 'Phase 1' },
  { value: '2', label: 'Phase 2' },
  { value: '3', label: 'Phase 3' },
];

/** 名称 / 描述 / id / 分类 / 路由 模糊匹配 */
function toolMatchesQuery(tool: NetworkToolMeta, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const catLabel = (NETWORK_CATEGORY_LABELS[tool.category] ?? tool.category).toLowerCase();
  const hay = [
    tool.name,
    tool.description,
    tool.id,
    tool.category,
    catLabel,
    tool.route,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  // 支持空格分词：全部命中
  return q.split(/\s+/).every((token) => hay.includes(token));
}

const NetworkToolList: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { openTab } = useTabs();
  const [tools, setTools] = useState<NetworkToolMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listNetworkTools();
      setTools(data);
    } catch {
      message.error('加载网络工具列表失败');
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* 页面挂载时加载数据并确保自身 Tab 已创建 */
  useEffect(() => {
    void load();
    if (!isTabbable(location.pathname)) return;
    const key = makeTabKey(location.pathname);
    openTab({
      key,
      label: '网络工具箱',
      path: location.pathname,
      icon: <GlobalOutlined />,
      closable: true,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let list = tools;
    if (phaseFilter !== 'all') {
      const phase = Number(phaseFilter);
      list = list.filter((t) => t.phase === phase);
    }
    if (search.trim()) {
      list = list.filter((t) => toolMatchesQuery(t, search));
    }
    return list;
  }, [tools, phaseFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, NetworkToolMeta[]>();
    for (const tool of filtered) {
      const list = map.get(tool.category) ?? [];
      list.push(tool);
      map.set(tool.category, list);
    }
    const ordered: { category: string; label: string; items: NetworkToolMeta[] }[] = [];
    for (const cat of NETWORK_CATEGORY_ORDER) {
      const items = map.get(cat);
      if (items?.length) {
        ordered.push({
          category: cat,
          label: NETWORK_CATEGORY_LABELS[cat] ?? cat,
          items,
        });
        map.delete(cat);
      }
    }
    for (const [cat, items] of map) {
      ordered.push({
        category: cat,
        label: NETWORK_CATEGORY_LABELS[cat] ?? cat,
        items,
      });
    }
    return ordered;
  }, [filtered]);

  const handleOpen = (tool: NetworkToolMeta) => {
    const route = tool.route || `/tools/network/${tool.category}/${tool.id}`;
    if (isTabbable(route)) {
      openTab({
        key: makeTabKey(route),
        label: tool.name,
        path: route,
        icon: resolveNetworkIcon(tool.icon),
        closable: true,
      });
    }
    navigate(route);
  };

  const onlineCount = useMemo(
    () => tools.filter((t) => isNetworkToolOnline(t.phase)).length,
    [tools],
  );

  const hasActiveFilter = phaseFilter !== 'all' || search.trim().length > 0;

  const clearFilters = () => {
    setSearch('');
    setPhaseFilter('all');
  };

  return (
    <div className="ntl-page" data-testid="network-tool-list">
      <header className="ntl-header">
        <div className="ntl-header-inner">
          <div className="ntl-header-icon">
            <GlobalOutlined />
          </div>
          <div className="ntl-header-text">
            <h2>网络工具箱</h2>
            <div className="ntl-header-subtitle">
              <span className="ntl-dot" />
              编码转换 · 网络诊断 · API 调试 · AI 助手
            </div>
          </div>
          {!loading && tools.length > 0 && (
            <div className="ntl-header-meta">
              <span className="ntl-header-stat">
                共 <strong>{tools.length}</strong> 个工具
              </span>
              <span className="ntl-header-stat">
                已开放 <strong>{onlineCount}</strong>
              </span>
              {hasActiveFilter && (
                <span className="ntl-header-stat" data-testid="network-filter-hit-count">
                  匹配 <strong>{filtered.length}</strong>
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="ntl-filter-bar" data-testid="network-phase-filter">
        <div className="ntl-search-wrap">
          <Input
            allowClear
            size="middle"
            prefix={<SearchOutlined className="ntl-search-icon" />}
            placeholder="搜索工具：Cookie、Base64、DNS、哈希…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="network-tool-search"
            className="ntl-search-input"
            spellCheck={false}
          />
        </div>
        <div className="ntl-filter-phase">
          <span className="ntl-filter-label">阶段</span>
          <div className="ntl-phase-chips" role="tablist" aria-label="按阶段筛选">
            {PHASE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={phaseFilter === opt.value}
                className={`ntl-phase-chip${phaseFilter === opt.value ? ' ntl-phase-chip--active' : ''}`}
                onClick={() => setPhaseFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {hasActiveFilter && (
          <button
            type="button"
            className="ntl-filter-clear"
            onClick={clearFilters}
            data-testid="network-filter-clear"
          >
            <CloseCircleFilled /> 清除筛选
          </button>
        )}
      </div>

      {loading ? (
        <div className="ntl-list-loading" data-testid="network-tool-list-loading">
          <Spin size="large" />
          <span>加载工具目录…</span>
        </div>
      ) : grouped.length === 0 ? (
        <div className="ntl-list-empty" data-testid="network-tool-list-empty">
          <Empty
            description={
              hasActiveFilter
                ? `没有匹配「${search.trim() || `Phase ${phaseFilter}`}」的工具`
                : '暂无工具'
            }
          >
            {hasActiveFilter ? (
              <button type="button" className="ntl-filter-clear ntl-filter-clear--primary" onClick={clearFilters}>
                清除筛选
              </button>
            ) : null}
          </Empty>
        </div>
      ) : (
        <div className="ntl-list-body">
          {grouped.map((group) => (
            <section
              key={group.category}
              className="ntl-list-group"
              data-category={group.category}
              data-testid={`network-category-${group.category}`}
            >
              <h3 className="ntl-list-group-title">
                <span className="ntl-list-group-bar" aria-hidden />
                {group.label}
                <span className="ntl-list-group-count">{group.items.length}</span>
              </h3>
              <div className="ntl-list-grid">
                {group.items.map((tool) => {
                  const online = isNetworkToolOnline(tool.phase);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      className={`ntl-tool-card${online ? '' : ' ntl-tool-card--soon'}`}
                      data-testid={`network-tool-card-${tool.id}`}
                      data-phase={tool.phase}
                      data-online={online ? '1' : '0'}
                      onClick={() => handleOpen(tool)}
                    >
                      <div className="ntl-tool-card-top">
                        <span className="ntl-tool-card-icon">{resolveNetworkIcon(tool.icon)}</span>
                        <span
                          className={`ntl-tool-card-badge${online ? ' ntl-tool-card-badge--live' : ' ntl-tool-card-badge--soon'}`}
                          data-testid={online ? undefined : `network-soon-${tool.id}`}
                        >
                          {online ? `P${tool.phase}` : '即将推出'}
                        </span>
                      </div>
                      <div className="ntl-tool-card-body">
                        <h4>{tool.name}</h4>
                        <p>{tool.description}</p>
                      </div>
                      <div className="ntl-tool-card-footer">
                        <span>{online ? '打开工具' : '查看说明'}</span>
                        <ArrowRightOutlined />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default NetworkToolList;
