import { useReducer, useCallback, useRef, useState, useEffect, useMemo } from 'react';
import type {
  JsonWorkbenchState,
  JsonWbAction,
  ViewMode,
} from './types';
import { useJsonParser } from './hooks/useJsonParser';
import { getAllDescendantIds } from './utils/parseAndFlatten';
import { canRepair } from './utils/jsonRepair';
import { parseJsonPathToSegments, getAncestorPaths } from './utils/breadcrumb';
import JsonTreeView from './components/JsonTreeView';
import JsonRawEditor from './components/JsonRawEditor';
import Breadcrumb from './components/Breadcrumb';
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
        expandedIds: new Set(
          action.payload.flatNodes
            .filter((n) => n.isExpanded)
            .map((n) => n.id),
        ),
      };
    case 'JSON_WB_PARSE_ERROR':
      return { ...state, parseError: action.payload };
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
    default:
      return state;
  }
}

// ─── 工具栏 ────────────────────────────────────────────

function Toolbar({ viewMode, onViewModeChange, hasData, canFormat, indentSize, onFormat, onCompress, onIndentChange, showError, canRepairJson, onRepair }: {
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
}) {
  return (
    <div className="jw-toolbar">
      <div className="jw-toolbar__left">
        <span className="jw-toolbar__title">JSON 工作台</span>
        {hasData && <span className="jw-toolbar__status">已解析</span>}
        {showError && canRepairJson && (
          <button className="jw-repair-btn" onClick={onRepair} title="自动修复常见语法错误">
            修复
          </button>
        )}
        {canFormat && (
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
      </div>
      <div className="jw-toolbar__right">
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
  const { debouncedParse, repair, applyRepair } = useJsonParser(dispatch);
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    dispatch({ type: 'JSON_WB_SET_VIEW_MODE', payload: mode });
  }, []);

  const handleRawChange = useCallback(
    (raw: string) => {
      dispatch({ type: 'JSON_WB_SET_RAW', payload: raw });
      debouncedParse(raw);
    },
    [debouncedParse],
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

  const handleExpandAll = useCallback((nodeId: string) => {
    dispatch({ type: 'JSON_WB_EXPAND_ALL', payload: nodeId });
  }, []);

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
  const canRepairJson = state.rawJson.trim().length > 0 && canRepair(state.rawJson);

  // 格式化
  const handleFormat = useCallback(() => {
    if (!state.parsedJson) return;
    const formatted = JSON.stringify(state.parsedJson, null, state.indentSize);
    dispatch({ type: 'JSON_WB_SET_RAW', payload: formatted });
    debouncedParse(formatted);
  }, [state.parsedJson, state.indentSize, debouncedParse]);

  // 压缩
  const handleCompress = useCallback(() => {
    if (!state.parsedJson) return;
    const compressed = JSON.stringify(state.parsedJson);
    dispatch({ type: 'JSON_WB_SET_RAW', payload: compressed });
    debouncedParse(compressed);
  }, [state.parsedJson, debouncedParse]);

  // 缩进切换
  const handleIndentChange = useCallback((size: 2 | 4) => {
    dispatch({ type: 'JSON_WB_SET_INDENT_SIZE', payload: size });
  }, []);

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
      />
      {breadcrumbSegments.length > 0 && (
        <Breadcrumb segments={breadcrumbSegments} onNavigate={handleBreadcrumbNavigate} />
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
