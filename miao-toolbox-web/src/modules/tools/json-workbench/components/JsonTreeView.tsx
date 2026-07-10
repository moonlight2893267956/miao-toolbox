import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CaretRightOutlined,
  CaretDownOutlined,
  CopyOutlined,
  EnvironmentOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { Dropdown, Input, message, Tooltip } from 'antd';
import type { JsonNode, ParseError, SchemaError } from '../types';
import { getVisibleNodes } from '../utils/parseAndFlatten';

// ─── 错误信息分类 ──────────────────────────────────────

/**
 * 根据 V8 JSON.parse 错误信息提取友好中文标题与提示
 * 参考 https://v8.dev/features/error-cause
 */
function classifyError(message: string): { title: string; hint: string } {
  const lower = message.toLowerCase();
  if (lower.includes('bad control character')) {
    return {
      title: '字符串包含非法控制字符',
      hint: '字符串中不能直接出现换行/制表符等不可见字符,请使用 \\n、\\t 等转义符',
    };
  }
  if (lower.includes('unexpected end of json')) {
    return {
      title: 'JSON 内容不完整',
      hint: '可能缺少结尾的 } 或 ],或字符串/键名未闭合',
    };
  }
  if (lower.includes('unterminated string')) {
    return {
      title: '字符串未闭合',
      hint: '字符串必须使用双引号包裹并正确闭合',
    };
  }
  if (lower.includes('expected double-quoted property name')) {
    return {
      title: '对象键名格式错误',
      hint: '对象的键名必须使用双引号包裹,例如 {"name": "Alice"}',
    };
  }
  if (lower.includes('expected property name')) {
    return {
      title: '对象缺少键名',
      hint: '对象内必须是 "key": value 形式,不能遗漏键名',
    };
  }
  if (lower.includes("expected ',' or ']'")) {
    return {
      title: '数组格式错误',
      hint: '数组元素之间需要用英文逗号分隔,末尾不能有逗号',
    };
  }
  if (lower.includes("expected ',' or '}'")) {
    return {
      title: '对象格式错误',
      hint: '对象的键值对之间需要用英文逗号分隔,末尾不能有逗号',
    };
  }
  if (lower.includes('unexpected non-whitespace character after json')) {
    return {
      title: 'JSON 末尾有多余内容',
      hint: 'JSON 之后不能有额外的字符,请检查是否多粘贴了内容',
    };
  }
  if (lower.includes('invalid number')) {
    return {
      title: '数字格式错误',
      hint: '数字不能包含前导零、十六进制或非数字字符',
    };
  }
  if (lower.includes('unexpected token')) {
    return {
      title: 'JSON 语法错误',
      hint: '当前位置出现了非法的符号,可能是多余的逗号、缺失的引号或括号不匹配',
    };
  }
  if (lower.includes('duplicate key')) {
    return {
      title: '对象存在重复键名',
      hint: '同一对象内不允许出现重复的键名',
    };
  }
  return {
    title: 'JSON 解析失败',
    hint: '请检查 JSON 格式是否符合规范',
  };
}

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

  // 数组省略占位节点
  if (type === 'array-ellipsis') {
    return <span className="jw-node__value jw-node__value--ellipsis">…{node.ellipsisCount} more items</span>;
  }

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
  const timerRef = useRef<ReturnType<typeof setTimeout>>(0);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(fullValue);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [fullValue]);

  // 组件卸载时清理 timer
  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

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
  onEdit: (nodeId: string, newValue: string) => void;
  onKeyEdit: (nodeId: string, newKey: string) => void;
  schemaError?: SchemaError;
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
  onEdit,
  onKeyEdit,
  schemaError,
}: JsonNodeRowProps) {
  const hasChildren = node.type === 'object' || node.type === 'array';
  const isPrimitive = !hasChildren && node.type !== 'array-ellipsis';

  // ─── 内联编辑状态（value） ─────────────────────────
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // ─── 内联编辑状态（key） ───────────────────────────
  const [editingKey, setEditingKey] = useState(false);
  const [editKeyValue, setEditKeyValue] = useState('');
  const editKeyInputRef = useRef<HTMLInputElement>(null);
  // 可编辑键名：非根、非数组索引（[N] 格式）
  const canEditKey = node.id !== '$'
    && node.type !== 'array-ellipsis'
    && !/^\[\d+\]$/.test(node.key);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!isPrimitive) return;
    e.stopPropagation();
    // 统一使用 JSON.stringify 作为初始值：字符串会带引号显示，
    // 保证编辑输入始终是合法 JSON 文本，提交时用 JSON.parse 严格校验。
    const initial = JSON.stringify(node.value);
    setEditValue(initial);
    setEditing(true);
  }, [isPrimitive, node.value]);

  useEffect(() => {
    if (editing) {
      // 延迟聚焦，等 Input 挂载
      requestAnimationFrame(() => {
        editInputRef.current?.focus();
        editInputRef.current?.select();
      });
    }
  }, [editing]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    // 严格校验：必须是合法 JSON 值。否则回滚（保留原值）并提示。
    try {
      JSON.parse(editValue);
    } catch {
      message.warning('非法 JSON 值');
      return;
    }
    onEdit(node.id, editValue);
  }, [editValue, node.id, onEdit]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }, [commitEdit, cancelEdit]);

  // ─── key 编辑 ──────────────────────────────────────
  const handleKeyDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!canEditKey) return;
    e.stopPropagation();
    setEditKeyValue(node.key);
    setEditingKey(true);
  }, [canEditKey, node.key]);

  useEffect(() => {
    if (editingKey) {
      requestAnimationFrame(() => {
        editKeyInputRef.current?.focus();
        editKeyInputRef.current?.select();
      });
    }
  }, [editingKey]);

  const commitKeyEdit = useCallback(() => {
    setEditingKey(false);
    const trimmed = editKeyValue.trim();
    if (!trimmed) {
      message.warning('键名不能为空');
      return;
    }
    if (trimmed === node.key) return; // 无变化
    onKeyEdit(node.id, trimmed);
  }, [editKeyValue, node.id, node.key, onKeyEdit]);

  const cancelKeyEdit = useCallback(() => {
    setEditingKey(false);
  }, []);

  const handleKeyEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitKeyEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelKeyEdit();
    }
  }, [commitKeyEdit, cancelKeyEdit]);
  const badge = TYPE_BADGE[node.type];
  // 数组类型徽标显示长度：arr → arr[100]
  const badgeLabel = node.type === 'array' && node.childrenCount > 0
    ? `arr[${node.childrenCount}]`
    : badge?.label;

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
  const contextMenuItems = useMemo(() => [
    { key: 'expand-all', label: '展开全部', disabled: !hasChildren },
    { key: 'collapse-all', label: '折叠全部', disabled: !hasChildren },
    { type: 'divider' as const, key: 'd1' },
    { key: 'copy-path', label: '复制路径', icon: <CopyOutlined /> },
    { key: 'copy-value', label: '复制值', icon: <CopyOutlined /> },
  ], [hasChildren]);

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

        {/* Schema 错误指示 */}
        {schemaError && (
          <Tooltip title={schemaError.message}>
            <span
              className={`jw-node-row__schema-dot ${schemaError.severity === 'error' ? 'jw-node-row__schema-dot--error' : 'jw-node-row__schema-dot--warning'}`}
              onClick={(e) => e.stopPropagation()}
            />
          </Tooltip>
        )}

        {/* Key */}
        {node.id !== '$' && node.type !== 'array-ellipsis' && (
          editingKey ? (
            <Input
              ref={editKeyInputRef as React.Ref<any>}
              className="jw-node-row__edit-input jw-node-row__edit-input--key"
              value={editKeyValue}
              onChange={(e) => setEditKeyValue(e.target.value)}
              onKeyDown={handleKeyEditKeyDown}
              onBlur={commitKeyEdit}
              size="small"
              variant="borderless"
            />
          ) : (
            <span
              className={canEditKey ? 'jw-node-row__key jw-node-row__key--editable' : 'jw-node-row__key'}
              onDoubleClick={handleKeyDoubleClick}
              title={canEditKey ? '双击编辑键名' : undefined}
            >
              {node.key}
            </span>
          )
        )}

        {/* 冒号 */}
        {node.id !== '$' && node.type !== 'array-ellipsis' && <span className="jw-node-row__colon">: </span>}

        {/* 值（可双击编辑原始值） */}
        {editing ? (
          <Input
            ref={editInputRef as React.Ref<any>}
            className="jw-node-row__edit-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={commitEdit}
            size="small"
            variant="borderless"
          />
        ) : (
          <span
            className={isPrimitive ? 'jw-node-row__value-editable' : ''}
            onDoubleClick={handleDoubleClick}
            title={isPrimitive ? '双击编辑' : undefined}
          >
            <ValueDisplay node={node} isExpanded={isExpanded} />
          </span>
        )}

        {/* 展开全部按钮（仅 array-ellipsis 类型） */}
        {node.type === 'array-ellipsis' && (
          <button
            className="jw-ellipsis-expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              // ellipsis 节点的 parentId 就是数组节点的 id
              if (node.parentId) onExpandAll(node.parentId);
            }}
          >
            展开全部
          </button>
        )}

        {/* 类型徽标 */}
        {badge && <span className={badge.className}>{badgeLabel}</span>}
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
  onEdit: (nodeId: string, newValue: string) => void;
  onKeyEdit: (nodeId: string, newKey: string) => void;
  searchResults: string[];
  schemaErrors: SchemaError[];
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
  onEdit,
  onKeyEdit,
  searchResults,
  schemaErrors,
  parseError,
}: JsonTreeViewProps) {
  const searchSet = useMemo(() => new Set(searchResults), [searchResults]);
  const schemaErrorMap = useMemo(() => {
    const m = new Map<string, SchemaError>();
    for (const err of schemaErrors) m.set(err.path, err);
    return m;
  }, [schemaErrors]);

  // 空状态（避免空数组场景走虚拟滚动，但提前到这里避免影响 hook 顺序）
  const isEmpty = nodes.length === 0;

  // 根据 expandedIds 过滤可见节点：祖先全部展开的节点才可见
  const visibleNodes = useMemo(
    () => getVisibleNodes(nodes, expandedIds),
    [nodes, expandedIds],
  );

  // ─── 虚拟滚动（即使 error/empty 场景也初始化，保证 hook 数量不变） ───
  const scrollRef = useRef<HTMLDivElement>(null);

  // 展开/折叠前捕获 scrollTop，用于操作后恢复视口位置
  const savedScrollTopRef = useRef<number | null>(null);

  const virtualizer = useVirtualizer({
    count: visibleNodes.length,
    getScrollElement: () => scrollRef.current,
    // 行高估算：CSS .jw-node-row line-height:22px + padding ≈ 28px
    // 配合 measureElement 动态测量实际高度
    estimateSize: () => 28,
    overscan: 10,
  });

  // 在 toggle/expandAll/collapseAll 触发前捕获滚动位置
  // 关键：必须在 dispatch 之前读取 scrollTop，因为 React 状态更新后
  // 浏览器可能调整 scrollTop（内容高度变化），导致读到的是偏移后的值
  const captureScrollAndToggle = useCallback((nodeId: string) => {
    if (scrollRef.current) savedScrollTopRef.current = scrollRef.current.scrollTop;
    onToggle(nodeId);
  }, [onToggle]);

  const captureScrollAndExpandAll = useCallback((nodeId: string) => {
    if (scrollRef.current) savedScrollTopRef.current = scrollRef.current.scrollTop;
    onExpandAll(nodeId);
  }, [onExpandAll]);

  const captureScrollAndCollapseAll = useCallback((nodeId: string) => {
    if (scrollRef.current) savedScrollTopRef.current = scrollRef.current.scrollTop;
    onCollapseAll(nodeId);
  }, [onCollapseAll]);

  // 折叠/展开后恢复滚动位置
  // useLayoutEffect 在浏览器 paint 前同步执行，避免闪烁
  useLayoutEffect(() => {
    if (savedScrollTopRef.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop = savedScrollTopRef.current;
      savedScrollTopRef.current = null;
    }
  }, [expandedIds]);

  // 选中节点变化时自动滚动到可见区域
  const prevSelectedRef = useRef(selectedNodeId);
  useEffect(() => {
    if (
      selectedNodeId &&
      selectedNodeId !== prevSelectedRef.current &&
      visibleNodes.length > 0
    ) {
      const idx = visibleNodes.findIndex((n) => n.id === selectedNodeId);
      if (idx >= 0) {
        virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' });
      }
    }
    prevSelectedRef.current = selectedNodeId;
    // 仅在 selectedNodeId 变化时触发，避免展开/折叠导致非预期滚动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  // ─── 渲染分支（所有 hooks 已在上方完成调用） ────────

  // 解析错误展示
  if (parseError) {
    return <ParseErrorCard parseError={parseError} />;
  }

  // 空状态
  if (isEmpty) {
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

  return (
    <div ref={scrollRef} className="jw-tree-panel jw-tree-panel--has-content">
      <div
        className="jw-tree-rows"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          minWidth: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const node = visibleNodes[virtualRow.index];
          return (
            <div
              key={node.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 'max-content',
                minWidth: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <JsonNodeRow
                node={node}
                isExpanded={expandedIds.has(node.id)}
                isSelected={node.id === selectedNodeId}
                isSearchMatch={searchSet.has(node.id)}
                onToggle={captureScrollAndToggle}
                onSelect={onSelect}
                onExpandAll={captureScrollAndExpandAll}
                onCollapseAll={captureScrollAndCollapseAll}
                onEdit={onEdit}
                onKeyEdit={onKeyEdit}
                schemaError={schemaErrorMap.get(node.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 解析错误卡片 ──────────────────────────────────────

function ParseErrorCard({ parseError }: { parseError: ParseError }) {
  const { title, hint } = classifyError(parseError.message);
  const hasPos = parseError.line !== undefined || parseError.column !== undefined;

  const handleCopy = useCallback(async () => {
    const parts: string[] = [title, hint, parseError.message];
    if (hasPos) {
      parts.push(`位置: 行 ${parseError.line ?? '?'}, 列 ${parseError.column ?? '?'}`);
    }
    await navigator.clipboard.writeText(parts.join('\n'));
    message.success('错误信息已复制');
  }, [title, hint, parseError.message, parseError.line, parseError.column, hasPos]);

  return (
    <div className="jw-tree-panel">
      <div className="jw-parse-error">
        <div className="jw-parse-error__icon" aria-hidden="true">
          <WarningFilled />
        </div>
        <div className="jw-parse-error__body">
          <div className="jw-parse-error__title">{title}</div>
          <div className="jw-parse-error__hint">{hint}</div>
          <pre className="jw-parse-error__detail">{parseError.message}</pre>
          <div className="jw-parse-error__footer">
            {hasPos ? (
              <div className="jw-parse-error__location">
                <EnvironmentOutlined />
                {parseError.line !== undefined && (
                  <span className="jw-parse-error__pos-tag">行 {parseError.line}</span>
                )}
                {parseError.column !== undefined && (
                  <span className="jw-parse-error__pos-tag">列 {parseError.column}</span>
                )}
              </div>
            ) : (
              <span />
            )}
            <button className="jw-parse-error__copy" onClick={handleCopy} type="button">
              <CopyOutlined />
              复制错误
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
