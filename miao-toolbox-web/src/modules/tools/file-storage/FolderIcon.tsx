import React from 'react';
import folderIconUrl from '../../../assets/folder-icon.png';

interface FolderIconProps {
  className?: string;
  /** 像素尺寸，默认 64 */
  size?: number;
}

/**
 * macOS 风格渐变文件夹图标（PNG，透明背景）。
 * 用于网格卡片、列表单元格、目录树等位置的文件夹标识。
 */
const FolderIcon: React.FC<FolderIconProps> = ({ className, size = 64 }) => (
  <img
    src={folderIconUrl}
    alt=""
    className={className}
    width={size}
    height={size}
    draggable={false}
  />
);

export default FolderIcon;
