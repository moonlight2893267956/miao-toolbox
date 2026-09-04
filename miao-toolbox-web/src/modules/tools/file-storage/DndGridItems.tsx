import React, { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable, useDndContext } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import FolderIcon from './FolderIcon';
import { getFileCategory } from './fileCategory';
import { getFileIcon } from './FileIcon';
import GridThumbnail from './GridThumbnail';
import { InlineRenameInput } from './InlineRenameInput';
import type { DirectoryInfo, FileInfo } from './types';

// ── 可排序文件卡片 ──

interface SortableFileCardProps {
  file: FileInfo;
  fileId: string;
  isPreviewable: boolean;
  isSelected?: boolean;
  isMultiDragging?: boolean;
  isExiting?: boolean;
  /** 行内重命名模式（Story 5.8 / macOS Finder 风格） */
  isRenaming?: boolean;
  onRename?: (newName: string) => void;
  onRenameCancel?: () => void;
  /** 双击文件名时触发重命名 */
  onRenameStart?: () => void;
  /** spring-load 幽灵卡片：隐形占位，保持拖拽源节点跨目录挂载（Story 5.7） */
  isGhost?: boolean;
  onDoubleClick: () => void;
  onItemClick?: (e: React.MouseEvent) => void;
  contextMenu: MenuProps;
}

export const SortableFileCard: React.FC<SortableFileCardProps> = ({
  file, fileId, isSelected = false, isMultiDragging = false, isExiting = false,
  isRenaming = false, onRename, onRenameCancel, onRenameStart, isGhost = false,
  onDoubleClick, onItemClick, contextMenu,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fileId });

  /** 源项（isDragging）或多选拖拽组成员（isMultiDragging）→ 都按置灰态渲染 */
  const showAsDragging = isDragging || isMultiDragging;

  const style: React.CSSProperties = {
    transform: isDragging
      ? CSS.Transform.toString(transform)
      : isMultiDragging
        ? 'scale(0.92)'
        : CSS.Transform.toString(transform),
    transition,
    opacity: showAsDragging ? 0.3 : 1,
    zIndex: showAsDragging ? 100 : undefined,
  };

  return (
    <Dropdown menu={contextMenu} trigger={['contextMenu']} overlayClassName="fs-grid-dropdown">
      <div
        ref={setNodeRef}
        style={style}
        data-item-id={fileId}
        className={
          `fs-grid-item`
          + `${showAsDragging ? ' fs-grid-item--dragging' : ''}`
          + `${isSelected ? ' fs-grid-item--selected' : ''}`
          + `${isExiting ? ' fs-grid-item--exiting' : ''}`
          + `${isGhost ? ' fs-grid-item--ghost' : ''}`
        }
        {...attributes}
        {...listeners}
        onDoubleClick={onDoubleClick}
        onClick={onItemClick}
      >
        <div className="fs-grid-thumb">
          {getFileCategory(file.mimeType, file.fileName) === 'image' ? (
            <GridThumbnail fileId={file.id} fileName={file.fileName} />
          ) : (
            getFileIcon(file.mimeType, 'fs-grid-thumb-icon', file.fileName)
          )}
          {file.shared && (
            <Tooltip title="已共享给其他用户">
              <span className="fs-grid-thumb-badge" />
            </Tooltip>
          )}
        </div>
        <div className="fs-grid-info">
          {isRenaming ? (
            <InlineRenameInput
              value={file.fileName}
              onConfirm={onRename ?? (() => {})}
              onCancel={onRenameCancel ?? (() => {})}
            />
          ) : (
            <div
              className="fs-grid-name"
              title={file.fileName}
              onDoubleClick={(e) => { e.stopPropagation(); onRenameStart?.(); }}
            >{file.fileName}</div>
          )}
        </div>
      </div>
    </Dropdown>
  );
};

// ── 可拖动 + 可放置文件夹卡片（Story 5.7 / FR-29 + FR-30）──

interface DroppableFolderCardProps {
  dir: DirectoryInfo;
  dirId: string;
  isSelected?: boolean;
  /** 行内重命名模式 */
  isRenaming?: boolean;
  onRename?: (newName: string) => void;
  onRenameCancel?: () => void;
  /** 双击目录名时触发重命名 */
  onRenameStart?: () => void;
  onItemClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  /** spring-loading：拖拽文件悬停 500ms 自动进入该目录（FR-30） */
  onSpringLoad?: () => void;
  contextMenu: MenuProps;
}

export const DroppableFolderCard: React.FC<DroppableFolderCardProps> = ({
  dir, dirId, isSelected = false, isRenaming = false, onRename, onRenameCancel, onRenameStart,
  onItemClick, onDoubleClick, onSpringLoad, contextMenu,
}) => {
  // useSortable 同时提供 draggable（文件夹可拖动，FR-29）与 droppable（文件可移入）
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dirId });
  const { active, over } = useDndContext();
  /** 拖拽悬停本卡片（自身拖拽时不响应 drop 高亮） */
  const isOver = !isDragging && over?.id === dirId;

  // spring-loading（FR-30）：拖拽文件悬停文件夹 500ms 自动进入。
  // 仅对文件拖拽生效——文件夹拖到文件夹上应执行目录移动而非进入。
  // onSpringLoad 走 ref，避免父组件重渲染（pointermove 高频）重置计时器。
  const springRef = useRef(onSpringLoad);
  springRef.current = onSpringLoad;
  useEffect(() => {
    const draggingFile = active?.id?.toString().startsWith('file-') ?? false;
    if (isOver && draggingFile && springRef.current) {
      const timer = window.setTimeout(() => springRef.current?.(), 500);
      return () => window.clearTimeout(timer);
    }
  }, [isOver, active?.id]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Dropdown menu={contextMenu} trigger={['contextMenu']} overlayClassName="fs-grid-dropdown">
      <div
        ref={setNodeRef}
        style={style}
        data-item-id={dirId}
        className={`fs-grid-item fs-grid-item--dir${isDragging ? ' fs-grid-item--dragging' : ''}${isOver ? ' fs-grid-item--drop-target' : ''}${isSelected ? ' fs-grid-item--selected' : ''}`}
        {...attributes}
        {...listeners}
        onClick={onItemClick}
        onDoubleClick={onDoubleClick}
      >
        <div className="fs-grid-thumb fs-grid-thumb--dir">
          <FolderIcon className="fs-grid-thumb-icon" size={76} />
        </div>
        <div className="fs-grid-info">
          {isRenaming ? (
            <InlineRenameInput
              value={dir.name}
              isDirectory
              onConfirm={onRename ?? (() => {})}
              onCancel={onRenameCancel ?? (() => {})}
            />
          ) : (
            <div
              className="fs-grid-name"
              title={dir.name}
              onDoubleClick={(e) => { e.stopPropagation(); onRenameStart?.(); }}
            >{dir.name}</div>
          )}
        </div>
        {isOver && <div className="fs-grid-drop-hint">松开移入此文件夹</div>}
      </div>
    </Dropdown>
  );
};

// ── 可放置目录树节点 ──

interface DroppableTreeNodeProps {
  /** 节点显示名称 */
  name: string;
  /** 目录路径，用作 droppable id 的一部分 */
  path: string;
}

/**
 * 目录树节点的 title 渲染组件
 *
 * 包裹 useDroppable，使树节点成为 @dnd-kit 的 drop 目标，
 * 文件拖到树节点上释放即可移动到该目录。
 * 图标由 Tree 的 icon 字段渲染（保持 antd 原生布局），
 * 此组件只渲染文字与放置徽章，字号行高完全继承 antd 默认。
 */
export const DroppableTreeNode: React.FC<DroppableTreeNodeProps> = ({ name, path }) => {
  const droppableId = `tree-${path}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <span
      ref={setNodeRef}
      className={`fs-tree-node${isOver ? ' fs-tree-node--drop-target' : ''}`}
    >
      <span className="fs-tree-node-name">{name}</span>
      {/* 常驻渲染，靠 opacity 显隐：条件渲染会改变节点宽度，
          导致 dnd-kit 反复重算碰撞而在相邻节点间闪烁 */}
      <span className="fs-tree-node-badge">移入此处</span>
    </span>
  );
};

// ── 面包屑可放置段（Story 5.7 / FR-31）──

interface DroppableBreadcrumbProps {
  /** 目标目录路径（'' 为根目录），用作 droppable id：crumb-{path} */
  path: string;
  children: React.ReactNode;
  /** spring-loading：拖拽文件悬停 500ms 自动回到该上级目录（Story 5.7 退出机制） */
  onSpringLoad?: () => void;
}

/**
 * 面包屑某段的 drop 包装层：文件/文件夹拖到上级目录段释放即移动到该目录，
 * 悬停 500ms 则 spring-load 回到该目录（拖拽不中断，实现「进入后退出」）。
 * 悬停时高亮该段并显示「移到此处」徽章。
 */
export const DroppableBreadcrumb: React.FC<DroppableBreadcrumbProps> = ({ path, children, onSpringLoad }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `crumb-${path}` });
  const { active } = useDndContext();
  const springRef = useRef(onSpringLoad);
  springRef.current = onSpringLoad;

  // spring-loading：悬停上级段 500ms 自动进入（退出 spring-loaded 目录的通道）
  useEffect(() => {
    const draggingFile = active?.id?.toString().startsWith('file-') ?? false;
    if (isOver && draggingFile && springRef.current) {
      const timer = window.setTimeout(() => springRef.current?.(), 500);
      return () => window.clearTimeout(timer);
    }
  }, [isOver, active?.id]);

  return (
    <span ref={setNodeRef} className={`fs-crumb-drop${isOver ? ' fs-crumb-drop--over' : ''}`}>
      {children}
      <span className="fs-crumb-drop-badge">移到此处</span>
    </span>
  );
};
