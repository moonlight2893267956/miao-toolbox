import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { FolderOutlined } from '@ant-design/icons';
import { getFileCategory } from './fileCategory';
import { getFileIcon } from './FileIcon';
import GridThumbnail from './GridThumbnail';
import type { DirectoryInfo, FileInfo } from './types';

// ── 可排序文件卡片 ──

interface SortableFileCardProps {
  file: FileInfo;
  fileId: string;
  isPreviewable: boolean;
  onDoubleClick: () => void;
  contextMenu: MenuProps;
}

export const SortableFileCard: React.FC<SortableFileCardProps> = ({
  file, fileId, onDoubleClick, contextMenu,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fileId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 100 : undefined,
  };

  return (
    <Dropdown menu={contextMenu} trigger={['contextMenu']} overlayClassName="fs-grid-dropdown">
      <div
        ref={setNodeRef}
        style={style}
        className={`fs-grid-item${isDragging ? ' fs-grid-item--dragging' : ''}`}
        {...attributes}
        {...listeners}
        onDoubleClick={onDoubleClick}
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
          <div className="fs-grid-name" title={file.fileName}>{file.fileName}</div>
        </div>
      </div>
    </Dropdown>
  );
};

// ── 可放置文件夹卡片 ──

interface DroppableFolderCardProps {
  dir: DirectoryInfo;
  dirId: string;
  onClick: () => void;
  contextMenu: MenuProps;
}

export const DroppableFolderCard: React.FC<DroppableFolderCardProps> = ({
  dir, dirId, onClick, contextMenu,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: dirId });

  return (
    <Dropdown menu={contextMenu} trigger={['contextMenu']} overlayClassName="fs-grid-dropdown">
      <div
        ref={setNodeRef}
        className={`fs-grid-item fs-grid-item--dir${isOver ? ' fs-grid-item--drop-target' : ''}`}
        onClick={onClick}
      >
        <div className="fs-grid-thumb fs-grid-thumb--dir">
          <FolderOutlined className="fs-grid-thumb-icon" />
        </div>
        <div className="fs-grid-info">
          <div className="fs-grid-name" title={dir.name}>{dir.name}</div>
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
      {name}
      {isOver && <span className="fs-tree-node-badge">移入</span>}
    </span>
  );
};
