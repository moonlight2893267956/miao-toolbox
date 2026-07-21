import { useReducer, useCallback, useRef, useState, useEffect, useMemo } from 'react';
import {
  CopyOutlined,
  SwapOutlined,
  UploadOutlined,
  EditOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { message, Tooltip, Dropdown, Modal, Input } from 'antd';
import type { MenuProps } from 'antd';
import type {
  JsonNode,
  JsonWorkbenchState,
  JsonWbAction,
  ViewMode,
  SearchMode,
} from './types';
import { useJsonParser } from './hooks/useJsonParser';
import { getAllDescendantIds, renameKeyAtPath, setValueAtPath } from './utils/parseAndFlatten';
import { jsonRepair } from './utils/jsonRepair';
import { parseJsonPathToSegments, getAncestorPaths } from './utils/breadcrumb';
import { computeSearchResults } from './utils/search';
import { validateBySchema } from './utils/schemaValidate';
import { compressAndEscapeJson, inspectEscapedJsonString, unescapeJsonString } from './utils/jsonEscape';
import { inferSchemaFromValue, SAMPLE_SCHEMA } from './utils/inferSchema';
import JsonTreeView from './components/JsonTreeView';
import JsonRawEditor from './components/JsonRawEditor';
import Breadcrumb from './components/Breadcrumb';
import SearchBar from './components/SearchBar';
import RepairPreviewModal from './components/RepairPreviewModal';
import AiRepairModal from './components/AiRepairModal';
import { useAiRepair } from './hooks/useAiRepair';
import ToolPageHeader from '../../../components/shared/ToolPageHeader';
import { loadPageState, savePageState } from '../../../shared/utils/tabPageStorage';
import './json-workbench.css';

// ─── 初始状态 ──────────────────────────────────────────

const PAGE_KEY = 'tools-json-workbench';

const initialState: JsonWorkbenchState = {
  rawJson: '',
  parsedJson: null,
  flatNodeList: [],
  parseError: null,
  viewMode: 'split',
  expandedIds: new Set(),
  selectedNodeId: null,
  searchQuery: '',
  searchResults: [],
  searchMode: 'key',
  schemaJson: null,
  schemaErrors: [],
  isLargeFile: false,
  parseProgress: 0,
  aiLoading: false,
  aiResult: null,
  indentSize: 2,
  repairPreview: null,
  repairError: null,
  largeFileHintDismissed: false,
};

/** 仅恢复可序列化的编辑偏好与原文；解析树在 mount 后由 parse 重算 */
function loadInitialJsonState(): JsonWorkbenchState {
  const loaded = loadPageState<{
    rawJson?: string;
    viewMode?: ViewMode;
    indentSize?: 2 | 4;
    schemaJson?: string | null;
    searchQuery?: string;
    searchMode?: SearchMode;
  }>(PAGE_KEY);
  if (!loaded) return initialState;
  return {
    ...initialState,
    rawJson: typeof loaded.rawJson === 'string' ? loaded.rawJson : '',
    viewMode:
      loaded.viewMode === 'tree' || loaded.viewMode === 'raw' || loaded.viewMode === 'split'
        ? loaded.viewMode
        : 'split',
    indentSize: loaded.indentSize === 4 ? 4 : 2,
    schemaJson: typeof loaded.schemaJson === 'string' ? loaded.schemaJson : null,
    searchQuery: typeof loaded.searchQuery === 'string' ? loaded.searchQuery : '',
    searchMode:
      loaded.searchMode === 'key' ||
      loaded.searchMode === 'value' ||
      loaded.searchMode === 'regex'
        ? loaded.searchMode
        : 'key',
  };
}

// ─── Reducer ───────────────────────────────────────────

function getDefaultExpandedIds(flatNodes: JsonNode[]): Set<string> {
  return new Set(
    flatNodes
      .filter((n) => n.isExpanded && (n.type === 'object' || n.type === 'array'))
      .map((n) => n.id),
  );
}

function preserveExistingExpandedIds(expandedIds: Set<string>, flatNodes: JsonNode[]): Set<string> {
  const expandableIds = new Set(
    flatNodes
      .filter((n) => n.type === 'object' || n.type === 'array')
      .map((n) => n.id),
  );

  return new Set([...expandedIds].filter((id) => expandableIds.has(id)));
}

function jsonWbReducer(state: JsonWorkbenchState, action: JsonWbAction): JsonWorkbenchState {
  switch (action.type) {
    case 'JSON_WB_SET_RAW':
      return { ...state, rawJson: action.payload };
    case 'JSON_WB_PARSE_SUCCESS': {
      const nodeIds = new Set(action.payload.flatNodes.map((n) => n.id));
      return {
        ...state,
        parsedJson: action.payload.parsed,
        flatNodeList: action.payload.flatNodes,
        parseError: null,
        parseProgress: 0,
        isLargeFile: false,
        expandedIds: action.payload.preserveExpandedIds && state.flatNodeList.length > 0
          ? preserveExistingExpandedIds(state.expandedIds, action.payload.flatNodes)
          : getDefaultExpandedIds(action.payload.flatNodes),
        selectedNodeId: state.selectedNodeId && nodeIds.has(state.selectedNodeId)
          ? state.selectedNodeId
          : null,
      };
    }
    case 'JSON_WB_PARSE_ERROR':
      return { ...state, parseError: action.payload, parseProgress: 0, isLargeFile: false };
    case 'JSON_WB_TOGGLE_NODE': {
      const next = new Set(state.expandedIds);
      if (next.has(action.payload)) {
        next.delete(action.payload);
      } else {
        next.add(action.payload);
      }
      return { ...state, expandedIds: next };
    }
    case 'JSON_WB_SELECT_NODE':
      return { ...state, selectedNodeId: action.payload };
    case 'JSON_WB_SET_SEARCH':
      return {
        ...state,
        searchQuery: action.payload.query,
        searchMode: action.payload.mode,
      };
    case 'JSON_WB_SET_SEARCH_RESULTS':
      return { ...state, searchResults: action.payload };
    case 'JSON_WB_COLLAPSE_NON_MATCHES': {
      // 折叠所有非匹配节点，但保持匹配节点及其祖先可见
      const matchSet = new Set(action.payload);
      // 收集所有匹配节点的祖先路径
      const ancestorSet = new Set<string>();
      for (const matchId of matchSet) {
        const ancestors = getAncestorPaths(matchId);
        for (const a of ancestors) ancestorSet.add(a);
      }
      // 预建 Map 避免 O(n²) find()
      const nodeMap = new Map(state.flatNodeList.map((n) => [n.id, n]));
      return {
        ...state,
        expandedIds: new Set([...matchSet, ...ancestorSet].filter(
          (id) => {
            const n = nodeMap.get(id);
            return n && (n.type === 'object' || n.type === 'array');
          },
        )),
      };
    }
    case 'JSON_WB_SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };
    case 'JSON_WB_SET_SCHEMA':
      return { ...state, schemaJson: action.payload };
    case 'JSON_WB_SET_SCHEMA_ERRORS':
      return { ...state, schemaErrors: action.payload };
    case 'JSON_WB_SET_AI_RESULT':
      return { ...state, aiResult: action.payload, aiLoading: false };
    case 'JSON_WB_SET_AI_LOADING':
      return { ...state, aiLoading: action.payload };
    case 'JSON_WB_SET_PARSE_PROGRESS':
      return { ...state, parseProgress: action.payload };
    case 'JSON_WB_SET_LARGE_FILE':
      return { ...state, isLargeFile: action.payload };
    case 'JSON_WB_EXPAND_ALL': {
      const nodeId = action.payload;
      const descendantIds = getAllDescendantIds(state.flatNodeList, nodeId);
      const next = new Set(state.expandedIds);
      const expandableSet = new Set(
        state.flatNodeList
          .filter((n) => n.type === 'object' || n.type === 'array')
          .map((n) => n.id),
      );
      for (const id of descendantIds) {
        if (expandableSet.has(id)) next.add(id);
      }
      next.add(nodeId);
      return { ...state, expandedIds: next };
    }
    case 'JSON_WB_COLLAPSE_ALL': {
      const nodeId = action.payload;
      const descendantIds = getAllDescendantIds(state.flatNodeList, nodeId);
      const next = new Set(state.expandedIds);
      for (const id of descendantIds) next.delete(id);
      next.delete(nodeId);
      return { ...state, expandedIds: next };
    }
    case 'JSON_WB_ENSURE_EXPANDED': {
      const next = new Set(state.expandedIds);
      const expandableSet = new Set(
        state.flatNodeList
          .filter((n) => n.type === 'object' || n.type === 'array')
          .map((n) => n.id),
      );
      for (const id of action.payload) {
        if (expandableSet.has(id)) next.add(id);
      }
      return { ...state, expandedIds: next };
    }
    case 'JSON_WB_SET_INDENT_SIZE':
      return { ...state, indentSize: action.payload };
    case 'JSON_WB_REPAIR_SUCCESS':
      return { ...state, repairPreview: action.payload, repairError: null };
    case 'JSON_WB_REPAIR_FAIL':
      return { ...state, repairError: action.payload, repairPreview: null };
    case 'JSON_WB_SET_REPAIR_PREVIEW':
      return { ...state, repairPreview: action.payload, repairError: action.payload ? null : state.repairError };
    case 'JSON_WB_DISMISS_LARGE_FILE_HINT':
      return { ...state, largeFileHintDismissed: true };
    default:
      return state;
  }
}

// ─── 工具栏 ────────────────────────────────────────────

function Toolbar({ viewMode, onViewModeChange, hasData, hasRawInput, canFormat, isEscapedJson, indentSize, onFormat, onCompress, onEscapeCompact, onUnescape, onIndentChange, showError, onRepair, onCopyPretty, onCopyCompact, hasSchema, onSchemaClear, parseProgress, fileSize, schemaMenuItems }: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  hasData: boolean;
  hasRawInput: boolean;
  canFormat: boolean;
  isEscapedJson: boolean;
  indentSize: 2 | 4;
  onFormat: () => void;
  onCompress: () => void;
  onEscapeCompact: () => void;
  onUnescape: () => void;
  onIndentChange: (size: 2 | 4) => void;
  showError: boolean;
  onRepair: () => void;
  onCopyPretty: () => void;
  onCopyCompact: () => void;
  hasSchema: boolean;
  onSchemaClear: () => void;
  parseProgress: number;
  fileSize: number;
  schemaMenuItems: MenuProps['items'];
}) {
  return (
    <div className="jw-toolbar">
      <div className="jw-toolbar__left">
        {hasData && !showError && parseProgress === 0 && (
          <span className="jw-toolbar__status">已解析</span>
        )}
        {isEscapedJson && parseProgress === 0 && (
          <span className="jw-toolbar__status jw-toolbar__status--escaped">已转义</span>
        )}
        {showError && (
          <button className="jw-repair-btn" onClick={onRepair} title="优先使用规则修复，若无效则自动采用 AI 修复">
            修复
          </button>
        )}
        {(canFormat || hasRawInput) && parseProgress === 0 && (
          <div className="jw-format-group">
            <Tooltip title="格式化 (Ctrl+Shift+F)">
              <button className="jw-format-btn" onClick={onFormat} disabled={!canFormat}>
                格式化
              </button>
            </Tooltip>
            <Tooltip title="压缩为单行 (Ctrl+Shift+K)">
              <button className="jw-format-btn" onClick={onCompress} disabled={!canFormat}>
                压缩
              </button>
            </Tooltip>
            <Tooltip title="压缩转义 (Ctrl+Shift+E)">
              <button className="jw-format-btn jw-format-btn--wide" onClick={onEscapeCompact} disabled={!canFormat || isEscapedJson}>
                压缩转义
              </button>
            </Tooltip>
            <Tooltip title="反转义 (Ctrl+Shift+U)">
              <button className="jw-format-btn jw-format-btn--wide" onClick={onUnescape}>
                反转义
              </button>
            </Tooltip>
            <div className="jw-indent-select">
              <button
                className={`jw-indent-btn ${indentSize === 2 ? 'jw-indent-btn--active' : ''}`}
                onClick={() => onIndentChange(2)}
                title="2 空格缩进"
              >
                2空格
              </button>
              <button
                className={`jw-indent-btn ${indentSize === 4 ? 'jw-indent-btn--active' : ''}`}
                onClick={() => onIndentChange(4)}
                title="4 空格缩进"
              >
                4空格
              </button>
            </div>
          </div>
        )}
        {parseProgress > 0 && parseProgress < 100 && (
          <div className="jw-progress-bar">
            <div className="jw-progress-bar__fill" style={{ width: `${parseProgress}%` }} />
            <span className="jw-progress-bar__text">解析中…{parseProgress}%</span>
          </div>
        )}
      </div>
      <div className="jw-toolbar__right">
        {fileSize > 0 && (
          <span className="jw-toolbar__filesize" title="原始 JSON 大小">
            {formatFileSize(fileSize)}
          </span>
        )}
        {hasData && !showError && parseProgress === 0 && (
          <>
            <button className="jw-copy-btn" onClick={onCopyPretty} title="复制美化版 (Ctrl+Shift+C)">
              复制美化
            </button>
            <button className="jw-copy-btn" onClick={onCopyCompact} title="复制压缩版 (Ctrl+Shift+M)">
              复制压缩
            </button>
          </>
        )}
        {hasSchema ? (
          <Tooltip title="点击清除校验规则">
            <button className="jw-schema-btn jw-schema-btn--active" onClick={onSchemaClear}>
              ✓ 校验规则
            </button>
          </Tooltip>
        ) : (
          <Dropdown menu={{ items: schemaMenuItems }} placement="bottomLeft" trigger={['click']}>
            <Tooltip title="点击选择加载 Schema 的方式">
              <button className="jw-schema-btn">校验规则 ▾</button>
            </Tooltip>
          </Dropdown>
        )}
        <div className="jw-view-toggle">
          {(['raw', 'split', 'tree'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              className={`jw-view-toggle__btn ${viewMode === mode ? 'jw-view-toggle__btn--active' : ''}`}
              onClick={() => onViewModeChange(mode)}
            >
              {mode === 'tree' ? '树形' : mode === 'raw' ? '文本' : '分栏'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EscapedJsonResultPanel({ preview, fileSize, onUnescape, onCopy }: {
  preview: string;
  fileSize: number;
  onUnescape: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="jw-escaped-panel">
      <div className="jw-escaped-panel__content">
        <div className="jw-escaped-panel__icon">
          <SwapOutlined />
        </div>
        <div className="jw-escaped-panel__body">
          <div className="jw-escaped-panel__header">
            <span className="jw-escaped-panel__title">已压缩转义</span>
            <span className="jw-escaped-panel__meta">{formatFileSize(fileSize)} · JSON 字符串</span>
          </div>
          <pre className="jw-escaped-panel__preview">{preview}</pre>
          <div className="jw-escaped-panel__actions">
            <button className="jw-escaped-panel__primary" onClick={onUnescape}>
              <SwapOutlined /> 反转义
            </button>
            <button className="jw-escaped-panel__secondary" onClick={onCopy}>
              <CopyOutlined /> 复制
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 格式化文件大小为可读字符串 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── 自定义分栏 ────────────────────────────────────────

function SplitPane({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftRatio, setLeftRatio] = useState(50);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftRatio(Math.min(75, Math.max(25, pct)));
    };
    const onMouseUp = () => { draggingRef.current = false; };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div ref={containerRef} className="jw-split-pane">
      <div className="jw-split-pane__left" style={{ flexBasis: `${leftRatio}%`, flexGrow: 0, flexShrink: 0 }}>
        {left}
      </div>
      <div
        className={`jw-split-pane__divider ${draggingRef.current ? 'jw-split-pane__divider--active' : ''}`}
        onMouseDown={() => { draggingRef.current = true; }}
      />
      <div className="jw-split-pane__right" style={{ flex: 1, minWidth: 0 }}>
        {right}
      </div>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────

export default function JsonWorkbenchPage() {
  const [state, dispatch] = useReducer(jsonWbReducer, undefined, loadInitialJsonState);
  const { parse, debouncedParse, applyRepair } = useJsonParser(dispatch);

  // 持久化原文与编辑偏好（刷新恢复；关 Tab 由 TabContext 清除）
  useEffect(() => {
    savePageState(PAGE_KEY, {
      rawJson: state.rawJson,
      viewMode: state.viewMode,
      indentSize: state.indentSize,
      schemaJson: state.schemaJson,
      searchQuery: state.searchQuery,
      searchMode: state.searchMode,
    });
  }, [
    state.rawJson,
    state.viewMode,
    state.indentSize,
    state.schemaJson,
    state.searchQuery,
    state.searchMode,
  ]);

  // 刷新后若有缓存原文，自动重新解析以恢复树视图
  const restoredParseRef = useRef(false);
  useEffect(() => {
    if (restoredParseRef.current) return;
    restoredParseRef.current = true;
    if (state.rawJson.trim()) {
      parse(state.rawJson, 1, undefined, { preserveExpandedIds: false }).catch(() => {});
    }
    // 仅在首屏执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { repair: aiRepair, reset: resetAi, loading: aiLoading, result: aiResult, error: aiError } = useAiRepair();
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);
  const [expandedArrayPaths, setExpandedArrayPaths] = useState<Set<string>>(new Set());

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    dispatch({ type: 'JSON_WB_SET_VIEW_MODE', payload: mode });
  }, []);

  const handleRawChange = useCallback(
    (raw: string) => {
      dispatch({ type: 'JSON_WB_SET_RAW', payload: raw });
      debouncedParse(raw, 1, expandedArrayPaths);
    },
    [debouncedParse, expandedArrayPaths],
  );

  const handleToggle = useCallback((nodeId: string) => {
    dispatch({ type: 'JSON_WB_TOGGLE_NODE', payload: nodeId });
  }, []);

  const handleSelect = useCallback((nodeId: string) => {
    dispatch({ type: 'JSON_WB_SELECT_NODE', payload: nodeId });

    // AC-4: 点击树节点时，计算该节点在 JSON 文本中的行号
    // 通过 nodeId（JSONPath）找到对应行号
    if (state.rawJson && nodeId) {
      // 简单策略：在 rawJson 中搜索 key 来定位行号
      // 后续 Story 可以用更精确的行映射
      const node = state.flatNodeList.find((n) => n.id === nodeId);
      if (node) {
        const keyPattern = node.parentId === null ? '' : `"${node.key}"`;
        const idx = state.rawJson.indexOf(keyPattern);
        if (idx >= 0) {
          const lineNum = state.rawJson.substring(0, idx).split('\n').length;
          setScrollTarget(lineNum);
        }
      }
    }
  }, [state.flatNodeList, state.rawJson]);

  // ─── 搜索逻辑 ─────────────────────────────────────────

  // 搜索防抖计时器
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 搜索计算 + 防抖 dispatch（搜索原始 JSON 对象，不受折叠影响）
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const q = state.searchQuery.trim();
    if (!q || !state.parsedJson) {
      dispatch({ type: 'JSON_WB_SET_SEARCH_RESULTS', payload: [] });
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      const results = computeSearchResults(state.parsedJson!, q, state.searchMode);
      dispatch({ type: 'JSON_WB_SET_SEARCH_RESULTS', payload: results });
    }, 200);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [state.searchQuery, state.searchMode, state.parsedJson, dispatch]);

  const handleSearchQueryChange = useCallback((query: string) => {
    dispatch({ type: 'JSON_WB_SET_SEARCH', payload: { query, mode: state.searchMode } });
  }, [state.searchMode]);

  const handleSearchModeChange = useCallback((mode: typeof state.searchMode) => {
    dispatch({ type: 'JSON_WB_SET_SEARCH', payload: { query: state.searchQuery, mode } });
  }, [state.searchQuery]);

  // 记录搜索跳转后待选中的节点（用于 collapsed 数组展开后的延迟选中）
  const pendingSelectRef = useRef<string | null>(null);

  // 当 flatNodeList 更新后，处理待选中的节点
  useEffect(() => {
    if (pendingSelectRef.current && state.flatNodeList.length > 0) {
      const targetId = pendingSelectRef.current;
      pendingSelectRef.current = null;
      // 确保目标仍存在于新的 flatNodeList
      if (state.flatNodeList.some((n) => n.id === targetId)) {
        dispatch({ type: 'JSON_WB_SELECT_NODE', payload: targetId });
        const ancestors = getAncestorPaths(targetId);
        dispatch({ type: 'JSON_WB_ENSURE_EXPANDED', payload: ancestors });
      }
    }
  }, [state.flatNodeList, dispatch]);

  const handleSearchResultClick = useCallback((nodeId: string) => {
    // 检查目标节点是否在当前 flatNodeList 中（可能被智能折叠隐藏）
    const existsInFlat = state.flatNodeList.some((n) => n.id === nodeId);

    if (existsInFlat) {
      // 节点已存在：直接选中+展开祖先
      dispatch({ type: 'JSON_WB_SELECT_NODE', payload: nodeId });
      const ancestors = getAncestorPaths(nodeId);
      dispatch({ type: 'JSON_WB_ENSURE_EXPANDED', payload: ancestors });
    } else {
      // 节点在折叠数组中：找到需要展开的数组祖先，重新解析
      const ancestors = getAncestorPaths(nodeId);
      // 找 collapsed 的数组祖先（当前有 ellipsis 子节点的数组）
      const collapsedArrays = ancestors.filter((ancPath) =>
        state.flatNodeList.some(
          (n) => n.parentId === ancPath && n.type === 'array-ellipsis',
        ),
      );
      if (collapsedArrays.length > 0) {
        pendingSelectRef.current = nodeId;
        const next = new Set(expandedArrayPaths);
        for (const a of collapsedArrays) next.add(a);
        setExpandedArrayPaths(next);
        parse(state.rawJson, 1, next, { preserveExpandedIds: true }).catch(() => {});
      } else {
        // 理论上不应到这里，兜底
        dispatch({ type: 'JSON_WB_SELECT_NODE', payload: nodeId });
        dispatch({ type: 'JSON_WB_ENSURE_EXPANDED', payload: ancestors });
      }
    }
  }, [state.flatNodeList, state.rawJson, expandedArrayPaths, parse]);

  const handleCollapseOthers = useCallback(() => {
    dispatch({ type: 'JSON_WB_COLLAPSE_NON_MATCHES', payload: state.searchResults });
  }, [state.searchResults]);

  const handleSearchClear = useCallback(() => {
    dispatch({ type: 'JSON_WB_SET_SEARCH', payload: { query: '', mode: state.searchMode } });
    dispatch({ type: 'JSON_WB_SET_SEARCH_RESULTS', payload: [] });
  }, [state.searchMode]);

  // Ctrl+F / Cmd+F 快捷键聚焦搜索
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        // 聚焦搜索框：通过 DOM 查询
        const input = document.querySelector<HTMLInputElement>('.jw-search-bar__input input');
        input?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleExpandAll = useCallback((nodeId: string) => {
    // 检查是否是大数组（有 ellipsis 子节点）
    const hasEllipsis = state.flatNodeList.some(
      (n) => n.parentId === nodeId && n.type === 'array-ellipsis',
    );
    if (hasEllipsis) {
      // 大数组：将路径加入 expandedArrayPaths 并立即重新解析（不用防抖）
      const next = new Set(expandedArrayPaths);
      next.add(nodeId);
      setExpandedArrayPaths(next);
      parse(state.rawJson, 1, next, { preserveExpandedIds: true }).catch(() => {});
    } else {
      // 普通节点：直接展开
      dispatch({ type: 'JSON_WB_EXPAND_ALL', payload: nodeId });
    }
  }, [state.flatNodeList, state.rawJson, expandedArrayPaths, parse]);

  const handleCollapseAll = useCallback((nodeId: string) => {
    dispatch({ type: 'JSON_WB_COLLAPSE_ALL', payload: nodeId });
  }, []);

  const handleScrollTargetHandled = useCallback(() => {
    setScrollTarget(null);
  }, []);

  // 面包屑导航：点击路径段跳转
  const handleBreadcrumbNavigate = useCallback((path: string) => {
    // 选中目标节点
    dispatch({ type: 'JSON_WB_SELECT_NODE', payload: path });

    // 确保祖先链全部展开
    const ancestorPaths = getAncestorPaths(path);
    const next = new Set(state.expandedIds);
    let changed = false;
    for (const ap of ancestorPaths) {
      const node = state.flatNodeList.find((n) => n.id === ap);
      if (node && (node.type === 'object' || node.type === 'array') && !next.has(ap)) {
        next.add(ap);
        changed = true;
      }
    }
    if (changed) {
      // 需要直接更新 expandedIds，用一个 hack：dispatch EXPAND_ALL 对根节点
      // 更好的方式是新增一个 JSON_WB_EXPAND_NODES action
      // 但为了最小改动，我们直接在 dispatch 后设置
      // 实际上 useReducer 的 dispatch 无法直接设置 expandedIds
      // 所以需要一个新 action
      dispatch({ type: 'JSON_WB_ENSURE_EXPANDED', payload: ancestorPaths });
    }

    // 同步 Raw 视图滚动
    if (state.rawJson) {
      const node = state.flatNodeList.find((n) => n.id === path);
      if (node && node.parentId !== null) {
        const keyPattern = `"${node.key}"`;
        const idx = state.rawJson.indexOf(keyPattern);
        if (idx >= 0) {
          const lineNum = state.rawJson.substring(0, idx).split('\n').length;
          setScrollTarget(lineNum);
        }
      }
    }
  }, [state.expandedIds, state.flatNodeList, state.rawJson]);

  // UTF-8 字节大小（用于大文件判断和文件大小显示）
  const rawJsonByteSize = useMemo(
    () => state.rawJson ? new TextEncoder().encode(state.rawJson).length : 0,
    [state.rawJson],
  );
  const escapedJsonInspection = useMemo(
    () => inspectEscapedJsonString(state.rawJson, state.indentSize),
    [state.rawJson, state.indentSize],
  );
  const isEscapedJson = escapedJsonInspection.isEscaped;
  const hasData = state.flatNodeList.length > 0 && !isEscapedJson;
  const canFormat = state.parsedJson !== null && state.parseError === null && !isEscapedJson;
  const showError = state.parseError !== null && !isEscapedJson;
  const hasRawInput = state.rawJson.trim().length > 0;

  // 格式化
  const handleFormat = useCallback(() => {
    if (!state.parsedJson) return;
    const formatted = JSON.stringify(state.parsedJson, null, state.indentSize);
    dispatch({ type: 'JSON_WB_SET_RAW', payload: formatted });
    debouncedParse(formatted, 1, expandedArrayPaths, { preserveExpandedIds: true });
  }, [state.parsedJson, state.indentSize, debouncedParse, expandedArrayPaths]);

  // 压缩
  const handleCompress = useCallback(() => {
    if (!state.parsedJson) return;
    const compressed = JSON.stringify(state.parsedJson);
    dispatch({ type: 'JSON_WB_SET_RAW', payload: compressed });
    debouncedParse(compressed, 1, expandedArrayPaths, { preserveExpandedIds: true });
  }, [state.parsedJson, debouncedParse, expandedArrayPaths]);

  // 压缩转义
  const handleEscapeCompact = useCallback(() => {
    if (state.parsedJson === null || state.parseError !== null) return;
    const escaped = compressAndEscapeJson(state.parsedJson);
    dispatch({ type: 'JSON_WB_SET_RAW', payload: escaped });
    parse(escaped, 1, expandedArrayPaths).catch(() => {});
    message.success('已压缩转义');
  }, [state.parsedJson, state.parseError, parse, expandedArrayPaths]);

  // 反转义
  const handleUnescape = useCallback(() => {
    const result = unescapeJsonString(state.rawJson, state.indentSize);
    if ('error' in result) {
      message.warning(result.error);
      return;
    }
    dispatch({ type: 'JSON_WB_SET_RAW', payload: result.value });
    parse(result.value, 1, expandedArrayPaths).catch(() => {});
    message.success('已反转义');
  }, [state.rawJson, state.indentSize, parse, expandedArrayPaths]);

  const handleCopyRawJson = useCallback(async () => {
    if (!state.rawJson) return;
    await navigator.clipboard.writeText(state.rawJson);
    const size = new TextEncoder().encode(state.rawJson).length;
    message.success(`已复制 ${formatFileSize(size)}`);
  }, [state.rawJson]);

  // 缩进切换
  const handleIndentChange = useCallback((size: 2 | 4) => {
    dispatch({ type: 'JSON_WB_SET_INDENT_SIZE', payload: size });
  }, []);

  // ─── 树视图编辑 ──────────────────────────────────────

  const handleNodeEdit = useCallback((nodeId: string, newRaw: string) => {
    if (!state.parsedJson) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(newRaw);
    } catch {
      parsed = newRaw; // 非 JSON 直接当字符串
    }

    const modified = setValueAtPath(state.parsedJson, nodeId, parsed);
    if (!modified) {
      message.error('编辑失败');
      return;
    }

    const raw = JSON.stringify(modified, null, 2);
    dispatch({ type: 'JSON_WB_SET_RAW', payload: raw });
    debouncedParse(raw, 1, expandedArrayPaths, { preserveExpandedIds: true });
  }, [state.parsedJson, debouncedParse, expandedArrayPaths]);

  // ─── 树视图 key 编辑 ────────────────────────────────

  const handleKeyEdit = useCallback((nodeId: string, newKey: string) => {
    if (!state.parsedJson) return;

    const modified = renameKeyAtPath(state.parsedJson, nodeId, newKey);
    if (!modified) {
      message.error('键名重命名失败（可能已存在同名键）');
      return;
    }

    const raw = JSON.stringify(modified, null, 2);
    dispatch({ type: 'JSON_WB_SET_RAW', payload: raw });
    debouncedParse(raw, 1, expandedArrayPaths, { preserveExpandedIds: true });
  }, [state.parsedJson, debouncedParse, expandedArrayPaths]);

  // ─── 复制 ─────────────────────────────────────────────

  const handleCopyPretty = useCallback(async () => {
    if (!state.parsedJson) return;
    const text = JSON.stringify(state.parsedJson, null, state.indentSize);
    await navigator.clipboard.writeText(text);
    const size = new TextEncoder().encode(text).length;
    message.success(`已复制 ${formatFileSize(size)}`);
  }, [state.parsedJson, state.indentSize]);

  const handleCopyCompact = useCallback(async () => {
    if (!state.parsedJson) return;
    const text = JSON.stringify(state.parsedJson);
    await navigator.clipboard.writeText(text);
    const size = new TextEncoder().encode(text).length;
    message.success(`已复制 ${formatFileSize(size)}`);
  }, [state.parsedJson]);

  // Ctrl+Shift+M 快捷键复制压缩版
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        handleCopyCompact();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCopyCompact]);

  // Ctrl+Shift+E / Ctrl+Shift+U / Ctrl+Shift+F / Ctrl+Shift+K 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 'e') {
        e.preventDefault();
        handleEscapeCompact();
      } else if (key === 'u') {
        e.preventDefault();
        handleUnescape();
      } else if (key === 'f') {
        e.preventDefault();
        handleFormat();
      } else if (key === 'k') {
        e.preventDefault();
        handleCompress();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleEscapeCompact, handleUnescape, handleFormat, handleCompress]);

  // ─── Schema 校验 ─────────────────────────────────────

  const schemaFileRef = useRef<HTMLInputElement>(null);

  const handleSchemaFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const schema = JSON.parse(reader.result as string);
        const sPayload = JSON.stringify(schema);
        dispatch({ type: 'JSON_WB_SET_SCHEMA', payload: sPayload });
        message.success('Schema 已加载');
      } catch {
        message.error('Schema 文件格式无效');
      }
    };
    reader.readAsText(file);
    // 重置 input 以便重复选择同一文件
    e.target.value = '';
  }, []);

  const handleSchemaClear = useCallback(() => {
    dispatch({ type: 'JSON_WB_SET_SCHEMA', payload: null });
  }, []);

  // ─── Schema 粘贴弹窗 ─────────────────────────────────
  const [schemaPasteVisible, setSchemaPasteVisible] = useState(false);
  const [schemaPasteText, setSchemaPasteText] = useState('');

  const handleSchemaPasteOk = useCallback(() => {
    try {
      const schema = JSON.parse(schemaPasteText);
      const schemPayload = JSON.stringify(schema);
      dispatch({ type: 'JSON_WB_SET_SCHEMA', payload: schemPayload });
      message.success('Schema 已加载');
    } catch {
      message.error('Schema 格式无效，请检查 JSON 语法');
      return;
    }
    setSchemaPasteVisible(false);
    setSchemaPasteText('');
  }, [schemaPasteText, dispatch]);

  const handleSchemaPasteCancel = useCallback(() => {
    setSchemaPasteVisible(false);
    setSchemaPasteText('');
  }, []);

  // 从当前 JSON 自动推断 Schema
  const handleSchemaAutoGenerate = useCallback(() => {
    if (!state.parsedJson) {
      message.warning('请先输入或导入有效的 JSON');
      return;
    }
    const autoSchema = inferSchemaFromValue(state.parsedJson);
    const autoPayload = JSON.stringify(autoSchema, null, 2);
    dispatch({ type: 'JSON_WB_SET_SCHEMA', payload: autoPayload });
    message.success('已根据当前 JSON 结构自动生成 Schema');
  }, [state.parsedJson, dispatch]);

  // 加载示例 Schema
  const handleSchemaLoadSample = useCallback(() => {
    const samplePayload = JSON.stringify(SAMPLE_SCHEMA, null, 2);
    dispatch({ type: 'JSON_WB_SET_SCHEMA', payload: samplePayload });
    message.success('已加载示例 Schema');
  }, [dispatch]);

  // 下拉菜单项
  const schemaMenuItems: MenuProps['items'] = useMemo(() => [
    {
      key: 'upload',
      icon: <UploadOutlined />,
      label: '上传 Schema 文件',
      onClick: () => schemaFileRef.current?.click(),
    },
    {
      key: 'paste',
      icon: <EditOutlined />,
      label: '粘贴 Schema 文本',
      onClick: () => setSchemaPasteVisible(true),
    },
    {
      key: 'auto',
      icon: <ThunderboltOutlined />,
      label: '根据 JSON 自动生成',
      onClick: handleSchemaAutoGenerate,
      disabled: !state.parsedJson,
    },
    {
      key: 'sample',
      icon: <BulbOutlined />,
      label: '加载示例 Schema',
      onClick: handleSchemaLoadSample,
    },
  ], [handleSchemaAutoGenerate, handleSchemaLoadSample, state.parsedJson]);

  // 校验 effect: parsedJson 或 schemaJson 变化后 500ms 防抖执行
  const schemaTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    if (schemaTimerRef.current) clearTimeout(schemaTimerRef.current);
    if (!state.parsedJson || !state.schemaJson) {
      dispatch({ type: 'JSON_WB_SET_SCHEMA_ERRORS', payload: [] });
      return;
    }
    schemaTimerRef.current = setTimeout(() => {
      try {
        const schema = JSON.parse(state.schemaJson!);
        const errors = validateBySchema(state.parsedJson, schema);
        dispatch({ type: 'JSON_WB_SET_SCHEMA_ERRORS', payload: errors });
      } catch {
        dispatch({ type: 'JSON_WB_SET_SCHEMA_ERRORS', payload: [{ path: '$', message: 'Schema 格式无效', severity: 'error' as const }] });
      }
    }, 500);
    return () => { if (schemaTimerRef.current) clearTimeout(schemaTimerRef.current); };
  }, [state.parsedJson, state.schemaJson, dispatch]);

  // 修复：先本地规则，不行走 AI
  const handleRepair = useCallback(() => {
    const result = jsonRepair(state.rawJson);
    if ('error' in result) {
      // 本地规则未命中，降级到 AI 修复前检查大小
      if (rawJsonByteSize > 20480) {
        message.warning('内容过长（最大 20KB），请缩减后重试');
        return;
      }
      setShowAiModal(true);
      aiRepair(state.rawJson);
    } else {
      dispatch({ type: 'JSON_WB_SET_REPAIR_PREVIEW', payload: result });
    }
  }, [state.rawJson, rawJsonByteSize, dispatch, aiRepair]);

  // AI 修复弹窗
  const [showAiModal, setShowAiModal] = useState(false);

  const handleAiApply = useCallback(() => {
    if (!aiResult) return;
    dispatch({ type: 'JSON_WB_SET_RAW', payload: aiResult });
    parse(aiResult, 1, expandedArrayPaths).catch(() => {});
    setShowAiModal(false);
    resetAi();
  }, [aiResult, parse, expandedArrayPaths, resetAi]);

  const handleAiCancel = useCallback(() => {
    setShowAiModal(false);
    resetAi();
  }, [resetAi]);

  // 确认修复
  const handleApplyRepair = useCallback(() => {
    if (state.repairPreview) {
      applyRepair(state.repairPreview.repaired);
    }
  }, [applyRepair, state.repairPreview]);

  // 取消修复
  const handleCancelRepair = useCallback(() => {
    dispatch({ type: 'JSON_WB_SET_REPAIR_PREVIEW', payload: null });
  }, []);

  // 关闭大文件提示
  const handleDismissHint = useCallback(() => {
    dispatch({ type: 'JSON_WB_DISMISS_LARGE_FILE_HINT' });
  }, []);

  // 大文件提示文案
  const largeFileHint = useMemo(() => {
    if (!state.isLargeFile || state.largeFileHintDismissed || !state.rawJson) return null;
    const sizeMB = state.rawJson.length / (1024 * 1024);
    if (sizeMB >= 5) {
      return `文件很大（${sizeMB.toFixed(1)} MB），建议使用搜索而非逐层展开`;
    }
    return `文件较大（${sizeMB.toFixed(1)} MB），已启用性能模式`;
  }, [state.isLargeFile, state.largeFileHintDismissed, state.rawJson]);

  // 面包屑路径段
  const breadcrumbSegments = useMemo(
    () => !isEscapedJson && state.selectedNodeId ? parseJsonPathToSegments(state.selectedNodeId) : [],
    [isEscapedJson, state.selectedNodeId],
  );

  const treePanel = isEscapedJson ? (
    <EscapedJsonResultPanel
      preview={escapedJsonInspection.value ?? ''}
      fileSize={rawJsonByteSize}
      onUnescape={handleUnescape}
      onCopy={handleCopyRawJson}
    />
  ) : (
    <JsonTreeView
      nodes={state.flatNodeList}
      expandedIds={state.expandedIds}
      selectedNodeId={state.selectedNodeId}
      onToggle={handleToggle}
      onSelect={handleSelect}
      onExpandAll={handleExpandAll}
      onCollapseAll={handleCollapseAll}
      onEdit={handleNodeEdit}
      onKeyEdit={handleKeyEdit}
      searchResults={state.searchResults}
      schemaErrors={state.schemaErrors}
      parseError={state.parseError}
    />
  );

  const rawPanel = (
    <JsonRawEditor
      value={state.rawJson}
      onChange={handleRawChange}
      parseError={state.parseError}
      scrollTarget={scrollTarget}
      onScrollTargetHandled={handleScrollTargetHandled}
    />
  );

  return (
    <div className="jw-page">
      <ToolPageHeader
        icon={<CodeOutlined />}
        title="JSON 工作台"
        subtitle="可视化解析 · 智能修复 · Schema 校验"
      />
      <Toolbar
        viewMode={state.viewMode}
        onViewModeChange={handleViewModeChange}
        hasData={hasData}
        hasRawInput={hasRawInput}
        canFormat={canFormat}
        isEscapedJson={isEscapedJson}
        indentSize={state.indentSize}
        onFormat={handleFormat}
        onCompress={handleCompress}
        onEscapeCompact={handleEscapeCompact}
        onUnescape={handleUnescape}
        onIndentChange={handleIndentChange}
        showError={showError}
        onRepair={handleRepair}
        onCopyPretty={handleCopyPretty}
        onCopyCompact={handleCopyCompact}
        hasSchema={state.schemaJson !== null}
        onSchemaClear={handleSchemaClear}
        schemaMenuItems={schemaMenuItems}
        parseProgress={state.parseProgress}
        fileSize={rawJsonByteSize}
      />
      {largeFileHint && (
        <div className="jw-large-file-hint">
          <span className="jw-large-file-hint__icon">ℹ️</span>
          <span className="jw-large-file-hint__text">{largeFileHint}</span>
          <button
            className="jw-large-file-hint__close"
            onClick={handleDismissHint}
            title="关闭提示"
          >
            ×
          </button>
        </div>
      )}
      {breadcrumbSegments.length > 0 && (
        <Breadcrumb segments={breadcrumbSegments} onNavigate={handleBreadcrumbNavigate} />
      )}
      {hasData && (
        <SearchBar
          query={state.searchQuery}
          mode={state.searchMode}
          resultIds={state.searchResults}
          flatNodeList={state.flatNodeList}
          hasData={hasData}
          onQueryChange={handleSearchQueryChange}
          onModeChange={handleSearchModeChange}
          onResultClick={handleSearchResultClick}
          onCollapseOthers={handleCollapseOthers}
          onClear={handleSearchClear}
        />
      )}
      <div className="jw-content">
        {state.viewMode === 'tree' && treePanel}
        {state.viewMode === 'raw' && rawPanel}
        {state.viewMode === 'split' && (
          <SplitPane left={rawPanel} right={treePanel} />
        )}
      </div>
      <RepairPreviewModal
        visible={state.repairPreview !== null}
        original={state.rawJson}
        repaired={state.repairPreview?.repaired ?? ''}
        fixes={state.repairPreview?.fixes ?? []}
        onConfirm={handleApplyRepair}
        onCancel={handleCancelRepair}
      />
      <AiRepairModal
        visible={showAiModal}
        original={state.rawJson}
        repaired={aiResult}
        loading={aiLoading}
        error={aiError}
        onApply={handleAiApply}
        onCancel={handleAiCancel}
      />
      <Modal
        title="粘贴 JSON Schema"
        open={schemaPasteVisible}
        onOk={handleSchemaPasteOk}
        onCancel={handleSchemaPasteCancel}
        okText="确认加载"
        cancelText="取消"
        width={600}
        destroyOnClose
      >
        <div style={{ marginBottom: 8, color: '#888', fontSize: 13 }}>
          将 JSON Schema 文本粘贴到下方，点击「确认加载」即可开始校验
        </div>
        <Input.TextArea
          value={schemaPasteText}
          onChange={(e) => setSchemaPasteText(e.target.value)}
          placeholder={`{\n  "type": "object",\n  "properties": {\n    "name": { "type": "string" }\n  },\n  "required": ["name"]\n}`}
          rows={12}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
      </Modal>
      <input
        ref={schemaFileRef}
        type="file"
        accept=".json,.schema.json"
        style={{ display: 'none' }}
        onChange={handleSchemaFile}
      />
    </div>
  );
}
