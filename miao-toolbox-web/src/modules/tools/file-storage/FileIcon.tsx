import React from 'react';
import fileImageIcon from '../../../assets/fs-icons/file-image.png';
import fileTextIcon from '../../../assets/fs-icons/file-text.png';
import fileAudioIcon from '../../../assets/fs-icons/file-audio.png';
import fileVideoIcon from '../../../assets/fs-icons/file-video.png';
import filePdfIcon from '../../../assets/fs-icons/file-pdf.png';
import fileDocxIcon from '../../../assets/fs-icons/file-docx.png';
import fileGenericIcon from '../../../assets/fs-icons/file-generic.png';
import { getFileCategory } from './fileCategory';

/**
 * 文件类型图标（macOS 风格 PNG，透明背景）
 *
 * 配色沿用文件管理页既有语义：
 * 图片-粉 / 文本-蓝 / 音频-紫 / 视频-橙 / PDF-红 / Word-蓝 / 通用-灰
 *
 * 单独成文件的原因：FilePreviewer.tsx 需要保持「只导出组件」，
 * 否则会触发 react-refresh/only-export-components 告警，影响 HMR。
 */
const CATEGORY_ICON: Record<string, string> = {
  image: fileImageIcon,
  text: fileTextIcon,
  audio: fileAudioIcon,
  video: fileVideoIcon,
  pdf: filePdfIcon,
  docx: fileDocxIcon,
  other: fileGenericIcon,
};

export const getFileIcon = (
  mimeType: string | null | undefined,
  className?: string,
  fileName?: string | null | undefined,
): React.ReactNode => {
  const cat = getFileCategory(mimeType, fileName);
  const iconClass = className || 'fs-file-icon';
  return (
    <img
      src={CATEGORY_ICON[cat] ?? fileGenericIcon}
      alt=""
      className={iconClass}
      draggable={false}
    />
  );
};

export default getFileIcon;
