/**
 * 字段搜索栏
 *
 * Story 2.4: 支持按 key/value/regex 搜索 JSON 中所有匹配项，
 * 高亮匹配行、结果列表点击跳转、"折叠其他"一键折叠非匹配节点。
 */
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Input, Button, Tooltip } from 'antd';
import type { InputRef } from 'antd';
import { SearchOutlined, CloseOutlined, ShrinkOutlined } from '@ant-design/icons';
import type { SearchMode } from '../types';

export interface SearchBarRef {
  focus: () => void;
}

interface SearchBarProps {
  query: string;
  mode: SearchMode;
  resultIds: string[];
  flatNodeList: Array<{ id: string; key: string; value?: unknown; type?: string }>;
  hasData: boolean;
  onQueryChange: (query: string) => void;
  onModeChange: (mode: SearchMode) => void;
  onResultClick: (nodeId: string) => void;
  onCollapseOthers: () => void;
  onClear: () => void;
}

const SearchBar = forwardRef<SearchBarRef, SearchBarProps>(function SearchBar(
  {
    query,
    mode,
    resultIds,
    flatNodeList,
    hasData,
    onQueryChange,
    onModeChange,
    onResultClick,
    onCollapseOthers,
    onClear,
  },
  ref,
) {
  const inputRef = useRef<InputRef>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }), []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClear();
      inputRef.current?.blur();
    }
  }, [onClear]);

  const hasResults = resultIds.length > 0;
  const showBar = hasData;

  // 预建 Map 避免 O(n) find()
  const nodeMap = useMemo(
    () => new Map(flatNodeList.map((n) => [n.id, n])),
    [flatNodeList],
  );

  if (!showBar) return null;

  return (
    <div className="jw-search-bar">
      {/* 工具栏: 输入框(集成模式切换) + 折叠其他 */}
      <div className="jw-search-bar__toolbar">
        <Input
          ref={inputRef}
          className="jw-search-bar__input"
          placeholder="搜索键名 / 值 / 正则…  (Ctrl+F)"
          prefix={<SearchOutlined className="jw-search-bar__prefix-icon" />}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          allowClear={{ clearIcon: <CloseOutlined /> }}
          suffix={
            <span className="jw-search-bar__mode-pills">
              {(['key', 'value', 'regex'] as SearchMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`jw-search-bar__pill ${mode === m ? 'jw-search-bar__pill--active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onModeChange(m);
                  }}
                  title={m === 'key' ? '键名搜索' : m === 'value' ? '值搜索' : '正则搜索'}
                >
                  {m === 'key' ? '键名' : m === 'value' ? '值' : '正则'}
                </button>
              ))}
            </span>
          }
        />
        <Tooltip title="折叠所有非匹配项">
          <Button
            className="jw-search-bar__action"
            icon={<ShrinkOutlined />}
            disabled={!hasResults}
            onClick={onCollapseOthers}
          >
            折叠其他
          </Button>
        </Tooltip>
      </div>

      {/* 状态行 + 结果列表 */}
      {query.trim() && (
        <div className="jw-search-bar__status">
          <span className="jw-search-bar__count">
            {hasResults
              ? <>找到 <strong>{resultIds.length}</strong> 个匹配</>
              : <span className="jw-search-bar__count--empty">无匹配项</span>
            }
          </span>
          {hasResults && (
            <span className="jw-search-bar__result-list">
              {resultIds.slice(0, 8).map((nodeId) => {
                const node = nodeMap.get(nodeId);
                // 节点可能在折叠数组中 → flatNodeList 中没有 → node 为 undefined
                const displayKey = node?.key ?? extractKeyFromPath(nodeId);
                const valueStr = node ? formatValuePreview(node.value, node.type) : '';
                return (
                  <button
                    key={nodeId}
                    className="jw-search-bar__chip"
                    onClick={() => onResultClick(nodeId)}
                    title={nodeId}
                  >
                    {displayKey && <span className="jw-search-bar__chip-key">{displayKey}</span>}
                    <code className="jw-search-bar__chip-path">{shortenPath(nodeId)}</code>
                    {valueStr && <span className="jw-search-bar__chip-value">{valueStr}</span>}
                  </button>
                );
              })}
              {resultIds.length > 8 && (
                <span className="jw-search-bar__chip-more">…+{resultIds.length - 8}</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default SearchBar;

// ─── 工具函数 ──────────────────────────────────────────

/** 从 JSONPath 提取 key（fallback 用于折叠数组中被隐藏的节点） */
function extractKeyFromPath(path: string): string {
  if (path === '$') return 'root';
  const arrayMatch = path.match(/\[(\d+)\]$/);
  if (arrayMatch) return `[${arrayMatch[1]}]`;
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex >= 0) return path.slice(dotIndex + 1);
  return path;
}

/** 缩短路径显示: $.data.users[3].name → data.users[3].name */
function shortenPath(path: string): string {
  if (path.startsWith('$.')) return path.slice(2);
  return path;
}

/** 格式化值预览: 截断长字符串、对象只显示类型 */
function formatValuePreview(value: unknown, type: string | undefined): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (type === 'object') return '{…}';
  if (type === 'array') return '[…]';
  const str = typeof value === 'string' ? `"${value}"` : String(value);
  return str.length > 32 ? str.slice(0, 32) + '…' : str;
}
