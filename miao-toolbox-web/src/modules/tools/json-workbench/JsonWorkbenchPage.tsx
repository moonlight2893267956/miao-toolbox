import { useReducer, useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { message } from 'antd';
import type {
  JsonWorkbenchState,
  JsonWbAction,
  ViewMode,
} from './types';
import { useJsonParser } from './hooks/useJsonParser';
import { getAllDescendantIds, renameKeyAtPath, setValueAtPath } from './utils/parseAndFlatten';
import { canRepair } from './utils/jsonRepair';
import { parseJsonPathToSegments, getAncestorPaths } from './utils/breadcrumb';
import { computeSearchResults } from './utils/search';
import JsonTreeView from './components/JsonTreeView';
import JsonRawEditor from './components/JsonRawEditor';
import Breadcrumb from './components/Breadcrumb';
import SearchBar from './components/SearchBar';
import RepairPreviewModal from './components/RepairPreviewModal';
import './json-workbench.css';

// ─── 初始状态 ──────────────────────────────────────────

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

// ─── Reducer ───────────────────────────────────────────

function jsonWbReducer(state: JsonWorkbenchState, action: JsonWbAction): JsonWorkbenchState {
  switch (action.type) {
    case 'JSON_WB_SET_RAW':
      return { ...state, rawJson: action.payload };
    case 'JSON_WB_PARSE_SUCCESS':
      return {
        ...state,
        parsedJson: action.payload.parsed,
        flatNodeList: action.payload.flatNodes,
        parseError: null,
        parseProgress: 0,
        isLargeFile: false,
        expandedIds: new Set(
          action.payload.flatNodes
            .filter((n) => n.isExpanded)
            .map((n) => n.id),
        ),
      };
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

function Toolbar({ viewMode, onViewModeChange, hasData, canFormat, indentSize, onFormat, onCompress, onIndentChange, showError, canRepairJson, onRepair, onCopyPretty, onCopyCompact, parseProgress, fileSize }: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  hasData: boolean;
  canFormat: boolean;
  indentSize: 2 | 4;
  onFormat: () => void;
  onCompress: () => void;
  onIndentChange: (size: 2 | 4) => void;
  showError: boolean;
  canRepairJson: boolean;
  onRepair: () => void;
  onCopyPretty: () => void;
  onCopyCompact: () => void;
  parseProgress: number;
  fileSize: number;
}) {
  return (
    <div className="jw-toolbar">
      <div className="jw-toolbar__left">
        <span className="jw-toolbar__title">JSON 工作台</span>
        {hasData && !showError && parseProgress === 0 && (
          <span className="jw-toolbar__status">已解析</span>
        )}
        {showError && canRepairJson && (
          <button className="jw-repair-btn" onClick={onRepair} title="自动修复常见语法错误">
            修复
          </button>
        )}
        {canFormat && parseProgress === 0 && (
          <div className="jw-format-group">
            <button className="jw-format-btn" onClick={onFormat} title="格式化 JSON">
              格式化
            </button>
            <button className="jw-format-btn" onClick={onCompress} title="压缩为单行">
              压缩
            </button>
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
        <div className="jw-view-toggle">
          {(['tree', 'split', 'raw'] as ViewMode[]).map((mode) => (
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
  const [state, dispatch] = useReducer(jsonWbReducer, initialState);
  const { parse, debouncedParse, repair, applyRepair } = useJsonParser(dispatch);
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
        parse(state.rawJson, 1, next).catch(() => {});
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
      parse(state.rawJson, 1, next).catch(() => {});
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

  const hasData = state.flatNodeList.length > 0;
  const canFormat = state.parsedJson !== null && state.parseError === null;
  const showError = state.parseError !== null;
  // UTF-8 字节大小（用于大文件判断和文件大小显示）
  const rawJsonByteSize = useMemo(
    () => state.rawJson ? new TextEncoder().encode(state.rawJson).length : 0,
    [state.rawJson],
  );

  const canRepairJson = useMemo(
    () => showError && state.rawJson.trim().length > 0 && canRepair(state.rawJson),
    [showError, state.rawJson],
  );

  // 格式化
  const handleFormat = useCallback(() => {
    if (!state.parsedJson) return;
    const formatted = JSON.stringify(state.parsedJson, null, state.indentSize);
    dispatch({ type: 'JSON_WB_SET_RAW', payload: formatted });
    debouncedParse(formatted, 1, expandedArrayPaths);
  }, [state.parsedJson, state.indentSize, debouncedParse, expandedArrayPaths]);

  // 压缩
  const handleCompress = useCallback(() => {
    if (!state.parsedJson) return;
    const compressed = JSON.stringify(state.parsedJson);
    dispatch({ type: 'JSON_WB_SET_RAW', payload: compressed });
    debouncedParse(compressed, 1, expandedArrayPaths);
  }, [state.parsedJson, debouncedParse, expandedArrayPaths]);

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
    debouncedParse(raw, 1, expandedArrayPaths);
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
    debouncedParse(raw, 1, expandedArrayPaths);
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

  // 修复
  const handleRepair = useCallback(() => {
    repair(state.rawJson);
  }, [repair, state.rawJson]);

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
    () => state.selectedNodeId ? parseJsonPathToSegments(state.selectedNodeId) : [],
    [state.selectedNodeId],
  );

  const treePanel = (
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
      <Toolbar
        viewMode={state.viewMode}
        onViewModeChange={handleViewModeChange}
        hasData={hasData}
        canFormat={canFormat}
        indentSize={state.indentSize}
        onFormat={handleFormat}
        onCompress={handleCompress}
        onIndentChange={handleIndentChange}
        showError={showError}
        canRepairJson={canRepairJson}
        onRepair={handleRepair}
        onCopyPretty={handleCopyPretty}
        onCopyCompact={handleCopyCompact}
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
    </div>
  );
}
