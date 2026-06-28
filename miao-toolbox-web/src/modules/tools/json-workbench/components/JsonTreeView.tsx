import { memo, useCallback, useState } from 'react';
import {
  CaretRightOutlined,
  CaretDownOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { Dropdown, message, Tooltip } from 'antd';
import type { JsonNode, ParseError } from '../types';

// ─── 类型徽标配色 ──────────────────────────────────────

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  object:  { label: 'obj',  className: 'jw-badge jw-badge--object' },
  array:   { label: 'arr',  className: 'jw-badge jw-badge--array' },
  string:  { label: 'str',  className: 'jw-badge jw-badge--string' },
  number:  { label: 'num',  className: 'jw-badge jw-badge--number' },
  boolean: { label: 'bool', className: 'jw-badge jw-badge--boolean' },
  null:    { label: 'null', className: 'jw-badge jw-badge--null' },
};

// ─── 值展示 ────────────────────────────────────────────

/** 截断阈值 */
const VALUE_TRUNCATE_LEN = 200;

function ValueDisplay({ node, isExpanded }: { node: JsonNode; isExpanded: boolean }) {
  const { type, value, childrenCount } = node;

  // 折叠的 object/array 显示子节点数量
  if (!isExpanded) {
    if (type === 'object') {
      return <span className="jw-node__value jw-node__value--collapsed">{`{${childrenCount} key${childrenCount !== 1 ? 's' : ''}}`}</span>;
    }
    if (type === 'array') {
      return <span className="jw-node__value jw-node__value--collapsed">{`[${childrenCount} item${childrenCount !== 1 ? 's' : ''}]`}</span>;
    }
  }

  // 展开的空 object/array
  if (type === 'object' && childrenCount === 0) {
    return <span className="jw-node__value jw-node__value--empty">{'{ }'}</span>;
  }
  if (type === 'array' && childrenCount === 0) {
    return <span className="jw-node__value jw-node__value--empty">[]</span>;
  }

  // 原始值
  if (type === 'string') {
    const str = String(value);
    const truncated = str.length > VALUE_TRUNCATE_LEN;
    const display = truncated ? str.slice(0, VALUE_TRUNCATE_LEN) + '…' : str;

    if (truncated) {
      return (
        <LongValueTooltip fullValue={str}>
          <span className="jw-node__value jw-node__value--string jw-node__value--truncated">
            &quot;{display}&quot;
          </span>
        </LongValueTooltip>
      );
    }

    return <span className="jw-node__value jw-node__value--string">&quot;{display}&quot;</span>;
  }
  if (type === 'number') {
    return <span className="jw-node__value jw-node__value--number">{String(value)}</span>;
  }
  if (type === 'boolean') {
    return <span className="jw-node__value jw-node__value--boolean">{String(value)}</span>;
  }
  if (type === 'null') {
    return <span className="jw-node__value jw-node__value--null">null</span>;
  }

  // 展开的 object/array 不显示值（子节点会在下方）
  return null;
}

// ─── 长值 Tooltip ──────────────────────────────────────

function LongValueTooltip({ fullValue, children }: { fullValue: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(fullValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [fullValue]);

  // 截断显示的预览
  const preview = fullValue.length > 500 ? fullValue.slice(0, 500) + '…' : fullValue;

  return (
    <Tooltip
      overlayClassName="jw-value-tooltip"
      title={
        <div className="jw-value-tooltip__content">
          <pre className="jw-value-tooltip__pre">{preview}</pre>
          <button className="jw-value-tooltip__copy" onClick={handleCopy}>
            <CopyOutlined /> {copied ? '已复制' : '复制'}
          </button>
        </div>
      }
      placement="topLeft"
      mouseEnterDelay={0.3}
    >
      {children}
    </Tooltip>
  );
}

// ─── 节点行 ────────────────────────────────────────────

interface JsonNodeRowProps {
  node: JsonNode;
  isExpanded: boolean;
  isSelected: boolean;
  isSearchMatch: boolean;
  onToggle: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  onExpandAll: (nodeId: string) => void;
  onCollapseAll: (nodeId: string) => void;
}

const JsonNodeRow = memo(function JsonNodeRow({
  node,
  isExpanded,
  isSelected,
  isSearchMatch,
  onToggle,
  onSelect,
  onExpandAll,
  onCollapseAll,
}: JsonNodeRowProps) {
  const hasChildren = node.type === 'object' || node.type === 'array';
  const badge = TYPE_BADGE[node.type];

  const handleRowClick = useCallback(() => {
    onSelect(node.id);
  }, [node.id, onSelect]);

  const handleArrowClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (hasChildren) {
        onToggle(node.id);
      }
    },
    [node.id, hasChildren, onToggle],
  );

  const handleCopyPath = useCallback(async () => {
    await navigator.clipboard.writeText(node.id);
    message.success('路径已复制');
  }, [node.id]);

  const handleCopyValue = useCallback(async () => {
    const text = node.type === 'string' ? String(node.value) : JSON.stringify(node.value, null, 2);
    await navigator.clipboard.writeText(text);
    message.success('值已复制');
  }, [node.value, node.type]);

  // 右键菜单
  const contextMenuItems = [
    { key: 'expand-all', label: '展开全部', disabled: !hasChildren },
    { key: 'collapse-all', label: '折叠全部', disabled: !hasChildren },
    { type: 'divider' as const, key: 'd1' },
    { key: 'copy-path', label: '复制路径', icon: <CopyOutlined /> },
    { key: 'copy-value', label: '复制值', icon: <CopyOutlined /> },
  ];

  const handleContextMenuClick = useCallback(
    ({ key }: { key: string }) => {
      switch (key) {
        case 'expand-all':
          onExpandAll(node.id);
          break;
        case 'collapse-all':
          onCollapseAll(node.id);
          break;
        case 'copy-path':
          handleCopyPath();
          break;
        case 'copy-value':
          handleCopyValue();
          break;
      }
    },
    [node.id, onExpandAll, onCollapseAll, handleCopyPath, handleCopyValue],
  );

  return (
    <Dropdown menu={{ items: contextMenuItems, onClick: handleContextMenuClick }} trigger={['contextMenu']}>
      <div
        className={[
          'jw-node-row',
          isSelected && 'jw-node-row--selected',
          isSearchMatch && 'jw-node-row--search-match',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ paddingLeft: node.depth * 20 + 8 }}
        onClick={handleRowClick}
      >
        {/* 展开/折叠箭头 */}
        <span className="jw-node-row__arrow" onClick={handleArrowClick}>
          {hasChildren ? (
            isExpanded ? (
              <CaretDownOutlined />
            ) : (
              <CaretRightOutlined />
            )
          ) : (
            <span className="jw-node-row__arrow-placeholder" />
          )}
        </span>

        {/* Key */}
        {node.id !== '$' && (
          <span className="jw-node-row__key">{node.key}</span>
        )}

        {/* 冒号 */}
        {node.id !== '$' && <span className="jw-node-row__colon">: </span>}

        {/* 值 */}
        <ValueDisplay node={node} isExpanded={isExpanded} />

        {/* 类型徽标 */}
        {badge && <span className={badge.className}>{badge.label}</span>}
      </div>
    </Dropdown>
  );
});

// ─── 树形视图 ──────────────────────────────────────────

interface JsonTreeViewProps {
  nodes: JsonNode[];
  expandedIds: Set<string>;
  selectedNodeId: string | null;
  onToggle: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  onExpandAll: (nodeId: string) => void;
  onCollapseAll: (nodeId: string) => void;
  searchResults: string[];
  parseError: ParseError | null;
}

export default function JsonTreeView({
  nodes,
  expandedIds,
  selectedNodeId,
  onToggle,
  onSelect,
  onExpandAll,
  onCollapseAll,
  searchResults,
  parseError,
}: JsonTreeViewProps) {
  const searchSet = new Set(searchResults);

  // 解析错误展示
  if (parseError) {
    return (
      <div className="jw-tree-panel">
        <div className="jw-parse-error">
          <div className="jw-parse-error__icon">⚠️</div>
          <div className="jw-parse-error__message">{parseError.message}</div>
          {parseError.line !== undefined && (
            <div className="jw-parse-error__location">
              行 {parseError.line}{parseError.column ? `, 列 ${parseError.column}` : ''}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 空状态
  if (nodes.length === 0) {
    return (
      <div className="jw-tree-panel">
        <div className="jw-empty-state">
          <svg className="jw-empty-state__icon-svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="12" y="8" width="40" height="48" rx="4" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M24 20 L22 22 L24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M40 20 L42 22 L40 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="28" y1="22" x2="36" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
            <rect x="18" y="30" width="28" height="4" rx="2" fill="currentColor" opacity="0.15" />
            <rect x="18" y="38" width="22" height="4" rx="2" fill="currentColor" opacity="0.12" />
            <rect x="18" y="46" width="26" height="4" rx="2" fill="currentColor" opacity="0.1" />
          </svg>
          <p className="jw-empty-state__title">粘贴或输入 JSON 开始</p>
          <p className="jw-empty-state__hint">支持粘贴 JSON 文本、拖拽文件或输入 cURL 命令</p>
          <div className="jw-empty-state__example">
            <span className="jw-empty-state__example-label">试试粘贴这段示例：</span>
            <code className="jw-empty-state__example-code">{'{ "name": "Alice", "age": 30 }'}</code>
          </div>
        </div>
      </div>
    );
  }

  // 根据 expandedIds 过滤可见节点
  // 一个节点可见 = 所有祖先节点都已展开
  const visibleNodes: JsonNode[] = [];
  const visibleParentIds = new Set<string>(); // 已确认可见的节点 id
  for (const node of nodes) {
    if (node.parentId === null) {
      // 根节点始终可见
      visibleNodes.push(node);
      visibleParentIds.add(node.id);
      continue;
    }
    // 父节点可见 + 父节点已展开 → 当前节点可见
    if (visibleParentIds.has(node.parentId) && expandedIds.has(node.parentId)) {
      visibleNodes.push(node);
      visibleParentIds.add(node.id);
    }
  }

  return (
    <div className="jw-tree-panel jw-tree-panel--has-content">
      <div className="jw-tree-rows">
        {visibleNodes.map((node) => (
          <JsonNodeRow
            key={node.id}
            node={node}
            isExpanded={expandedIds.has(node.id)}
            isSelected={node.id === selectedNodeId}
            isSearchMatch={searchSet.has(node.id)}
            onToggle={onToggle}
            onSelect={onSelect}
            onExpandAll={onExpandAll}
            onCollapseAll={onCollapseAll}
          />
        ))}
      </div>
    </div>
  );
}
