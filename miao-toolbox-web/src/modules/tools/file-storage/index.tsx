import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import {
  FolderOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
  PlusOutlined,
  HomeOutlined,
  EditOutlined,
  InboxOutlined,
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
import { SortableFileCard, DroppableFolderCard, DroppableTreeNode } from './DndGridItems';
import { getFileIcon } from './FileIcon';
import { formatSize, getFileCategory, isPreviewable } from './fileCategory';
import ShareLinkModal from './ShareLinkModal';
import MyShareLinksView from './MyShareLinksView';
import type { FileInfo, DirectoryInfo, DirectoryTreeNode, QuotaInfo, ShareInfo, SharedWithMeFile, UserOption } from './types';
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
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileInfo | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<FileInfo | null>(null);
  const [moveTargetPath, setMoveTargetPath] = useState('');

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

  // ── @dnd-kit 拖拽排序 / 拖入文件夹 ──
  /** 自定义文件排序（localStorage 持久化，按路径维度） */
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  /** 当前拖拽中的文件（用于 DragOverlay 浮层渲染） */
  const [activeDragFile, setActiveDragFile] = useState<FileInfo | null>(null);

  /** 从 localStorage 读取当前路径的自定义排序 */
  const loadCustomOrder = useCallback((path: string) => {
    try {
      const raw = localStorage.getItem(`miao-fs-order:${path}`);
      return raw ? JSON.parse(raw) as string[] : [];
    } catch {
      return [];
    }
  }, []);

  /** 保存自定义排序到 localStorage */
  const saveCustomOrder = useCallback((path: string, order: string[]) => {
    try {
      localStorage.setItem(`miao-fs-order:${path}`, JSON.stringify(order));
    } catch {
      // localStorage 满或禁用时静默降级
    }
  }, []);

  // 切换目录时加载自定义排序
  useEffect(() => {
    setCustomOrder(loadCustomOrder(currentPath));
  }, [currentPath, loadCustomOrder]);

  // dnd-kit 传感器：指针拖拽，8px 激活阈值避免误触
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  /** 文件项的 sortable id */
  const fileSortableId = (file: FileInfo) => `file-${file.id}`;
  /** 文件夹的 droppable id */
  const dirDroppableId = (dir: { id: number }) => `dir-${dir.id}`;

  /** 拖拽开始：记录当前拖拽的文件用于 DragOverlay */
  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    const file = files.find(f => fileSortableId(f) === id);
    if (file) setActiveDragFile(file);
  };

  /** 拖拽结束：判断是排序、移入文件夹还是移入目录树节点 */
  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragFile(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // 拖到目录树节点上 → 移动文件到该目录
    if (overId.startsWith('tree-')) {
      const targetPath = overId.slice(5); // 去掉 'tree-' 前缀
      const file = files.find(f => fileSortableId(f) === activeId);
      if (!file) return;
      if (file.path === targetPath) {
        message.info('文件已在此目录中');
        return;
      }
      try {
        await fileStorageApi.moveFile(file.id, targetPath);
        const dirName = targetPath === '' ? '根目录' : targetPath.split('/').pop() || targetPath;
        message.success(`已移动到「${dirName}」`);
        loadFiles();
        loadTree();
      } catch {
        message.error('移动失败');
      }
      return;
    }

    // 拖到网格文件夹上 → 移动文件
    if (overId.startsWith('dir-')) {
      const dir = directories.find(d => dirDroppableId(d) === overId);
      const file = files.find(f => fileSortableId(f) === activeId);
      if (!dir || !file) return;
      if (file.path === dir.path) {
        message.info('文件已在此目录中');
        return;
      }
      try {
        await fileStorageApi.moveFile(file.id, dir.path);
        message.success(`已移动到「${dir.name}」`);
        loadFiles();
        loadTree();
      } catch {
        message.error('移动失败');
      }
      return;
    }

    // 拖到另一个文件上 → 排序
    if (activeId !== overId) {
      const fileNames = files.map(f => f.fileName);
      const order = customOrder.length === fileNames.length ? [...customOrder] : fileNames;
      const fromIdx = order.indexOf(files.find(f => fileSortableId(f) === activeId)?.fileName ?? '');
      const toIdx = order.indexOf(files.find(f => fileSortableId(f) === overId)?.fileName ?? '');
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      const newOrder = arrayMove(order, fromIdx, toIdx);
      setCustomOrder(newOrder);
      saveCustomOrder(currentPath, newOrder);
    }
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
        fileStorageApi.listFiles(currentPath, 0, 1000),
        fileStorageApi.listDirectories(currentPath),
        fileStorageApi.getQuotaInfo(),
      ]);
      setFiles(fileResp.items);
      setDirectories(dirs);
      setQuota(quotaInfo);
    } catch {
      message.error('加载文件列表失败');
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

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

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await fileStorageApi.renameFile(renameTarget.id, renameValue);
      message.success('重命名成功');
      setRenameModalOpen(false);
      setRenameTarget(null);
      setRenameValue('');
      // 刷新列表与目录树；同时刷新共享列表，覆盖共享视图场景
      refreshAll();
      loadSharedFiles();
    } catch {
      message.error('重命名失败');
    }
  };

  const handleMove = async () => {
    if (!moveTarget) return;
    try {
      await fileStorageApi.moveFile(moveTarget.id, moveTargetPath);
      message.success('移动成功');
      setMoveModalOpen(false);
      setMoveTarget(null);
      setMoveTargetPath('');
      loadFiles();
    } catch {
      message.error('移动失败');
    }
  };

  const navigateToDir = (path: string) => {
    setCurrentPath(path);
    setIsSearching(false);
    setSearchKeyword('');
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
    let fileRows: FileRow[] = files.map(f => ({ ...f, type: 'file' as const }));

    // 应用自定义排序：按 customOrder 中的文件名顺序排列，未包含的追加到末尾
    if (customOrder.length > 0) {
      const orderMap = new Map<string, number>();
      customOrder.forEach((name, idx) => orderMap.set(name, idx));
      fileRows = [...fileRows].sort((a, b) => {
        const ai = orderMap.get(a.fileName);
        const bi = orderMap.get(b.fileName);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return 0;
      });
    }

    return [...dirRows, ...fileRows];
  }, [directories, files, customOrder]);

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
        onClick: () => { setRenameTarget(record); setRenameValue(record.fileName); setRenameModalOpen(true); },
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
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除',
        danger: true,
        onClick: () => openDeleteDir(record),
      },
    ],
  });

  // 网格右键菜单：无图标、Finder 风格文案，避免菜单被图标列撑宽
  const gridFileMenu = (file: FileInfo): MenuProps => ({
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
      { key: 'rename', label: '重新命名', onClick: () => { setRenameTarget(file); setRenameValue(file.fileName); setRenameModalOpen(true); } },
      { key: 'move', label: '移动到…', onClick: () => { setMoveTarget(file); setMoveTargetPath(''); setMoveModalOpen(true); } },
      { key: 'share', label: '共享…', onClick: () => openShareModal(file) },
      { key: 'share-link', label: '创建分享链接…', onClick: () => { setShareLinkTarget(file); setShareLinkModalOpen(true); } },
      { type: 'divider' as const },
      { key: 'delete', label: '移到废纸篓', danger: true, onClick: () => openDeleteFile(file) },
    ],
  });

  const gridDirMenu = (dir: DirRow): MenuProps => ({
    items: [
      { key: 'open', label: '打开', onClick: () => navigateToDir(dir.path) },
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
        onClick: () => { setRenameTarget(file); setRenameValue(file.fileName); setRenameModalOpen(true); },
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
        {sharedRows.map((file) => {
          return (
            <Dropdown
              key={`file-${file.id}`}
              trigger={['contextMenu']}
              overlayClassName="fs-grid-dropdown"
              menu={sharedFileMenu(file)}
            >
              <div
                className="fs-grid-item"
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
        if (record.type === 'dir') {
          return (
            <div className="fs-dir-cell" onClick={() => navigateToDir(record.path)}>
              <FolderOutlined className="fs-dir-cell-icon" />
              <span className="fs-dir-cell-name">{record.name}</span>
            </div>
          );
        }
        return (
          <div className="fs-file-cell">
            {getFileIcon(record.mimeType, undefined, record.fileName)}
            <span className="fs-file-cell-name">{record.fileName}</span>
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

  // ── 拖拽排序 / 拖入文件夹：@dnd-kit 事件处理已在组件上方定义 ──

  const renderGrid = () => {
    if (rows.length === 0) return null;

    // 文件夹 id 列表（droppable）
    const dirIds = directories.map(d => dirDroppableId(d));
    // 文件 id 列表（sortable）
    const fileIds = rows
      .filter((r): r is FileRow => r.type === 'file')
      .map(f => fileSortableId(f));

    return (
      <div className="fs-grid">
        {/* 文件夹：droppable 目标 */}
        {dirIds.length > 0 && (
          <SortableContext items={dirIds} strategy={rectSortingStrategy}>
            {directories.map(dir => {
              const dirRow: DirRow = { type: 'dir', id: dir.id, name: dir.name, path: dir.path };
              return (
                <DroppableFolderCard
                  key={dirDroppableId(dir)}
                  dir={dir}
                  dirId={dirDroppableId(dir)}
                  onClick={() => navigateToDir(dir.path)}
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
              .map(file => (
                <SortableFileCard
                  key={fileSortableId(file)}
                  file={file}
                  fileId={fileSortableId(file)}
                  isPreviewable={isPreviewable(file.mimeType, file.fileName)}
                  onDoubleClick={() => isPreviewable(file.mimeType, file.fileName) && handlePreview(file)}
                  contextMenu={gridFileMenu(file)}
                />
              ))}
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
    const { isLeaf, expanded, key } = nodeProps as { isLeaf?: boolean; expanded?: boolean; key?: React.Key };
    if (isLeaf) return null;
    if (key === '') return <HomeOutlined className="fs-tree-icon-root" />;
    return expanded ? (
      <FolderOpenOutlined className="fs-tree-icon-folder" />
    ) : (
      <FolderOutlined className="fs-tree-icon-folder" />
    );
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
          subtitle="树形目录 · 网格/列表视图 · 拖拽上传 · 拖拽排序"
        />
      </div>

      {/* 主体：左侧目录树 + 右侧文件区，DndContext 包裹使目录树节点也可作为 drop 目标 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
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

              <div className="fs-list-area">
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
                  <Button
                    type="text"
                    icon={<HomeOutlined />}
                    onClick={() => navigateToDir('')}
                    className={`fs-pathbar-home${currentPath === '' ? ' fs-pathbar-home--active' : ''}`}
                  >
                    根目录
                  </Button>
                </Breadcrumb.Item>
                {pathSegments.map((seg, idx) => {
                  const segPath = pathSegments.slice(0, idx + 1).join('/');
                  const isLast = idx === pathSegments.length - 1;
                  return (
                    <Breadcrumb.Item key={segPath}>
                      {isLast ? (
                        <Text className="fs-pathbar-segment fs-pathbar-segment--current">{seg}</Text>
                      ) : (
                        <Button
                          type="text"
                          size="small"
                          onClick={() => navigateToDir(segPath)}
                          className="fs-pathbar-segment"
                        >
                          {seg}
                        </Button>
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

          {/* 工具栏 */}
          <div className="fs-toolbar">
            <div className="fs-toolbar-left">
              <Upload {...uploadProps}>
                <Button type="primary" icon={<CloudUploadOutlined />} loading={uploading} className="fs-btn-upload">
                  上传文件
                </Button>
              </Upload>
              <Button icon={<PlusOutlined />} onClick={() => setNewDirModalOpen(true)}>新建目录</Button>
              <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={loading} className="fs-btn-refresh">刷新</Button>
            </div>
            <div className="fs-toolbar-right">
              <Input.Search
                placeholder="搜索文件..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onSearch={handleSearch}
                style={{ width: 220 }}
                allowClear
              />
              <Button
                type="text"
                icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={toggleFullscreen}
                title={isFullscreen ? '退出全屏' : '全屏'}
              />
            </div>
          </div>

          {/* 文件列表 */}
          <div className="fs-list-area">
            {rows.length === 0 && !loading ? (
              <div className="fs-empty">
                <InboxOutlined className="fs-empty-icon" />
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
          </div>

          {/* 拖拽上传遮罩 */}
          <div className={`fs-drop-overlay ${dragActive ? 'fs-drop-active' : ''}`}>
            <CloudUploadOutlined className="fs-drop-overlay-icon" />
            <div className="fs-drop-overlay-text">释放文件以上传</div>
          </div>
            </>
          )}
        </main>
      </div>

      {/* 拖拽浮层：跟随鼠标的半透明卡片预览 */}
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {activeDragFile ? (
          <div className="fs-grid-item fs-grid-item--overlay">
            <div className="fs-grid-thumb">
              {getFileCategory(activeDragFile.mimeType, activeDragFile.fileName) === 'image' ? (
                <GridThumbnail fileId={activeDragFile.id} fileName={activeDragFile.fileName} />
              ) : (
                getFileIcon(activeDragFile.mimeType, 'fs-grid-thumb-icon', activeDragFile.fileName)
              )}
            </div>
            <div className="fs-grid-info">
              <div className="fs-grid-name" title={activeDragFile.fileName}>{activeDragFile.fileName}</div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>

      {/* 预览弹窗 */}
      <Modal
        title={
          previewFile ? (
            <div className="fs-preview-title">
              <span className={`fs-preview-badge fs-preview-badge--${getFileCategory(previewFile.mimeType, previewFile.fileName)}`}>
                {getFileIcon(previewFile.mimeType, 'fs-preview-badge-icon', previewFile.fileName)}
              </span>
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

      {/* 重命名弹窗 */}
      <Modal
        title="重命名文件"
        open={renameModalOpen}
        onOk={handleRename}
        onCancel={() => { setRenameModalOpen(false); setRenameTarget(null); setRenameValue(''); }}
        okText="确认"
        cancelText="取消"
        rootClassName="fs-modal"
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRename}
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
