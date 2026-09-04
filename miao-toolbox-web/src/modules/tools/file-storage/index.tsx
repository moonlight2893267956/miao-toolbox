import React, { useState, useEffect, useCallback, useRef, useMemo, useReducer } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDndContext,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import FolderIcon from './FolderIcon';
import homeIconUrl from '../../../assets/fs-icons/icon-home.png';
import inboxIconUrl from '../../../assets/fs-icons/icon-inbox.png';
import uploadCloudIconUrl from '../../../assets/fs-icons/icon-upload-cloud.png';
import {
  FolderOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  CloudUploadOutlined,
  UnorderedListOutlined,
  AppstoreOutlined,
  RightOutlined,
  FolderOpenOutlined,
  SettingOutlined,
  CaretRightOutlined,
  CaretDownOutlined,
  ExclamationCircleFilled,
  LinkOutlined,
  ShareAltOutlined,
  TeamOutlined,
  UserOutlined,
  FormOutlined,
  InfoCircleOutlined,
  ImportOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons';
import {
  Button,
  Table,
  Upload,
  message,
  Modal,
  Input,
  Breadcrumb,
  Progress,
  Typography,
  Tooltip,
  Spin,
  Tree,
  Segmented,
  Dropdown,
  Select,
} from 'antd';
import type { UploadProps, TreeProps, MenuProps } from 'antd';
import ToolPageHeader from '../../../components/shared/ToolPageHeader';
import { fileStorageApi } from './fileStorageApi';
import FilePreviewer from './FilePreviewer';
import GridThumbnail from './GridThumbnail';
import { SortableFileCard, DroppableFolderCard, DroppableTreeNode, DroppableBreadcrumb } from './DndGridItems';
import { InlineRenameInput } from './InlineRenameInput';
import { getFileIcon } from './FileIcon';
import { formatSize, getFileCategory, isPreviewable } from './fileCategory';
import ShareLinkModal from './ShareLinkModal';
import MyShareLinksView from './MyShareLinksView';
import { useRubberBandSelection } from './useRubberBandSelection';
import type { FileInfo, DirectoryInfo, DirectoryTreeNode, QuotaInfo, ShareInfo, SharedWithMeFile, UserOption, SortBy, SortDir } from './types';
import './file-storage.css';

const { Text } = Typography;

type ViewMode = 'list' | 'grid';

interface DirRow {
  type: 'dir';
  id: number;
  name: string;
  path: string;
}

interface FileRow extends FileInfo {
  type: 'file';
}

type RowItem = DirRow | FileRow;

// ── 多选 reducer ──

interface SelectionState {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
}

type SelectionAction =
  | { type: 'select'; id: string }
  | { type: 'toggle'; id: string }
  | { type: 'selectRange'; fromId: string; toId: string; allIds: string[] }
  | { type: 'selectAll'; ids: string[] }
  | { type: 'addToSelection'; ids: string[] }
  | { type: 'remove'; ids: string[] }
  | { type: 'clear' };

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'select': {
      return { selectedIds: new Set([action.id]), lastSelectedId: action.id };
    }
    case 'toggle': {
      const next = new Set(state.selectedIds);
      if (next.has(action.id)) {
        next.delete(action.id);
      } else {
        next.add(action.id);
      }
      return { selectedIds: next, lastSelectedId: action.id };
    }
    case 'selectRange': {
      const fromIdx = action.allIds.indexOf(action.fromId);
      const toIdx = action.allIds.indexOf(action.toId);
      if (fromIdx === -1 || toIdx === -1) return state;
      const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      const rangeIds = action.allIds.slice(start, end + 1);
      return { selectedIds: new Set(rangeIds), lastSelectedId: action.toId };
    }
    case 'selectAll': {
      return { selectedIds: new Set(action.ids), lastSelectedId: null };
    }
    case 'addToSelection': {
      const next = new Set(state.selectedIds);
      action.ids.forEach(id => next.add(id));
      return { selectedIds: next, lastSelectedId: null };
    }
    case 'remove': {
      const next = new Set(state.selectedIds);
      action.ids.forEach(id => next.delete(id));
      return { selectedIds: next, lastSelectedId: null };
    }
    case 'clear': {
      return { selectedIds: new Set(), lastSelectedId: null };
    }
    default:
      return state;
  }
}

const initialSelectionState: SelectionState = {
  selectedIds: new Set(),
  lastSelectedId: null,
};

/** 文件移出当前目录时的退场动画时长（ms），需与 CSS .fs-grid-item--exiting 保持一致 */
const EXIT_ANIM_MS = 180;
/** 系统开启「减弱动态效果」时跳过动画，立即移除 */
const exitAnimMs = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_ANIM_MS;

/** Story 5.5：排序控件的字段配置（label 与色点），UI 关注点放这里不放 types.ts */
const SORT_OPTIONS: { key: SortBy; label: string; color: string }[] = [
  { key: 'name',       label: '名称',     color: '#10b981' },
  { key: 'size',       label: '大小',     color: '#3b82f6' },
  { key: 'updatedAt',  label: '修改时间', color: '#f59e0b' },
  { key: 'type',       label: '类型',     color: '#a855f7' },
  { key: 'custom',     label: '自定义',   color: '#64748b' },
];

const FileStoragePage: React.FC = () => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
  const [directoryTree, setDirectoryTree] = useState<DirectoryTreeNode[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [newDirModalOpen, setNewDirModalOpen] = useState(false);
  const [newDirName, setNewDirName] = useState('');
  // 行内重命名（macOS Finder 风格）：统一管理文件与目录的行内重命名
  // renamingId = null 表示无行内编辑；非 null 时对应卡片渲染 InlineRenameInput
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<FileInfo | null>(null);
  const [moveTargetPath, setMoveTargetPath] = useState('');

  // Story 5.6：目录移动（FR-28）— 重命名改为行内，移动仍用弹窗
  const [dirMoveTarget, setDirMoveTarget] = useState<DirRow | null>(null);
  const [dirMoveTargetPath, setDirMoveTargetPath] = useState('');
  const [dirMoveOpen, setDirMoveOpen] = useState(false);

  const [deleteFileTarget, setDeleteFileTarget] = useState<FileInfo | null>(null);
  const [deleteDirTarget, setDeleteDirTarget] = useState<DirRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [previewCanEdit, setPreviewCanEdit] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const [dragActive, setDragActive] = useState(false);
  const dragCounterRef = useRef(0);
  const listAreaRef = useRef<HTMLDivElement>(null);

  // ── 多选状态 ──
  const [selection, dispatchSelection] = useReducer(selectionReducer, initialSelectionState);

  // ── 全屏 ──
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── @dnd-kit 拖拽移入文件夹 / 目录树（Story 5.4）──
  /** 当前拖拽中的文件集合（用于 DragOverlay 浮层渲染，多选时为整组） */
  const [activeDragFiles, setActiveDragFiles] = useState<FileInfo[]>([]);
  /** 正在播放退场动画的卡片 id：移动成功后先淡出再移除，避免原地"停留" */
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  /** spring-load 幽灵文件：进入新目录后仍挂载被拖卡片，保持 dnd-kit 拖拽跨目录存活（Story 5.7） */
  const [ghostFiles, setGhostFiles] = useState<FileInfo[]>([]);
  const ghostFilesRef = useRef<FileInfo[]>([]);
  const dragActiveRef = useRef(false);
  const springLoadedRef = useRef(false);
  const activeDragFilesRef = useRef<FileInfo[]>([]);

  // ── Story 5.5：排序由后端字段统一决定（多设备一致）；
  //    排序「选择」本身记入 localStorage，避免每次刷新都要重选（如自定义模式）──
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    try {
      const p = JSON.parse(localStorage.getItem('miao-fs-sort') ?? '{}');
      if (SORT_OPTIONS.some(o => o.key === p.sortBy)) return p.sortBy;
    } catch { /* 忽略解析失败 */ }
    return 'updatedAt';
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    try {
      const p = JSON.parse(localStorage.getItem('miao-fs-sort') ?? '{}');
      if (p.sortDir === 'asc' || p.sortDir === 'desc') return p.sortDir;
    } catch { /* 忽略解析失败 */ }
    return 'desc';
  });
  useEffect(() => {
    try {
      localStorage.setItem('miao-fs-sort', JSON.stringify({ sortBy, sortDir }));
    } catch { /* 隐私模式等场景静默降级 */ }
  }, [sortBy, sortDir]);
  /** 排序控件当前字段对应的色点（与 SORT_OPTIONS 配对） */
  const activeSortOption = SORT_OPTIONS.find(o => o.key === sortBy) ?? SORT_OPTIONS[2];
  /** 排序面板开关：用于给触发器按钮传 data-open，让箭头随展开旋转 */
  const [sortPanelOpen, setSortPanelOpen] = useState(false);

  // dnd-kit 传感器：指针拖拽，8px 激活阈值避免误触
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  /** 文件项的 sortable id */
  const fileSortableId = (file: FileInfo) => `file-${file.id}`;
  /** 文件夹的 droppable id */
  const dirDroppableId = (dir: { id: number }) => `dir-${dir.id}`;

  /**
   * 本次拖拽参与的文件集合（FR-25）：
   * 拖动的项已在选集中 → 整组一起移动；否则只移动该文件。
   */
  const resolveDragFiles = (activeId: string): FileInfo[] => {
    const activeFile = files.find(f => fileSortableId(f) === activeId);
    if (!activeFile) return [];
    if (!selection.selectedIds.has(activeId)) return [activeFile];
    const selected = new Set(
      [...selection.selectedIds]
        .filter(id => id.startsWith('file-'))
        .map(id => Number(id.slice(5))),
    );
    const group = files.filter(f => selected.has(f.id));
    return group.length > 0 ? group : [activeFile];
  };

  /** 拖拽开始：记录本次拖拽的文件集合用于 DragOverlay */
  const handleDragStart = (event: DragStartEvent) => {
    const dragFiles = resolveDragFiles(event.active.id as string);
    dragActiveRef.current = true;
    springLoadedRef.current = false;
    activeDragFilesRef.current = dragFiles;
    setActiveDragFiles(dragFiles);
  };

  /** 拖拽结束：判断是排序、移入文件夹还是移入目录树节点（支持多选整组移动） */
  const handleDragEnd = async (event: DragEndEvent) => {
    dragActiveRef.current = false;
    setActiveDragFiles([]);
    const springGhosted = springLoadedRef.current;
    springLoadedRef.current = false;
    const ghosts = ghostFilesRef.current;
    ghostFilesRef.current = [];
    setGhostFiles([]);
    // 同步从列表移除幽灵占位（成功移动时随后 loadFiles 会以服务端数据覆盖）
    if (ghosts.length > 0) {
      const gids = new Set(ghosts.map(g => g.id));
      setFiles(prev => prev.filter(f => !gids.has(f.id)));
    }
    const { active, over } = event;

    const activeId = active.id as string;
    const dragFiles = resolveDragFiles(activeId);
    /** 移动发起时所在的视图目录：spring-load 后当前视图就是目标目录，乐观清理不得误删 */
    const srcViewPath = currentPath;

    /** 执行移动：单个走 moveFile，多个走 batch-move */
    const moveTo = async (targetPath: string, targetName: string) => {
      if (dragFiles.length === 0) return;
      const pending = dragFiles.filter(f => f.path !== targetPath);
      if (pending.length === 0) {
        message.info('文件已在此目录中');
        return;
      }
      const pendingIds = pending.map(f => f.id);
      const pendingSortIds = pending.map(f => fileSortableId(f));

      // 乐观更新：立刻播放退场动画并在动画结束后移除，不等后端响应，
      // 避免文件在原地"停留一段时间"才消失。
      // spring-load 过的拖拽跳过此清理：视图已在目标目录，被拖卡片作为幽灵
      // 已在 handleDragEnd 即时移除；若仍执行定时清理，会与 loadFiles 的
      // 重绘产生竞态——把刚移入目标目录的文件从界面上误删（需刷新才恢复）。
      if (!springGhosted) {
        setExitingIds(new Set(pendingSortIds));
        window.setTimeout(() => {
          setFiles(prev => prev.filter(f => !(pendingIds.includes(f.id) && f.path === srcViewPath)));
          setExitingIds(prev => {
            const next = new Set(prev);
            pendingSortIds.forEach(id => next.delete(id));
            return next;
          });
        }, exitAnimMs());
      }
      dispatchSelection({ type: 'remove', ids: pendingSortIds });

      try {
        if (pending.length === 1) {
          await fileStorageApi.moveFile(pending[0].id, targetPath);
        } else {
          await fileStorageApi.batchMoveFiles(pendingIds, targetPath);
        }
        message.success(
          pending.length === 1
            ? `已移动到「${targetName}」`
            : `已移动 ${pending.length} 个文件到「${targetName}」`,
        );
        loadTree();
        loadFiles();
      } catch {
        message.error('移动失败');
        // 回滚：重新拉取真实列表，恢复被乐观移除的文件
        loadFiles();
      }
    };

    // 空白处释放：spring-load 过的拖拽视为「移入当前目录」（Finder 行为），否则静默结束
    if (!over) {
      if (springGhosted && dragFiles.length > 0) {
        const dirName = currentPath === '' ? '根目录' : currentPath.split('/').pop() || currentPath;
        await moveTo(currentPath, dirName);
      }
      return;
    }

    const overId = String(over.id);

    // 落在被拖项自身上（dnd-kit 会把 active 的幽灵卡片也报成 over）：
    // 处理同「空白处释放」
    if (overId === activeId) {
      if (springGhosted && dragFiles.length > 0) {
        const dirName = currentPath === '' ? '根目录' : currentPath.split('/').pop() || currentPath;
        await moveTo(currentPath, dirName);
      }
      return;
    }

    // spring-load 进入目标目录后，落在其他文件上也视为「移入当前目录」（Finder 行为）。
    // 不处理会被自定义排序分支吞掉（被拖文件是幽灵、不在列表中，oldIndex=-1 静默 return），
    // 造成「必须拖到末尾空白处才能移入」。若被拖文件已在当前目录（绕一圈回到原目录），
    // 则放行走排序/原逻辑。
    if (springGhosted && overId.startsWith('file-')
        && dragFiles.length > 0 && !dragFiles.every(f => f.path === currentPath)) {
      const dirName = currentPath === '' ? '根目录' : currentPath.split('/').pop() || currentPath;
      await moveTo(currentPath, dirName);
      return;
    }

    // ── 拖动的是文件夹（Story 5.7 / FR-29）→ 目录移动 ──
    if (activeId.startsWith('dir-')) {
      const draggedDir = directories.find(d => dirDroppableId(d) === activeId);
      if (!draggedDir) return;

      let targetParentPath: string | null = null;
      let targetName = '根目录';
      if (overId.startsWith('tree-')) {
        targetParentPath = overId.slice(5);
      } else if (overId.startsWith('crumb-')) {
        targetParentPath = overId.slice(6);
      } else if (overId.startsWith('dir-')) {
        const overDir = directories.find(d => dirDroppableId(d) === overId);
        if (!overDir) return;
        targetParentPath = overDir.path;
        targetName = overDir.name;
      }
      if (targetParentPath === null) return;

      // 防循环：不能移到自身或自身子目录（FR-28）
      if (targetParentPath === draggedDir.path || targetParentPath.startsWith(`${draggedDir.path}/`)) {
        message.warning('不能移动到自身或其子目录');
        return;
      }
      // 已在该父目录下
      if (draggedDir.parentPath === targetParentPath) {
        message.info(`「${draggedDir.name}」已在该目录中`);
        return;
      }

      try {
        await fileStorageApi.moveDirectory(draggedDir.id, targetParentPath);
        message.success(`已移动文件夹「${draggedDir.name}」到「${targetName}」`);
        loadTree();
        loadFiles();
      } catch {
        message.error('移动文件夹失败');
      }
      return;
    }

    // 拖到目录树节点上 → 移动文件（整组）到该目录
    if (overId.startsWith('tree-')) {
      const targetPath = overId.slice(5); // 去掉 'tree-' 前缀
      const targetName = targetPath === '' ? '根目录' : targetPath.split('/').pop() || targetPath;
      await moveTo(targetPath, targetName);
      return;
    }

    // 拖到面包屑上级目录段 → 移动到该目录（Story 5.7 / FR-31）
    if (overId.startsWith('crumb-')) {
      const targetPath = overId.slice(6);
      const targetName = targetPath === '' ? '根目录' : targetPath.split('/').pop() || targetPath;
      await moveTo(targetPath, targetName);
      return;
    }

    // 拖到网格文件夹上 → 移动文件（整组）
    if (overId.startsWith('dir-')) {
      const dir = directories.find(d => dirDroppableId(d) === overId);
      if (!dir) return;
      await moveTo(dir.path, dir.name);
      return;
    }

    // 「自定义」排序模式：拖到另一个文件上 = 调整顺序（仅被拖文件参与重排，
    // 多选整组拖拽仍走上方文件夹/树/面包屑的移动分支）
    if (sortBy === 'custom' && overId.startsWith('file-')) {
      // 搜索结果是跨目录集合，目录内顺序没有意义，且提交会被后端目录校验拒绝
      if (isSearching) {
        message.info('搜索结果不支持拖拽排序，请清除搜索后在目录内操作');
        return;
      }
      // 只重排确实属于当前目录的文件：排除幽灵卡片与任何 path 不符的残留记录，
      // 否则后端「文件不在指定目录中」会整批拒绝
      const ghostIdSet = new Set(ghostFilesRef.current.map(g => g.id));
      const list = files.filter(f => !ghostIdSet.has(f.id) && f.path === currentPath);
      const oldIndex = list.findIndex(f => fileSortableId(f) === activeId);
      const newIndex = list.findIndex(f => fileSortableId(f) === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      // 乐观更新：立即重排，随后整体提交新顺序
      const reordered = arrayMove(list, oldIndex, newIndex);
      setFiles(reordered);
      try {
        await fileStorageApi.updateFileOrder(currentPath, reordered.map(f => f.id));
      } catch {
        message.error('保存排序失败');
        loadFiles();
      }
      return;
    }

    // 其他排序模式下，拖到另一个文件上不触发任何操作（排序统一由后端字段决定）
  };

  /** 拖拽被取消（拖拽源节点意外卸载等）：清理幽灵并恢复真实列表 */
  const handleDragCancel = () => {
    dragActiveRef.current = false;
    springLoadedRef.current = false;
    activeDragFilesRef.current = [];
    ghostFilesRef.current = [];
    setActiveDragFiles([]);
    setGhostFiles([]);
    loadFiles();
  };

  // 共享相关 state
  const [activeView, setActiveView] = useState<'my' | 'shared' | 'myShares'>('my');
  // 外链分享（PRD §4.12）
  const [shareLinkModalOpen, setShareLinkModalOpen] = useState(false);
  const [shareLinkTarget, setShareLinkTarget] = useState<FileInfo | null>(null);
  const [myShareLinksReloadKey, setMyShareLinksReloadKey] = useState(0);
  const [sharedFiles, setSharedFiles] = useState<SharedWithMeFile[]>([]);
  const [sharedRows, setSharedRows] = useState<FileInfo[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<FileInfo | null>(null);
  const [shareList, setShareList] = useState<ShareInfo[]>([]);
  const [shareUserIds, setShareUserIds] = useState<number[]>([]);
  const [sharePermission, setSharePermission] = useState<'VIEW' | 'EDIT'>('VIEW');
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [copyToMineOpen, setCopyToMineOpen] = useState(false);
  const [copyToMineTarget, setCopyToMineTarget] = useState<FileInfo | null>(null);
  const [copyToMinePath, setCopyToMinePath] = useState('');
  const [copyToMineLoading, setCopyToMineLoading] = useState(false);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userSearchOptions, setUserSearchOptions] = useState<UserOption[]>([]);

  // 详情弹窗
  const [detailTarget, setDetailTarget] = useState<FileInfo | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const [fileResp, dirs, quotaInfo] = await Promise.all([
        fileStorageApi.listFiles(currentPath, 0, 1000, sortBy, sortDir),
        fileStorageApi.listDirectories(currentPath, sortDir),
        fileStorageApi.getQuotaInfo(),
      ]);
      setFiles(() => {
        // spring-load 幽灵合并：拖拽跨目录时保留被拖文件卡片，防止拖拽源节点卸载导致拖拽中断
        if (!dragActiveRef.current || ghostFilesRef.current.length === 0) return fileResp.items;
        const ids = new Set(fileResp.items.map(f => f.id));
        return [...fileResp.items, ...ghostFilesRef.current.filter(g => !ids.has(g.id))];
      });
      setDirectories(dirs);
      setQuota(quotaInfo);
    } catch {
      message.error('加载文件列表失败');
    } finally {
      setLoading(false);
    }
    // sortBy / sortDir 变化时重新从后端取排序后的结果（Story 5.5）
  }, [currentPath, sortBy, sortDir]);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const tree = await fileStorageApi.getDirectoryTree();
      setDirectoryTree(tree);
    } catch {
      message.error('加载目录树失败');
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadFiles();
      loadTree();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialLoadDone.current && !isSearching) {
      loadFiles();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  // 排序字段/方向变化 → 重新向后端取排序结果（Story 5.5）
  // 首次加载交给上面的 mount effect，避免重复请求
  useEffect(() => {
    if (initialLoadDone.current && !isSearching) {
      loadFiles();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir]);

  useEffect(() => {
    if (activeView === 'shared') {
      loadSharedFiles();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  const refreshAll = useCallback(() => {
    loadFiles();
    loadTree();
  }, [loadFiles, loadTree]);

  // ==================== 共享相关 ====================

  const loadSharedFiles = useCallback(async () => {
    setSharedLoading(true);
    try {
      const data = await fileStorageApi.listSharedWithMe();
      setSharedFiles(data);
      // 转换为统一的 FileInfo 结构，共享文件天然为已共享状态
      const rows: FileInfo[] = data.map((s) => ({
        id: s.fileId,
        fileName: s.fileName,
        path: s.path,
        sizeBytes: s.sizeBytes,
        mimeType: s.mimeType,
        createdAt: s.sharedAt,
        updatedAt: s.sharedAt,
        shared: true,
        ownerUserId: s.ownerUserId,
        ownerUsername: s.ownerUsername,
      }));
      setSharedRows(rows);
    } catch {
      message.error('加载共享文件失败');
    } finally {
      setSharedLoading(false);
    }
  }, []);

  const openShareModal = useCallback(async (file: FileInfo) => {
    setShareTarget(file);
    setShareUserIds([]);
    setSharePermission('VIEW');
    setUserSearchOptions([]);
    setShareModalOpen(true);
    try {
      const shares = await fileStorageApi.listFileShares(file.id);
      setShareList(shares);
    } catch {
      message.error('加载共享信息失败');
    }
  }, []);

  const handleShareSubmit = useCallback(async () => {
    if (!shareTarget || shareUserIds.length === 0) {
      message.warning('请选择要共享的用户');
      return;
    }
    setShareSubmitting(true);
    try {
      await Promise.all(
        shareUserIds.map(userId => fileStorageApi.shareFile(shareTarget.id, userId, sharePermission))
      );
      message.success(`已共享给 ${shareUserIds.length} 位用户`);
      const shares = await fileStorageApi.listFileShares(shareTarget.id);
      setShareList(shares);
      setShareUserIds([]);
      setSharePermission('VIEW');
      // 刷新文件列表，更新“共享”状态列
      loadFiles();
    } catch {
      message.error('共享失败');
    } finally {
      setShareSubmitting(false);
    }
  }, [shareTarget, shareUserIds, sharePermission, loadFiles]);

  const handleUnshare = useCallback(async (shareId: number) => {
    if (!shareTarget) return;
    try {
      await fileStorageApi.unshareFile(shareTarget.id, shareId);
      message.success('已取消共享');
      const shares = await fileStorageApi.listFileShares(shareTarget.id);
      setShareList(shares);
    } catch {
      message.error('取消共享失败');
    }
  }, [shareTarget]);

  // 更新共享权限（可编辑 / 可查看）
  const handleUpdatePermission = useCallback(async (shareId: number, permission: 'VIEW' | 'EDIT') => {
    if (!shareTarget) return;
    try {
      await fileStorageApi.updateSharePermission(shareTarget.id, shareId, permission);
      message.success(permission === 'EDIT' ? '已设为可编辑' : '已设为可查看');
      const shares = await fileStorageApi.listFileShares(shareTarget.id);
      setShareList(shares);
    } catch {
      message.error('更新权限失败');
    }
  }, [shareTarget]);

  // 打开「移入我的文件」目录选择弹窗
  const openCopyToMine = useCallback((file: FileInfo) => {
    setCopyToMineTarget(file);
    setCopyToMinePath('');
    setCopyToMineOpen(true);
    loadTree();
  }, [loadTree]);

  // 确认将共享文件复制到选中的目录
  const confirmCopyToMine = useCallback(async () => {
    if (!copyToMineTarget) return;
    setCopyToMineLoading(true);
    try {
      const copied = await fileStorageApi.copySharedFileToMine(copyToMineTarget.id, copyToMinePath);
      message.success(`已保存到「我的文件」：${copied.fileName}`);
      setCopyToMineOpen(false);
      // 关闭预览弹窗：文件已移入我的文件，避免残留共享文件状态（显示“移入我的文件”/编辑无权限）
      closePreview();
      loadFiles();
    } catch {
      message.error('移入我的文件失败');
    } finally {
      setCopyToMineLoading(false);
    }
  }, [copyToMineTarget, copyToMinePath]);

  // 用户远程搜索（防抖）
  const handleUserSearch = useCallback(async (value: string) => {
    if (!value || value.length < 1) {
      setUserSearchOptions([]);
      return;
    }
    setUserSearchLoading(true);
    try {
      const users = await fileStorageApi.searchUsers(value);
      // 排除已共享的用户
      const filtered = users.filter(u => !shareList.some(s => s.sharedWithUserId === u.id));
      setUserSearchOptions(filtered);
    } catch {
      // 静默失败
    } finally {
      setUserSearchLoading(false);
    }
  }, [shareList]);

  const handleSearch = async () => {
    if (!searchKeyword.trim()) {
      setIsSearching(false);
      loadFiles();
      return;
    }
    setLoading(true);
    setIsSearching(true);
    dispatchSelection({ type: 'clear' });
    try {
      const resp = await fileStorageApi.searchFiles(searchKeyword);
      setFiles(resp.items);
      setDirectories([]);
    } catch {
      message.error('搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await fileStorageApi.uploadFile(file, currentPath);
      message.success(`${file.name} 上传成功`);
      loadFiles();
      loadTree();
    } catch {
      message.error(`${file.name} 上传失败`);
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleDownload = async (fileId: number) => {
    try {
      const { blob, filename } = await fileStorageApi.downloadFile(fileId);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      message.error('下载失败');
    }
  };

  // 普通预览：owner 默认可编辑；共享给我的文件按共享权限推断（仅 EDIT 可编辑）
  // 注意：file.shared 在“我的文件”里表示“我共享给了别人”，不能用于判断是否来自共享视图，
  // 必须以 ownerUserId 区分（仅“共享给我的文件”才有该字段）
  const handlePreview = async (file: FileInfo) => {
    const cat = getFileCategory(file.mimeType, file.fileName);
    const isSharedToMe = file.ownerUserId != null;
    const sharedPerm = isSharedToMe
      ? sharedFiles.find((s) => s.fileId === file.id)?.permission
      : undefined;
    const previewEditable = isSharedToMe ? sharedPerm === 'EDIT' : true;
    setPreviewFile(file);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewObjectUrl(null);
    setPreviewText(null);
    setEditing(false);
    setEditContent('');
    setPreviewCanEdit(previewEditable);

    try {
      if (cat === 'text') {
        const resp = await fileStorageApi.textPreview(file.id);
        setPreviewText(resp.content);
      } else {
        const blob = await fileStorageApi.previewFile(file.id);
        const url = URL.createObjectURL(blob);
        setPreviewObjectUrl(url);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '预览失败';
      message.error(msg);
      setPreviewText(`预览失败: ${msg}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    // 用函数式 setState 取最新值，避免在 useCallback 闭包中拿到过期的 previewObjectUrl
    setPreviewObjectUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setPreviewOpen(false);
    setPreviewFile(null);
    setPreviewText(null);
    setEditing(false);
    setEditContent('');
  };

  // 共享文件的预览（构造 FileInfo 对象复用现有预览逻辑）

  // 文本预览/编辑：canEdit 决定预览中的"编辑"按钮是否可用，预览默认只读
  const handlePreviewAndEdit = async (file: FileInfo, canEdit = true) => {
    const cat = getFileCategory(file.mimeType, file.fileName);
    setPreviewFile(file);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewObjectUrl(null);
    setPreviewText(null);
    setEditing(false);
    setPreviewCanEdit(canEdit);
    setEditContent('');

    try {
      if (cat === 'text') {
        const resp = await fileStorageApi.textPreview(file.id);
        setPreviewText(resp.content);
      } else {
        const blob = await fileStorageApi.previewFile(file.id);
        const url = URL.createObjectURL(blob);
        setPreviewObjectUrl(url);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '预览失败';
      message.error(msg);
      setPreviewText(`预览失败: ${msg}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const startEditing = () => {
    if (previewText && previewCanEdit) {
      setEditContent(previewText);
      setEditing(true);
    }
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditContent('');
  };

  const saveEditing = async () => {
    if (!previewFile) return;
    if (!previewCanEdit) {
      message.warning('当前文件为只读，无编辑权限');
      return;
    }
    setSaving(true);
    try {
      await fileStorageApi.updateTextContent(previewFile.id, editContent);
      message.success('保存成功');
      setPreviewText(editContent);
      setEditing(false);
      setEditContent('');
      // 刷新列表（文件大小可能变化）；同时刷新共享列表，覆盖共享视图场景
      refreshAll();
      loadSharedFiles();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteFile = (file: FileInfo) => {
    setDeleteFileTarget(file);
  };

  const openDeleteDir = (dir: DirRow) => {
    setDeleteDirTarget(dir);
  };

  const confirmDeleteFile = async () => {
    if (!deleteFileTarget) return;
    setDeleting(true);
    try {
      await fileStorageApi.deleteFile(deleteFileTarget.id);
      message.success('文件已删除');
      dispatchSelection({ type: 'remove', ids: [fileSortableId(deleteFileTarget)] });
      loadFiles();
      loadTree();
    } catch {
      message.error('删除失败');
    } finally {
      setDeleting(false);
      setDeleteFileTarget(null);
    }
  };

  const confirmDeleteDir = async () => {
    if (!deleteDirTarget) return;
    setDeleting(true);
    try {
      await fileStorageApi.deleteDirectory(deleteDirTarget.id);
      message.success('目录已删除');
      dispatchSelection({ type: 'remove', ids: [dirDroppableId({ id: deleteDirTarget.id })] });
      refreshAll();
    } catch {
      message.error('删除目录失败');
    } finally {
      setDeleting(false);
      setDeleteDirTarget(null);
    }
  };

  const handleCreateDir = async () => {
    if (!newDirName.trim()) return;
    try {
      await fileStorageApi.createDirectory(newDirName, currentPath);
      message.success('目录创建成功');
      setNewDirModalOpen(false);
      setNewDirName('');
      refreshAll();
    } catch {
      message.error('创建目录失败');
    }
  };

  // ── 行内重命名（macOS Finder 风格）──

  /** 开始行内重命名：传入卡片 id（file-{id} 或 dir-{id}） */
  const startRename = (id: string) => {
    dispatchSelection({ type: 'select', id });
    setRenamingId(id);
  };

  /** 确认文件重命名 */
  const confirmFileRename = async (fileId: number, newName: string) => {
    setRenamingId(null);
    try {
      await fileStorageApi.renameFile(fileId, newName);
      refreshAll();
      loadSharedFiles();
    } catch {
      message.error('重命名失败');
    }
  };

  /** 确认目录重命名 */
  const confirmDirRename = async (dirId: number, dirPath: string, newName: string) => {
    setRenamingId(null);
    try {
      await fileStorageApi.renameDirectory(dirId, newName);
      escapeAffectedPath(dirPath);
      refreshAll();
    } catch {
      message.error('重命名失败');
    }
  };

  const handleMove = async () => {
    if (!moveTarget) return;
    try {
      await fileStorageApi.moveFile(moveTarget.id, moveTargetPath);
      message.success('移动成功');
      dispatchSelection({ type: 'remove', ids: [fileSortableId(moveTarget)] });
      setMoveModalOpen(false);
      setMoveTarget(null);
      setMoveTargetPath('');
      loadFiles();
    } catch {
      message.error('移动失败');
    }
  };

  // ── Story 5.6：目录移动（FR-28）— 重命名改为行内，移动仍用弹窗 ──

  /** 目录路径变化后：若当前路径位于受影响前缀下，回到根目录 */
  const escapeAffectedPath = (oldPath: string) => {
    if (currentPath === oldPath || currentPath.startsWith(oldPath + '/')) {
      setCurrentPath('');
    }
  };

  const openDirMove = (dir: DirRow) => {
    setDirMoveTarget(dir);
    setDirMoveTargetPath('');
    setDirMoveOpen(true);
  };

  const confirmDirMove = async () => {
    if (!dirMoveTarget) return;
    const oldPath = dirMoveTarget.path;
    const target = dirMoveTargetPath;
    // 前端先拦一道（后端仍会校验）
    if (target === oldPath || target.startsWith(oldPath + '/')) {
      message.warning('不能将目录移动到自身或其子目录下');
      return;
    }
    try {
      await fileStorageApi.moveDirectory(dirMoveTarget.id, target);
      const dirName = target === '' ? '根目录' : target.split('/').pop() || target;
      message.success(`已移动到「${dirName}」`);
      setDirMoveOpen(false);
      setDirMoveTarget(null);
      setDirMoveTargetPath('');
      escapeAffectedPath(oldPath);
      refreshAll();
    } catch {
      message.error('移动失败');
    }
  };

  const navigateToDir = (path: string, opts?: { keepSelection?: boolean }) => {
    setCurrentPath(path);
    setIsSearching(false);
    setSearchKeyword('');
    if (!opts?.keepSelection) dispatchSelection({ type: 'clear' });
  };

  /**
   * spring-load 进入目录（Story 5.7 / FR-30）：
   * 把拖拽中的文件记为幽灵并合并进新目录列表，使拖拽源 DOM 节点保持挂载，
   * dnd-kit 拖拽不中断；此后在任意位置释放都能正确移动
   * （新目录文件夹/树节点/面包屑正常移动，空白处释放 = 移入当前目录）。
   */
  const springLoadTo = (path: string) => {
    if (dragActiveRef.current && activeDragFilesRef.current.length > 0) {
      const dragged = activeDragFilesRef.current;
      ghostFilesRef.current = dragged;
      springLoadedRef.current = true;
      setGhostFiles(dragged);
    }
    navigateToDir(path, { keepSelection: true });
  };

  const pathSegments = currentPath ? currentPath.split('/') : [];

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      handleUpload(file);
      return false;
    },
    showUploadList: false,
    multiple: true,
  };

  const rows: RowItem[] = useMemo(() => {
    const dirRows: DirRow[] = directories.map(d => ({ type: 'dir' as const, id: d.id, name: d.name, path: d.path }));
    const fileRows: FileRow[] = files.map(f => ({ ...f, type: 'file' as const }));

    // Story 5.5：文件顺序完全由后端排序结果决定，前端不再做任何重排。
    // 目录排在文件前面 → 天然满足「目录置顶」。
    return [...dirRows, ...fileRows];
  }, [directories, files]);

  // ── 多选：有序 id 列表（用于 Shift 范围选中） ──
  const allRowIds = useMemo(
    () => rows.map(r => `${r.type}-${r.id}`),
    [rows],
  );

  // ── 多选：共享文件视图的有序 id 列表 ──
  const sharedRowIds = useMemo(
    () => sharedRows.map(f => `file-${f.id}`),
    [sharedRows],
  );

  // ── 多选：卡片点击处理 ──
  const handleItemClick = useCallback((e: React.MouseEvent, id: string) => {
    const isMultiSelectKey = e.metaKey || e.ctrlKey;
    const isRangeKey = e.shiftKey;
    // 共享文件视图用 sharedRowIds 做 Shift 范围基准
    const allIds = activeView === 'shared' ? sharedRowIds : allRowIds;

    if (isRangeKey && selection.lastSelectedId) {
      dispatchSelection({ type: 'selectRange', fromId: selection.lastSelectedId, toId: id, allIds });
    } else if (isMultiSelectKey) {
      dispatchSelection({ type: 'toggle', id });
    } else {
      dispatchSelection({ type: 'select', id });
    }
  }, [selection.lastSelectedId, allRowIds, sharedRowIds, activeView]);

  // ── 多选：列表区域空白处点击清空（挂在整个 fs-list-area，覆盖网格外的空白） ──
  const handleBlankClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.fs-grid-item')) {
      dispatchSelection({ type: 'clear' });
    }
  }, []);

  // ── 多选：键盘事件（Cmd+A / Esc） ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 仅在「我的文件」或「共享文件」网格视图激活时响应
      if (activeView === 'myShares') return;

      // Cmd+A / Ctrl+A 全选
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        // 检查焦点是否在输入框/搜索框内，若是则不拦截
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) {
          return;
        }
        e.preventDefault();
        const ids = activeView === 'shared'
          ? sharedRows.map(f => `file-${f.id}`)
          : allRowIds;
        if (ids.length > 0) {
          dispatchSelection({ type: 'selectAll', ids });
        }
      }

      // Esc 清空
      if (e.key === 'Escape') {
        if (selection.selectedIds.size > 0) {
          dispatchSelection({ type: 'clear' });
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeView, allRowIds, sharedRows, selection.selectedIds.size]);

  // ── 多选：切换视图/搜索时清空选择 ──
  useEffect(() => {
    dispatchSelection({ type: 'clear' });
  }, [activeView]);

  // ── 多选：橡皮筋框选 ──
  const getGridItems = useCallback(() => {
    const cards = document.querySelectorAll('.fs-grid-item');
    return Array.from(cards).map(el => {
      const id = el.getAttribute('data-item-id') || '';
      return { id, rect: el.getBoundingClientRect() };
    });
  }, []);

  const handleRubberBandSelect = useCallback((ids: string[], additive: boolean) => {
    if (additive) {
      // 追加模式：有交集才追加，无交集不变
      if (ids.length > 0) {
        dispatchSelection({ type: 'addToSelection', ids });
      }
    } else {
      // 替换模式：无交集也清空（与 Finder 行为一致）
      dispatchSelection({ type: 'selectAll', ids });
    }
  }, []);

  const { marqueeRect } = useRubberBandSelection({
    getItems: getGridItems,
    onSelect: handleRubberBandSelect,
    scrollContainerRef: listAreaRef,
  });

  // ── 批量操作（Story 5.3）──
  /** 选集中的文件 ID（过滤掉目录，后端批量接口仅支持文件） */
  const selectedFileIds = useMemo(
    () => [...selection.selectedIds]
      .filter(id => id.startsWith('file-'))
      .map(id => Number(id.slice(5))),
    [selection.selectedIds],
  );

  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleteIds, setBatchDeleteIds] = useState<number[]>([]);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);
  const [batchMoveIds, setBatchMoveIds] = useState<number[]>([]);
  const [batchMovePath, setBatchMovePath] = useState('');
  const [batchMoving, setBatchMoving] = useState(false);
  const [batchShareOpen, setBatchShareOpen] = useState(false);
  const [batchShareIds, setBatchShareIds] = useState<number[]>([]);
  const [batchShareUserIds, setBatchShareUserIds] = useState<number[]>([]);
  const [batchSharePermission, setBatchSharePermission] = useState<'VIEW' | 'EDIT'>('VIEW');
  const [batchShareSubmitting, setBatchShareSubmitting] = useState(false);

  /** 批量下载：逐个触发浏览器下载（v1 不打包 ZIP） */
  const handleBatchDownload = useCallback(async (ids: number[]) => {
    const hide = message.loading(`正在下载 ${ids.length} 个文件…`, 0);
    let ok = 0;
    for (const id of ids) {
      try {
        const { blob, filename } = await fileStorageApi.downloadFile(id);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        ok++;
      } catch {
        // 单个失败继续下载其余文件
      }
    }
    hide();
    if (ok === ids.length) {
      message.success(`已下载 ${ok} 个文件`);
    } else {
      message.warning(`已下载 ${ok}/${ids.length} 个文件`);
    }
  }, []);

  const openBatchDelete = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setBatchDeleteIds(ids);
    setBatchDeleteOpen(true);
  }, []);

  const confirmBatchDelete = useCallback(async () => {
    setBatchDeleting(true);
    try {
      const result = await fileStorageApi.batchDeleteFiles(batchDeleteIds);
      message.success(`已删除 ${result.success.length} 个文件`);
      setBatchDeleteOpen(false);
      dispatchSelection({ type: 'clear' });
      refreshAll();
    } catch {
      message.error('批量删除失败');
    } finally {
      setBatchDeleting(false);
    }
  }, [batchDeleteIds, refreshAll]);

  const openBatchMove = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setBatchMoveIds(ids);
    setBatchMovePath('');
    setBatchMoveOpen(true);
    loadTree();
  }, [loadTree]);

  const confirmBatchMove = useCallback(async () => {
    setBatchMoving(true);
    try {
      const result = await fileStorageApi.batchMoveFiles(batchMoveIds, batchMovePath);
      const dirName = batchMovePath === '' ? '根目录' : batchMovePath.split('/').pop() || batchMovePath;
      message.success(`已移动 ${result.success.length} 个文件到「${dirName}」`);
      setBatchMoveOpen(false);
      dispatchSelection({ type: 'clear' });
      refreshAll();
    } catch {
      message.error('批量移动失败');
    } finally {
      setBatchMoving(false);
    }
  }, [batchMoveIds, batchMovePath, refreshAll]);

  const openBatchShare = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setBatchShareIds(ids);
    setBatchShareUserIds([]);
    setBatchSharePermission('VIEW');
    setUserSearchOptions([]);
    setBatchShareOpen(true);
  }, []);

  // 批量共享（v1 循环调用单文件共享接口）
  const confirmBatchShare = useCallback(async () => {
    if (batchShareUserIds.length === 0) {
      message.warning('请选择要共享的用户');
      return;
    }
    setBatchShareSubmitting(true);
    try {
      let ok = 0;
      for (const fileId of batchShareIds) {
        for (const userId of batchShareUserIds) {
          try {
            await fileStorageApi.shareFile(fileId, userId, batchSharePermission);
            ok++;
          } catch {
            // 单个失败继续
          }
        }
      }
      const total = batchShareIds.length * batchShareUserIds.length;
      if (ok === total) {
        message.success(`已共享 ${batchShareIds.length} 个文件给 ${batchShareUserIds.length} 位用户`);
      } else {
        message.warning(`部分共享失败（${ok}/${total}）`);
      }
      setBatchShareOpen(false);
      loadFiles();
    } finally {
      setBatchShareSubmitting(false);
    }
  }, [batchShareIds, batchShareUserIds, batchSharePermission, loadFiles]);

  /** 批量共享用户搜索（复用单文件共享的搜索逻辑） */
  const handleBatchUserSearch = useCallback(async (value: string) => {
    if (!value || value.length < 1) {
      setUserSearchOptions([]);
      return;
    }
    setUserSearchLoading(true);
    try {
      const users = await fileStorageApi.searchUsers(value);
      setUserSearchOptions(users);
    } catch {
      // 静默失败
    } finally {
      setUserSearchLoading(false);
    }
  }, []);

  /** 批量操作右键菜单：作用于整个选集 */
  const batchFileMenu = useCallback((ids: number[]): MenuProps => ({
    items: [
      { key: 'batch-download', label: `下载（${ids.length} 项）`, onClick: () => void handleBatchDownload(ids) },
      { key: 'batch-move', label: '移动到…', onClick: () => openBatchMove(ids) },
      { key: 'batch-share', label: '共享…', onClick: () => openBatchShare(ids) },
      { type: 'divider' as const },
      { key: 'batch-delete', label: `移到废纸篓（${ids.length} 项）`, danger: true, onClick: () => openBatchDelete(ids) },
    ],
  }), [handleBatchDownload, openBatchMove, openBatchShare, openBatchDelete]);

  const fileActionsMenu = (record: FileInfo): MenuProps => ({
    items: [
      ...(isPreviewable(record.mimeType, record.fileName) ? [{
        key: 'preview',
        icon: <EyeOutlined />,
        label: '预览',
        onClick: () => handlePreview(record),
      }] : []),
      ...(getFileCategory(record.mimeType, record.fileName) === 'text' ? [{
        key: 'edit',
        icon: <FormOutlined />,
        label: '编辑',
        onClick: () => handlePreviewAndEdit(record),
      }] : []),
      {
        key: 'download',
        icon: <DownloadOutlined />,
        label: '下载',
        onClick: () => handleDownload(record.id),
      },
      {
        key: 'detail',
        icon: <InfoCircleOutlined />,
        label: '详情',
        onClick: () => { setDetailTarget(record); setDetailModalOpen(true); },
      },
      {
        key: 'rename',
        icon: <EditOutlined />,
        label: '重命名',
        onClick: () => startRename(`file-${record.id}`),
      },
      {
        key: 'move',
        icon: <FolderOpenOutlined />,
        label: '移动到',
        onClick: () => { setMoveTarget(record); setMoveTargetPath(''); setMoveModalOpen(true); },
      },
      {
        key: 'share',
        icon: <ShareAltOutlined />,
        label: '共享',
        onClick: () => openShareModal(record),
      },
      {
        key: 'share-link',
        icon: <LinkOutlined />,
        label: '创建分享链接',
        onClick: () => { setShareLinkTarget(record); setShareLinkModalOpen(true); },
      },
      { type: 'divider' as const },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除',
        danger: true,
        onClick: () => openDeleteFile(record),
      },
    ],
  });

  const dirActionsMenu = (record: DirRow): MenuProps => ({
    items: [
      {
        key: 'open',
        icon: <FolderOpenOutlined />,
        label: '打开',
        onClick: () => navigateToDir(record.path),
      },
      { type: 'divider' as const },
      {
        key: 'rename',
        icon: <EditOutlined />,
        label: '重新命名',
        onClick: () => startRename(`dir-${record.id}`),
      },
      {
        key: 'move',
        icon: <RightOutlined />,
        label: '移动到…',
        onClick: () => openDirMove(record),
      },
      { type: 'divider' as const },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除',
        danger: true,
        onClick: () => openDeleteDir(record),
      },
    ],
  });

  // 网格右键菜单：无图标、Finder 风格文案，避免菜单被图标列撑宽
  // 右键的是选集中一员且选集文件数 > 1 时，切换为批量菜单（作用于整个选集）
  const gridFileMenu = (file: FileInfo): MenuProps => {
    if (selection.selectedIds.has(`file-${file.id}`) && selectedFileIds.length > 1) {
      return batchFileMenu(selectedFileIds);
    }
    return {
      items: [
        ...(isPreviewable(file.mimeType, file.fileName) ? [{
          key: 'preview',
          label: '预览',
          onClick: () => handlePreview(file),
        }] : []),
        ...(getFileCategory(file.mimeType, file.fileName) === 'text' ? [{
          key: 'edit',
          label: '编辑',
          onClick: () => handlePreviewAndEdit(file),
        }] : []),
        { key: 'download', label: '下载', onClick: () => handleDownload(file.id) },
        { key: 'detail', label: '显示简介', onClick: () => { setDetailTarget(file); setDetailModalOpen(true); } },
        { key: 'rename', label: '重新命名', onClick: () => startRename(`file-${file.id}`) },
        { key: 'move', label: '移动到…', onClick: () => { setMoveTarget(file); setMoveTargetPath(''); setMoveModalOpen(true); } },
        { key: 'share', label: '共享…', onClick: () => openShareModal(file) },
        { key: 'share-link', label: '创建分享链接…', onClick: () => { setShareLinkTarget(file); setShareLinkModalOpen(true); } },
        { type: 'divider' as const },
        { key: 'delete', label: '移到废纸篓', danger: true, onClick: () => openDeleteFile(file) },
      ],
    };
  };

  const gridDirMenu = (dir: DirRow): MenuProps => ({
    items: [
      { key: 'open', label: '打开', onClick: () => navigateToDir(dir.path) },
      { type: 'divider' as const },
      { key: 'rename', label: '重新命名', onClick: () => startRename(`dir-${dir.id}`) },
      { key: 'move', label: '移动到…', onClick: () => openDirMove(dir) },
      { type: 'divider' as const },
      { key: 'delete', label: '移到废纸篓', danger: true, onClick: () => openDeleteDir(dir) },
    ],
  });

  // 共享文件网格右键菜单：与文件视图一致，按共享权限控制编辑/重命名
  const sharedFileMenu = (file: FileInfo): MenuProps => {
    const perm =
      sharedFiles.find((s) => s.fileId === file.id)?.permission ?? 'VIEW';
    const canEdit = perm === 'EDIT' && getFileCategory(file.mimeType, file.fileName) === 'text';
    const canRename = perm === 'EDIT';
    const items: MenuProps['items'] = [
      ...(isPreviewable(file.mimeType, file.fileName) ? [{
        key: 'preview',
        label: '预览',
        onClick: () => handlePreviewAndEdit(file, canEdit),
      }] : []),
      ...(canEdit ? [{
        key: 'edit',
        label: '编辑',
        onClick: () => handlePreviewAndEdit(file, canEdit),
      }] : []),
      {
        key: 'download',
        label: '下载',
        onClick: () => handleDownload(file.id),
      },
      {
        key: 'copy-to-mine',
        label: '移入我的文件',
        onClick: () => openCopyToMine(file),
      },
      { type: 'divider' as const },
      {
        key: 'info',
        label: '显示简介',
        onClick: () => {
          setDetailTarget(file);
          setDetailModalOpen(true);
        },
      },
      ...(canRename ? [{
        key: 'rename',
        label: '重新命名',
        onClick: () => startRename(`file-${file.id}`),
      }] : []),
      ...(canRename ? [{ type: 'divider' as const }] : []),
      ...(canRename ? [{
        key: 'delete',
        label: '移到废纸篓',
        danger: true,
        onClick: () => openDeleteFile(file),
      }] : []),
    ];
    return { items };
  };

  // 共享文件网格（与"我的文件"网格风格一致）
  const renderSharedGrid = () => {
    if (sharedRows.length === 0) return null;
    return (
      <div className="fs-grid">
        {/* 橡皮筋框选选框 */}
        {marqueeRect && (
          <div
            className="fs-rubber-band"
            style={{
              left: marqueeRect.left,
              top: marqueeRect.top,
              width: marqueeRect.width,
              height: marqueeRect.height,
            }}
          />
        )}
        {sharedRows.map((file) => {
          const fileId = `file-${file.id}`;
          const isSelected = selection.selectedIds.has(fileId);
          return (
            <Dropdown
              key={fileId}
              trigger={['contextMenu']}
              overlayClassName="fs-grid-dropdown"
              menu={sharedFileMenu(file)}
            >
              <div
                className={`fs-grid-item${isSelected ? ' fs-grid-item--selected' : ''}`}
                data-item-id={fileId}
                onClick={(e) => handleItemClick(e, fileId)}
                onDoubleClick={() => isPreviewable(file.mimeType, file.fileName) && handlePreview(file)}
              >
                <div className="fs-grid-thumb">
                  {getFileIcon(file.mimeType, 'fs-grid-thumb-icon', file.fileName)}
                  <Tooltip title="已共享给你">
                    <span className="fs-grid-thumb-badge" />
                  </Tooltip>
                </div>
                <div className="fs-grid-info">
                  <div className="fs-grid-name" title={file.fileName}>{file.fileName}</div>
                </div>
              </div>
            </Dropdown>
          );
        })}
      </div>
    );
  };

  const columns = [
    {
      title: '名称',
      key: 'name',
      render: (_: unknown, record: RowItem) => {
        const rowId = record.type === 'dir' ? `dir-${record.id}` : `file-${record.id}`;
        const isRenaming = renamingId === rowId;

        if (record.type === 'dir') {
          return (
            <div className="fs-dir-cell" onClick={() => !isRenaming && navigateToDir(record.path)}>
              <FolderIcon className="fs-dir-cell-icon" size={18} />
              {isRenaming ? (
                <InlineRenameInput
                  value={record.name}
                  isDirectory
                  onConfirm={(newName) => confirmDirRename(record.id, record.path, newName)}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <span
                  className="fs-dir-cell-name"
                  onDoubleClick={(e) => { e.stopPropagation(); setRenamingId(rowId); }}
                >{record.name}</span>
              )}
            </div>
          );
        }
        return (
          <div className="fs-file-cell">
            {getFileIcon(record.mimeType, undefined, record.fileName)}
            {isRenaming ? (
              <InlineRenameInput
                value={record.fileName}
                onConfirm={(newName) => confirmFileRename(record.id, newName)}
                onCancel={() => setRenamingId(null)}
              />
            ) : (
              <span
                className="fs-file-cell-name"
                onDoubleClick={(e) => { e.stopPropagation(); setRenamingId(rowId); }}
              >{record.fileName}</span>
            )}
          </div>
        );
      },
    },
    {
      title: '大小',
      key: 'size',
      width: 110,
      render: (_: unknown, record: RowItem) => (
        record.type === 'dir'
          ? <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
          : <Text type="secondary" style={{ fontSize: 12 }}>{formatSize(record.sizeBytes)}</Text>
      ),
    },
    {
      title: '修改时间',
      key: 'updatedAt',
      width: 170,
      render: (_: unknown, record: RowItem) => (
        record.type === 'dir' ? null : <Text type="secondary" style={{ fontSize: 12 }}>{record.updatedAt}</Text>
      ),
    },
    {
      title: '共享',
      key: 'shared',
      width: 80,
      align: 'center' as const,
      render: (_: unknown, record: RowItem) =>
        record.type === 'dir' ? null : (
          record.shared ? (
            <span className="fs-shared-chip" title="已共享给其他用户">已共享</span>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
          )
        ),
    },
    {
      title: '操作',
      key: 'action',
      width: 56,
      align: 'center' as const,
      render: (_: unknown, record: RowItem) => (
        <Dropdown
          menu={record.type === 'dir' ? dirActionsMenu(record as DirRow) : fileActionsMenu(record as FileInfo)}
          placement="bottomRight"
          arrow
        >
          <Button type="text" icon={<SettingOutlined />} size="small" className="fs-action-btn" />
        </Dropdown>
      ),
    },
  ];

  // ── 拖拽移入文件夹 / 目录树：@dnd-kit 事件处理已在组件上方定义 ──

  const renderGrid = () => {
    if (rows.length === 0 && ghostFiles.length === 0) return null;

    // 文件夹 id 列表（droppable）
    const dirIds = directories.map(d => dirDroppableId(d));
    // spring-load 幽灵卡片 id 集合（渲染为隐形占位，保持拖拽源节点挂载）
    const ghostIds = new Set(ghostFiles.map(f => f.id));
    // 文件 id 列表（sortable）
    const fileIds = rows
      .filter((r): r is FileRow => r.type === 'file')
      .map(f => fileSortableId(f));

    return (
      <div className="fs-grid">
        {/* 橡皮筋框选选框 */}
        {marqueeRect && (
          <div
            className="fs-rubber-band"
            style={{
              left: marqueeRect.left,
              top: marqueeRect.top,
              width: marqueeRect.width,
              height: marqueeRect.height,
            }}
          />
        )}

        {/* 文件夹：droppable 目标 */}
        {dirIds.length > 0 && (
          <SortableContext items={dirIds} strategy={rectSortingStrategy}>
            {directories.map(dir => {
              const dirRow: DirRow = { type: 'dir', id: dir.id, name: dir.name, path: dir.path };
              const dirId = dirDroppableId(dir);
              return (
                <DroppableFolderCard
                  key={dirId}
                  dir={dir}
                  dirId={dirId}
                  isSelected={selection.selectedIds.has(dirId)}
                  isRenaming={renamingId === dirId}
                  onRename={(newName) => confirmDirRename(dir.id, dir.path, newName)}
                  onRenameCancel={() => setRenamingId(null)}
                  onRenameStart={() => setRenamingId(dirId)}
                  onItemClick={(e) => handleItemClick(e, dirId)}
                  onDoubleClick={() => navigateToDir(dir.path)}
                  onSpringLoad={() => springLoadTo(dir.path)}
                  contextMenu={gridDirMenu(dirRow)}
                />
              );
            })}
          </SortableContext>
        )}

        {/* 文件：sortable 可排序项 */}
        {fileIds.length > 0 && (
          <SortableContext items={fileIds} strategy={rectSortingStrategy}>
            {rows
              .filter((r): r is FileRow => r.type === 'file')
              .map(file => {
                const fid = fileSortableId(file);
                // 多选拖拽时：选集中所有卡片都置灰（FR-25 / Finder 行为）
                const inMultiDragSet = activeDragFiles.length > 0 && selection.selectedIds.has(fid);
                return (
                  <SortableFileCard
                    key={fid}
                    file={file}
                    fileId={fid}
                    isSelected={selection.selectedIds.has(fid)}
                    isMultiDragging={inMultiDragSet}
                    isExiting={exitingIds.has(fid)}
                    isRenaming={renamingId === fid}
                    onRename={(newName) => confirmFileRename(file.id, newName)}
                    onRenameCancel={() => setRenamingId(null)}
                    onRenameStart={() => setRenamingId(fid)}
                    isGhost={ghostIds.has(file.id)}
                    isPreviewable={isPreviewable(file.mimeType, file.fileName)}
                    onItemClick={(e) => handleItemClick(e, fid)}
                    onDoubleClick={() => isPreviewable(file.mimeType, file.fileName) && handlePreview(file)}
                    contextMenu={gridFileMenu(file)}
                  />
                );
              })}
          </SortableContext>
        )}
      </div>
    );
  };

  const treeSwitcherIcon: TreeProps['switcherIcon'] = (nodeProps) => {
    const { isLeaf, expanded } = nodeProps as { isLeaf?: boolean; expanded?: boolean };
    if (isLeaf) return null;
    return expanded ? (
      <CaretDownOutlined className="fs-tree-switcher-icon" />
    ) : (
      <CaretRightOutlined className="fs-tree-switcher-icon" />
    );
  };

  const treeIcon: TreeProps['icon'] = (nodeProps) => {
    const { isLeaf, key } = nodeProps as { isLeaf?: boolean; expanded?: boolean; key?: React.Key };
    if (isLeaf) return null;
    if (key === '') return <img src={homeIconUrl} alt="" className="fs-tree-icon-root fs-tree-icon-img" width={16} height={16} draggable={false} />;
    return <FolderIcon className="fs-tree-icon-folder" size={16} />;
  };

  const treeData: TreeProps['treeData'] = useMemo(() => {
    const convert = (nodes: DirectoryTreeNode[]): TreeProps['treeData'] =>
      nodes.map(node => ({
        key: node.path,
        title: <DroppableTreeNode name={node.name} path={node.path} />,
        children: node.children?.length ? convert(node.children) : undefined,
      }));
    return [
      {
        key: '',
        title: <DroppableTreeNode name="根目录" path="" />,
        children: convert(directoryTree),
      },
    ];
  }, [directoryTree]);

  const selectedTreeKeys = useMemo(() => [currentPath], [currentPath]);

  const handleTreeSelect: TreeProps['onSelect'] = (_, info) => {
    // 即使点击已选中节点也导航（info.node 始终可获取）
    const path = (info.node?.key as string) ?? '';
    navigateToDir(path);
  };

  // 拖拽上传
  useEffect(() => {
    const area = listAreaRef.current;
    if (!area) return;

    const handleDragEnter = (e: DragEvent) => {
      // @dnd-kit 使用 PointerEvent，不会触发原生 DragEvent，无需互斥
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current++;
      setDragActive(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) setDragActive(false);
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setDragActive(false);
      const dt = e.dataTransfer;
      if (dt?.files) {
        Array.from(dt.files).forEach(f => handleUpload(f));
      }
    };

    area.addEventListener('dragenter', handleDragEnter);
    area.addEventListener('dragleave', handleDragLeave);
    area.addEventListener('dragover', handleDragOver);
    area.addEventListener('drop', handleDrop);

    return () => {
      area.removeEventListener('dragenter', handleDragEnter);
      area.removeEventListener('dragleave', handleDragLeave);
      area.removeEventListener('dragover', handleDragOver);
      area.removeEventListener('drop', handleDrop);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  return (
    <div className="fs-page">
      {/* 页头 */}
      <div className="fs-header">
        <ToolPageHeader
          icon={<FolderOutlined />}
          title="文件管理"
          subtitle="树形目录 · 网格/列表视图 · 拖拽上传 · 拖拽移动 · 多字段排序"
        />
      </div>

      {/* 主体：左侧目录树 + 右侧文件区，DndContext 包裹使目录树节点也可作为 drop 目标 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
      <div className="fs-body" ref={bodyRef}>
        {/* 左侧目录树 */}
        <aside className="fs-sidebar">
          {activeView === 'my' && (
            <>
              <div className="fs-sidebar-header">
                <FolderOpenOutlined />
                <span>目录</span>
              </div>
              {treeLoading ? (
                <div className="fs-sidebar-loading"><Spin size="small" /></div>
              ) : (
                <Tree
                  className="fs-directory-tree"
                  treeData={treeData}
                  selectedKeys={selectedTreeKeys}
                  onSelect={handleTreeSelect}
                  showIcon
                  defaultExpandAll
                  blockNode
                  switcherIcon={treeSwitcherIcon}
                  icon={treeIcon}
                />
              )}
              <div className="fs-sidebar-divider" />
            </>
          )}
          {activeView === 'shared' && (
            <>
              <div className="fs-sidebar-header">
                <TeamOutlined />
                <span>共享文件</span>
              </div>
              <div className="fs-sidebar-shared-info">
                <div className="fs-sidebar-shared-info-icon">
                  <TeamOutlined />
                </div>
                <div className="fs-sidebar-shared-info-title">
                  {sharedLoading ? '加载中…' : `${sharedFiles.length} 个共享文件`}
                </div>
                <div className="fs-sidebar-shared-info-desc">
                  其他用户共享给你的文件会显示在这里
                </div>
              </div>
              <div className="fs-sidebar-divider" />
            </>
          )}
          <div className="fs-sidebar-nav">
            <div
              className={`fs-sidebar-nav-item${activeView === 'myShares' ? ' fs-sidebar-nav-item--active' : ''}`}
              onClick={() => setActiveView('myShares')}
            >
              <LinkOutlined />
              <span>我的分享</span>
            </div>
            <div
              className={`fs-sidebar-nav-item${activeView === 'shared' ? ' fs-sidebar-nav-item--active' : ''}`}
              onClick={() => setActiveView('shared')}
            >
              <TeamOutlined />
              <span>共享文件</span>
            </div>
            <div
              className={`fs-sidebar-nav-item${activeView === 'my' ? ' fs-sidebar-nav-item--active' : ''}`}
              onClick={() => { setActiveView('my'); navigateToDir(''); }}
            >
              <FolderOpenOutlined />
              <span>我的文件</span>
            </div>
          </div>
        </aside>

        {/* 右侧主区域 */}
        <main className="fs-main" ref={listAreaRef}>
          {activeView === 'myShares' ? (
            /* ========== 我的分享视图（外链分享，PRD §4.12） ========== */
            <MyShareLinksView key={myShareLinksReloadKey} />
          ) : activeView === 'shared' ? (
            /* ========== 共享文件视图（与我的文件一致） ========== */
            <>
              <div className="fs-pathbar">
                <div className="fs-pathbar-title">
                  <TeamOutlined style={{ marginRight: 6, color: 'var(--tool-accent)' }} />
                  共享给我的文件
                  {!sharedLoading && sharedFiles.length > 0 && (
                    <span className="fs-pathbar-count">{sharedFiles.length}</span>
                  )}
                </div>
                <div className="fs-pathbar-right">
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={loadSharedFiles}
                    loading={sharedLoading}
                    size="small"
                    className="fs-btn-refresh"
                  >
                    刷新
                  </Button>
                </div>
              </div>

              <div className="fs-list-area" onClick={handleBlankClick}>
                {sharedRows.length === 0 && !sharedLoading ? (
                  <div className="fs-shared-empty">
                    <div className="fs-shared-empty-icon">
                      <TeamOutlined />
                    </div>
                    <div className="fs-shared-empty-title">还没有人共享文件给你</div>
                    <div className="fs-shared-empty-desc">当其他用户将文件共享给你时，会在这里显示</div>
                  </div>
                ) : (
                  renderSharedGrid()
                )}

                {/* 多选状态条 */}
                {selection.selectedIds.size > 0 && (
                  <div className="fs-selection-bar">
                    已选中 {selection.selectedIds.size} 个项目
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ========== 我的文件视图 ========== */
            <>
          {/* 路径栏 */}
          <div className="fs-pathbar">
            {!isSearching && (
              <Breadcrumb separator={<RightOutlined style={{ fontSize: 10, color: 'var(--miao-text-tertiary)' }} />}>
                <Breadcrumb.Item>
                  <DroppableBreadcrumb path="" onSpringLoad={() => springLoadTo('')}>
                    <Button
                      type="text"
                      icon={<img src={homeIconUrl} alt="" className="fs-pathbar-home-icon" width={14} height={14} draggable={false} />}
                      onClick={() => navigateToDir('')}
                      className={`fs-pathbar-home${currentPath === '' ? ' fs-pathbar-home--active' : ''}`}
                    >
                      根目录
                    </Button>
                  </DroppableBreadcrumb>
                </Breadcrumb.Item>
                {pathSegments.map((seg, idx) => {
                  const segPath = pathSegments.slice(0, idx + 1).join('/');
                  const isLast = idx === pathSegments.length - 1;
                  return (
                    <Breadcrumb.Item key={segPath}>
                      {isLast ? (
                        <Text className="fs-pathbar-segment fs-pathbar-segment--current">{seg}</Text>
                      ) : (
                        <DroppableBreadcrumb path={segPath} onSpringLoad={() => springLoadTo(segPath)}>
                          <Button
                            type="text"
                            size="small"
                            onClick={() => navigateToDir(segPath)}
                            className="fs-pathbar-segment"
                          >
                            {seg}
                          </Button>
                        </DroppableBreadcrumb>
                      )}
                    </Breadcrumb.Item>
                  );
                })}
              </Breadcrumb>
            )}
            {isSearching && (
              <div className="fs-search-status">
                搜索：<Text strong>{searchKeyword}</Text>
                <Button type="link" size="small" onClick={() => { setIsSearching(false); setSearchKeyword(''); loadFiles(); }}>清除</Button>
              </div>
            )}

            <div className="fs-pathbar-right">
              {quota && (
                <Tooltip title={`已用 ${formatSize(quota.usedBytes)} / ${formatSize(quota.quotaBytes)}`}>
                  <div className="fs-quota-mini">
                    <Progress
                      percent={Math.min(quota.usagePercent, 100)}
                      size="small"
                      showInfo={false}
                      strokeColor="var(--tool-accent)"
                      className="fs-quota-mini-progress"
                    />
                    <span className="fs-quota-mini-text">{formatSize(quota.usedBytes)}</span>
                  </div>
                </Tooltip>
              )}
              <Segmented
                value={viewMode}
                onChange={(v) => setViewMode(v as ViewMode)}
                options={[
                  { value: 'grid', icon: <AppstoreOutlined /> },
                  { value: 'list', icon: <UnorderedListOutlined /> },
                ]}
                size="small"
              />
            </div>
          </div>

          {/* 工具栏：左 = 创建类（上传 / 新建目录），右 = 视图与维护（搜索 / 排序 / 刷新 / 视图切换 / 全屏） */}
          <div className="fs-toolbar">
            <div className="fs-toolbar-left">
              <Upload {...uploadProps}>
                <Button type="primary" icon={<CloudUploadOutlined />} loading={uploading} className="fs-btn-upload">
                  上传文件
                </Button>
              </Upload>
              <Button icon={<PlusOutlined />} onClick={() => setNewDirModalOpen(true)} className="fs-btn-secondary">
                新建目录
              </Button>
            </div>
            <div className="fs-toolbar-right">
              <Input.Search
                placeholder="搜索文件..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onSearch={handleSearch}
                className="fs-search-input"
                allowClear
              />

              <span className="fs-toolbar-divider" aria-hidden="true" />

              {/* Story 5.5：排序字段 + 方向收编为单胶囊控件。
                  受控 open：点击选项/方向后主动收起面板——dropdownRender 内容
                  点击不会自动关闭，浮层面板会遮挡网格拦截 pointerdown，
                  导致后续拖拽无法启动（表现为「拖不动」） */}
              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                open={sortPanelOpen}
                onOpenChange={setSortPanelOpen}
                dropdownRender={() => (
                  <div className="fs-sort-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="fs-sort-panel-title">排序方式</div>
                    {SORT_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        className={
                          `fs-sort-option`
                          + `${sortBy === opt.key ? ' fs-sort-option--active' : ''}`
                        }
                        onClick={() => { setSortBy(opt.key); setSortPanelOpen(false); }}
                      >
                        <span className="fs-sort-dot" style={{ background: opt.color }} />
                        <span className="fs-sort-option-label">{opt.label}</span>
                        {sortBy === opt.key && (
                          <span className="fs-sort-option-check" aria-label="已选中">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path
                                d="M2.5 6.2L5 8.7L9.5 3.5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        )}
                      </button>
                    ))}
                    {/* 自定义模式：提示拖拽调整顺序；顺序无方向概念，隐藏方向切换 */}
                    {sortBy === 'custom' && (
                      <div className="fs-sort-custom-hint">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M2.5 4.5L6 1.5L9.5 4.5M2.5 7.5L6 10.5L9.5 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        拖动文件卡片即可调整顺序
                      </div>
                    )}
                    {sortBy !== 'custom' && <div className="fs-sort-divider" />}
                    {sortBy !== 'custom' && <button
                      type="button"
                      className="fs-sort-dir-toggle"
                      onClick={() => { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); setSortPanelOpen(false); }}
                      title={`当前：${sortDir === 'asc' ? '升序' : '降序'}，点击翻转`}
                    >
                      <span className="fs-sort-dir-icon" data-dir={sortDir} aria-hidden="true">
                        <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
                          <path
                            d="M5.5 1L9.5 5H1.5L5.5 1Z"
                            fill="currentColor"
                            fillOpacity={sortDir === 'asc' ? 1 : 0.32}
                          />
                          <path
                            d="M5.5 12L1.5 8H9.5L5.5 12Z"
                            fill="currentColor"
                            fillOpacity={sortDir === 'desc' ? 1 : 0.32}
                          />
                        </svg>
                      </span>
                      <span>{sortDir === 'asc' ? '升序' : '降序'}</span>
                    </button>}
                  </div>
                )}
              >
                <Button className="fs-sort-trigger" data-open={sortPanelOpen ? 'true' : 'false'}>
                  <span
                    className="fs-sort-dot"
                    style={{ background: activeSortOption.color }}
                  />
                  <span className="fs-sort-trigger-label">{activeSortOption.label}</span>
                  {sortBy !== 'custom' && (
                    <span className="fs-sort-trigger-arrow" data-dir={sortDir}>
                      <svg width="11" height="6" viewBox="0 0 11 6" fill="none">
                        <path
                          d="M1.5 1L5.5 5L9.5 1"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                </Button>
              </Dropdown>

              <Tooltip title="刷新">
                <Button
                  className="fs-btn-icon"
                  icon={<ReloadOutlined spin={loading} />}
                  onClick={refreshAll}
                  aria-label="刷新"
                />
              </Tooltip>

              <Segmented
                value={viewMode}
                onChange={(v) => setViewMode(v as ViewMode)}
                options={[
                  { value: 'grid', icon: <AppstoreOutlined /> },
                  { value: 'list', icon: <UnorderedListOutlined /> },
                ]}
                size="small"
                className="fs-view-segmented"
              />

              <Tooltip title={isFullscreen ? '退出全屏' : '全屏'}>
                <Button
                  className="fs-btn-icon"
                  icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? '退出全屏' : '全屏'}
                />
              </Tooltip>
            </div>
          </div>

          {/* 文件列表 */}
          <div className="fs-list-area" onClick={handleBlankClick}>
            {rows.length === 0 && !loading ? (
              <div className="fs-empty">
                <img src={inboxIconUrl} alt="" className="fs-empty-icon" width={64} height={64} draggable={false} />
                <div className="fs-empty-text">暂无文件，拖拽文件到此处或点击上传</div>
              </div>
            ) : viewMode === 'list' ? (
              <Table
                dataSource={rows}
                columns={columns}
                rowKey={r => `${r.type}-${r.id}`}
                size="small"
                loading={loading}
                pagination={rows.length > 50 ? { pageSize: 50, showSizeChanger: false, showTotal: (t) => `共 ${t} 项` } : false}
              />
            ) : (
              renderGrid()
            )}

            {/* 多选状态条 */}
            {selection.selectedIds.size > 0 && (
              <div className="fs-selection-bar">
                已选中 {selection.selectedIds.size} 个项目
              </div>
            )}
          </div>

          {/* 拖拽上传遮罩 */}
          <div className={`fs-drop-overlay ${dragActive ? 'fs-drop-active' : ''}`}>
            <img src={uploadCloudIconUrl} alt="" className="fs-drop-overlay-icon" width={56} height={56} draggable={false} />
            <div className="fs-drop-overlay-text">释放文件以上传</div>
          </div>
            </>
          )}
        </main>
      </div>

      {/* 拖拽浮层：跟随鼠标的卡片预览（多选时堆叠 + 数量徽章，FR-25）。
          悬停到 drop 目标（目录树/文件夹）上时自动降低浮层透明度，
          露出下方目标节点的蓝边/徽章，让放置位置一目了然。 */}
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {activeDragFiles.length > 0 ? <DragOverlayContent files={activeDragFiles} /> : null}
      </DragOverlay>
      </DndContext>

      {/* 预览弹窗 */}
      <Modal
        title={
          previewFile ? (
            <div className="fs-preview-title">
              <span className="fs-preview-title-text">
                <span className="fs-preview-title-name">{previewFile.fileName}</span>
                <span className="fs-preview-title-meta">{formatSize(previewFile.sizeBytes)}</span>
              </span>
            </div>
          ) : null
        }
        open={previewOpen}
        onCancel={closePreview}
        footer={previewFile ? (editing ? [
          <Button key="cancel-edit" onClick={cancelEditing} disabled={saving}>取消</Button>,
          <Button key="save" type="primary" onClick={saveEditing} loading={saving}>保存</Button>,
        ] : [
          <Button key="download" icon={<DownloadOutlined />} onClick={() => handleDownload(previewFile.id)}>下载</Button>,
          ...(previewFile.ownerUserId != null ? [(
            <Button key="copy-to-mine" type="primary" ghost icon={<ImportOutlined />} onClick={() => openCopyToMine(previewFile)}>
              移入我的文件
            </Button>
          )] : []),
          <Button key="close" onClick={closePreview}>关闭</Button>,
        ]) : undefined}
        width={840}
        className="fs-preview-modal"
        rootClassName="fs-modal"
        modalRender={(node) => (
          <div className="fs-preview-modal-shell">{node}</div>
        )}
        forceRender
        destroyOnClose
      >
        {previewFile && (
          <FilePreviewer
            fileName={previewFile.fileName}
            mimeType={previewFile.mimeType}
            objectUrl={previewObjectUrl}
            text={previewText}
            loading={previewLoading}
            canEdit={previewCanEdit}
            editing={editing}
            editContent={editContent}
            onEditContentChange={setEditContent}
            onStartEdit={startEditing}
          />
        )}
      </Modal>

      {/* 新建目录弹窗 */}
      <Modal
        title="新建目录"
        open={newDirModalOpen}
        onOk={handleCreateDir}
        onCancel={() => { setNewDirModalOpen(false); setNewDirName(''); }}
        okText="创建"
        cancelText="取消"
        rootClassName="fs-modal"
      >
        <Input
          placeholder="目录名称"
          value={newDirName}
          onChange={(e) => setNewDirName(e.target.value)}
          onPressEnter={handleCreateDir}
          autoFocus
        />
      </Modal>

      {/* 移动到弹窗 — 目录树选择 */}
      <Modal
        title={`移动「${moveTarget?.fileName ?? ''}」到`}
        open={moveModalOpen}
        onOk={handleMove}
        onCancel={() => { setMoveModalOpen(false); setMoveTarget(null); setMoveTargetPath(''); }}
        okText="移动"
        cancelText="取消"
        okButtonProps={{ disabled: moveTargetPath === '' && !moveTargetPath }}
        rootClassName="fs-modal"
      >
        <div className="fs-move-selected">
          {moveTargetPath === '' ? '根目录' : moveTargetPath}
        </div>
        <div className="fs-move-tree-wrap">
          <Tree
            className="fs-move-tree"
            treeData={treeData}
            selectedKeys={[moveTargetPath]}
            onSelect={(_, info) => {
              setMoveTargetPath((info.node?.key as string) ?? '');
            }}
            showIcon
            defaultExpandAll
            blockNode
            switcherIcon={treeSwitcherIcon}
            icon={treeIcon}
          />
        </div>
      </Modal>

      {/* 移动目录弹窗（Story 5.6 / FR-28）— 目录树选择 */}
      <Modal
        title={`移动「${dirMoveTarget?.name ?? ''}」到`}
        open={dirMoveOpen}
        onOk={confirmDirMove}
        onCancel={() => { setDirMoveOpen(false); setDirMoveTarget(null); setDirMoveTargetPath(''); }}
        okText="移动"
        cancelText="取消"
        rootClassName="fs-modal"
      >
        <div className="fs-move-selected">
          {dirMoveTargetPath === '' ? '根目录' : dirMoveTargetPath}
        </div>
        <div className="fs-move-tree-wrap">
          <Tree
            className="fs-move-tree"
            treeData={treeData}
            selectedKeys={[dirMoveTargetPath]}
            onSelect={(_, info) => {
              setDirMoveTargetPath((info.node?.key as string) ?? '');
            }}
            showIcon
            defaultExpandAll
            blockNode
            switcherIcon={treeSwitcherIcon}
            icon={treeIcon}
          />
        </div>
      </Modal>

      {/* 删除文件确认弹窗 */}
      <Modal
        title={
          <span className="fs-delete-title">
            <ExclamationCircleFilled className="fs-delete-title-icon" />
            删除文件
          </span>
        }
        open={!!deleteFileTarget}
        onOk={confirmDeleteFile}
        onCancel={() => setDeleteFileTarget(null)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true, loading: deleting }}
        cancelButtonProps={{ disabled: deleting }}
        modalRender={(node) => <div className="fs-delete-modal-shell">{node}</div>}
      >
        <div className="fs-delete-body">
          <div className="fs-delete-name">{deleteFileTarget?.fileName}</div>
          <div className="fs-delete-hint">删除后文件将无法恢复，确定要删除该文件吗？</div>
        </div>
      </Modal>

      {/* 移入我的文件弹窗 — 目录树选择目标位置 */}
      <Modal
        title={`将「${copyToMineTarget?.fileName ?? ''}」移入我的文件`}
        open={copyToMineOpen}
        onOk={confirmCopyToMine}
        onCancel={() => { setCopyToMineOpen(false); setCopyToMineTarget(null); setCopyToMinePath(''); }}
        okText="移入"
        cancelText="取消"
        confirmLoading={copyToMineLoading}
        rootClassName="fs-modal"
      >
        <div className="fs-move-selected">
          目标位置：{copyToMinePath === '' ? '根目录' : copyToMinePath}
        </div>
        <div className="fs-move-tree-wrap">
          <Tree
            className="fs-move-tree"
            treeData={treeData}
            selectedKeys={[copyToMinePath]}
            onSelect={(_, info) => {
              setCopyToMinePath((info.node?.key as string) ?? '');
            }}
            showIcon
            defaultExpandAll
            blockNode
            switcherIcon={treeSwitcherIcon}
            icon={treeIcon}
          />
        </div>
      </Modal>

      {/* 删除目录确认弹窗 */}
      <Modal
        title={
          <span className="fs-delete-title">
            <ExclamationCircleFilled className="fs-delete-title-icon" />
            删除目录
          </span>
        }
        open={!!deleteDirTarget}
        onOk={confirmDeleteDir}
        onCancel={() => setDeleteDirTarget(null)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true, loading: deleting }}
        cancelButtonProps={{ disabled: deleting }}
        modalRender={(node) => <div className="fs-delete-modal-shell">{node}</div>}
      >
        <div className="fs-delete-body">
          <div className="fs-delete-name">{deleteDirTarget?.name}</div>
          <div className="fs-delete-hint">该目录及其下所有文件和子目录都将被永久删除，且无法恢复。确定要删除吗？</div>
        </div>
      </Modal>

      {/* 批量删除确认弹窗 */}
      <Modal
        title={
          <span className="fs-delete-title">
            <ExclamationCircleFilled className="fs-delete-title-icon" />
            删除文件
          </span>
        }
        open={batchDeleteOpen}
        onOk={confirmBatchDelete}
        onCancel={() => setBatchDeleteOpen(false)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true, loading: batchDeleting }}
        cancelButtonProps={{ disabled: batchDeleting }}
        modalRender={(node) => <div className="fs-delete-modal-shell">{node}</div>}
      >
        <div className="fs-delete-body">
          <div className="fs-delete-name">将删除 {batchDeleteIds.length} 个文件</div>
          <div className="fs-delete-hint">删除后文件将无法恢复，确定要删除选中的 {batchDeleteIds.length} 个文件吗？</div>
        </div>
      </Modal>

      {/* 批量移动弹窗 — 目录树选择目标位置 */}
      <Modal
        title={`移动 ${batchMoveIds.length} 个文件到`}
        open={batchMoveOpen}
        onOk={confirmBatchMove}
        onCancel={() => { setBatchMoveOpen(false); setBatchMoveIds([]); setBatchMovePath(''); }}
        okText="移动"
        cancelText="取消"
        confirmLoading={batchMoving}
        rootClassName="fs-modal"
      >
        <div className="fs-move-selected">
          {batchMovePath === '' ? '根目录' : batchMovePath}
        </div>
        <div className="fs-move-tree-wrap">
          <Tree
            className="fs-move-tree"
            treeData={treeData}
            selectedKeys={[batchMovePath]}
            onSelect={(_, info) => {
              setBatchMovePath((info.node?.key as string) ?? '');
            }}
            showIcon
            defaultExpandAll
            blockNode
            switcherIcon={treeSwitcherIcon}
            icon={treeIcon}
          />
        </div>
      </Modal>

      {/* 批量共享弹窗 — 选择用户与权限，循环调用单文件共享 */}
      <Modal
        title={
          <span className="fs-share-title">
            <ShareAltOutlined className="fs-share-title-icon" />
            共享 {batchShareIds.length} 个文件
          </span>
        }
        open={batchShareOpen}
        onCancel={() => setBatchShareOpen(false)}
        footer={null}
        width={520}
        destroyOnClose
        rootClassName="fs-modal"
      >
        <div className="fs-share-body">
          <div className="fs-share-add">
            <div className="fs-share-add-label">添加共享用户</div>
            <div className="fs-share-add-row">
              <Select
                mode="multiple"
                placeholder="输入用户名或邮箱搜索"
                value={batchShareUserIds}
                onChange={setBatchShareUserIds}
                style={{ flex: 1 }}
                filterOption={false}
                onSearch={handleBatchUserSearch}
                loading={userSearchLoading}
                notFoundContent={userSearchLoading ? '搜索中...' : '无匹配用户'}
                options={userSearchOptions.map(u => ({
                  value: u.id,
                  label: (
                    <div className="fs-share-user-option">
                      <span className="fs-share-user-name">{u.username}</span>
                      {u.email && <span className="fs-share-user-email">{u.email}</span>}
                    </div>
                  ),
                }))}
                maxTagCount="responsive"
              />
              <Select
                value={batchSharePermission}
                onChange={setBatchSharePermission}
                style={{ width: 110 }}
                options={[
                  { value: 'VIEW', label: '可查看' },
                  { value: 'EDIT', label: '可编辑' },
                ]}
              />
              <Button
                type="primary"
                onClick={confirmBatchShare}
                loading={batchShareSubmitting}
                disabled={batchShareUserIds.length === 0}
              >
                共享
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* 共享弹窗 */}
      <Modal
        title={
          <span className="fs-share-title">
            <ShareAltOutlined className="fs-share-title-icon" />
            共享文件
          </span>
        }
        open={shareModalOpen}
        onCancel={() => setShareModalOpen(false)}
        footer={null}
        width={520}
        destroyOnClose
        rootClassName="fs-modal"
      >
        {shareTarget && (
          <div className="fs-share-body">
            <div className="fs-share-file-name">
              {getFileIcon(shareTarget.mimeType, undefined, shareTarget.fileName)}
              <span>{shareTarget.fileName}</span>
            </div>

            {/* 添加共享 */}
            <div className="fs-share-add">
              <div className="fs-share-add-label">添加共享用户</div>
              <div className="fs-share-add-row">
                <Select
                  mode="multiple"
                  placeholder="输入用户名或邮箱搜索"
                  value={shareUserIds}
                  onChange={setShareUserIds}
                  style={{ flex: 1 }}
                  filterOption={false}
                  onSearch={handleUserSearch}
                  loading={userSearchLoading}
                  notFoundContent={userSearchLoading ? '搜索中...' : '无匹配用户'}
                  options={userSearchOptions.map(u => ({
                    value: u.id,
                    label: (
                      <div className="fs-share-user-option">
                        <span className="fs-share-user-name">{u.username}</span>
                        {u.email && <span className="fs-share-user-email">{u.email}</span>}
                      </div>
                    ),
                  }))}
                  maxTagCount="responsive"
                />
                <Select
                  value={sharePermission}
                  onChange={setSharePermission}
                  style={{ width: 110 }}
                  options={[
                    { value: 'VIEW', label: '可查看' },
                    { value: 'EDIT', label: '可编辑' },
                  ]}
                />
                <Button
                  type="primary"
                  onClick={handleShareSubmit}
                  loading={shareSubmitting}
                  disabled={shareUserIds.length === 0}
                >
                  共享
                </Button>
              </div>
            </div>

            {/* 已共享列表 */}
            {shareList.length > 0 && (
              <div className="fs-share-list">
                <div className="fs-share-list-label">已共享用户</div>
                {shareList.map(share => (
                  <div key={share.id} className="fs-share-list-item">
                    <UserOutlined className="fs-share-list-avatar" />
                    <span className="fs-share-list-name">{share.sharedWithUsername}</span>
                    <Select
                      size="small"
                      value={share.permission}
                      onChange={(val: 'VIEW' | 'EDIT') => handleUpdatePermission(share.id, val)}
                      options={[
                        { value: 'VIEW', label: '可查看' },
                        { value: 'EDIT', label: '可编辑' },
                      ]}
                      className="fs-perm-select"
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      onClick={() => handleUnshare(share.id)}
                    >
                      取消
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        title="文件详情"
        open={detailModalOpen}
        onCancel={() => { setDetailModalOpen(false); setDetailTarget(null); }}
        footer={[
          <Button key="close" onClick={() => { setDetailModalOpen(false); setDetailTarget(null); }}>关闭</Button>,
        ]}
        width={420}
        destroyOnClose
        rootClassName="fs-modal"
      >
        {detailTarget && (
          <div className="fs-detail-body">
            <div className="fs-detail-header">
              {getFileIcon(detailTarget.mimeType, 'fs-detail-icon', detailTarget.fileName)}
              <div className="fs-detail-name" title={detailTarget.fileName}>{detailTarget.fileName}</div>
            </div>
            <div className="fs-detail-row">
              <span className="fs-detail-label">类型</span>
              <span className="fs-detail-value">{detailTarget.mimeType || '未知'}</span>
            </div>
            <div className="fs-detail-row">
              <span className="fs-detail-label">大小</span>
              <span className="fs-detail-value">{formatSize(detailTarget.sizeBytes)}</span>
            </div>
            <div className="fs-detail-row">
              <span className="fs-detail-label">路径</span>
              <span className="fs-detail-value">{detailTarget.path || '/'}</span>
            </div>
            <div className="fs-detail-row">
              <span className="fs-detail-label">创建时间</span>
              <span className="fs-detail-value">{detailTarget.createdAt || '-'}</span>
            </div>
            <div className="fs-detail-row">
              <span className="fs-detail-label">修改时间</span>
              <span className="fs-detail-value">{detailTarget.updatedAt || '-'}</span>
            </div>
            <div className="fs-detail-row">
              <span className="fs-detail-label">共享状态</span>
              <span className="fs-detail-value">
                {detailTarget.shared ? (
                  <span className="fs-shared-chip">已共享给其他用户</span>
                ) : '未共享'}
              </span>
            </div>
            {detailTarget.ownerUsername && (
              <div className="fs-detail-row">
                <span className="fs-detail-label">共享者</span>
                <span className="fs-detail-value">
                  <UserOutlined style={{ marginRight: 4, color: 'var(--tool-accent)' }} />
                  {detailTarget.ownerUsername}
                </span>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 创建外链分享弹窗：key 变化即重建实例，实现打开时重置为设置态 */}
      <ShareLinkModal
        key={`${shareLinkModalOpen}-${shareLinkTarget?.id ?? 'none'}`}
        open={shareLinkModalOpen}
        file={shareLinkTarget}
        onClose={() => { setShareLinkModalOpen(false); setShareLinkTarget(null); }}
        onCreated={() => setMyShareLinksReloadKey(k => k + 1)}
      />
    </div>
  );
};

export default FileStoragePage;

// DragOverlay body: reads current over from useDndContext.
// When hovering a drop target (tree-*/dir-*) the overlay fades
// and shrinks so the highlighted node + "move here" badge show through.
const DragOverlayContent: React.FC<{ files: FileInfo[] }> = ({ files }) => {
  const { over } = useDndContext();
  const overId = over ? String(over.id) : '';
  const overDropTarget = overId.startsWith('tree-') || overId.startsWith('dir-');
  // 悬停在 drop 目标上时让浮层半透明 + 缩小，露出下方节点的高亮反馈
  const baseOpacity = overDropTarget ? 0.38 : 1;

  return (
    <div className={`fs-drag-stack${overDropTarget ? ' fs-drag-stack--over-target' : ''}`}>
      {files.slice(0, 3).map((f, idx) => (
        <div
          key={f.id}
          className="fs-grid-item fs-grid-item--overlay fs-drag-stack-card"
          style={{
            top: idx * 6,
            left: idx * 6,
            zIndex: 3 - idx,
            opacity: Math.max(baseOpacity - idx * 0.12, 0.14),
          }}
        >
          <div className="fs-grid-thumb">
            {getFileCategory(f.mimeType, f.fileName) === 'image' ? (
              <GridThumbnail fileId={f.id} fileName={f.fileName} />
            ) : (
              getFileIcon(f.mimeType, 'fs-grid-thumb-icon', f.fileName)
            )}
          </div>
          <div className="fs-grid-info">
            <div className="fs-grid-name" title={f.fileName}>{f.fileName}</div>
          </div>
        </div>
      ))}
      {files.length > 1 && (
        <span
          className="fs-drag-stack-badge"
          style={{ opacity: overDropTarget ? 0.55 : 1 }}
        >
          {files.length}
        </span>
      )}
    </div>
  );
};
