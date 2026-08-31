import React from 'react';
import {
  FileOutlined,
  SoundOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { Button, Spin, Tooltip } from 'antd';
import PdfViewer from './PdfViewer';
import DocxPreviewContainer from './DocxPreviewContainer';
import { getFileCategory } from './fileCategory';

export interface FilePreviewerProps {
  /** 文件名 */
  fileName: string;
  /** MIME 类型 */
  mimeType?: string | null;
  /** 二进制预览的 Blob URL（图片/音视频/PDF/DOCX 使用） */
  objectUrl: string | null;
  /** 文本预览内容（文本文件使用） */
  text: string | null;
  /** 是否加载中 */
  loading: boolean;
  /** 是否展示「编辑」按钮（默认 false，外链分享页为只读） */
  canEdit?: boolean;
  /** 是否处于编辑态 */
  editing?: boolean;
  /** 编辑中的内容 */
  editContent?: string;
  onEditContentChange?: (value: string) => void;
  onStartEdit?: () => void;
}

/**
 * 文件预览器
 *
 * 纯展示组件：不负责数据加载与 Blob URL 生命周期，
 * 由调用方（文件管理页 / 外链分享页）负责加载数据并在卸载时 revokeObjectURL。
 * 渲染六态：image / text / audio / video / pdf / docx，其余类型展示「暂不支持预览」。
 */
const FilePreviewer: React.FC<FilePreviewerProps> = ({
  fileName,
  mimeType,
  objectUrl,
  text,
  loading,
  canEdit = false,
  editing = false,
  editContent = '',
  onEditContentChange,
  onStartEdit,
}) => {
  const cat = getFileCategory(mimeType, fileName);

  if (loading) {
    return (
      <div className="fs-preview-loading">
        <Spin tip="加载中..." />
      </div>
    );
  }

  if (cat === 'image' && objectUrl) {
    return (
      <div className="fs-preview-image-wrap">
        <img src={objectUrl} alt={fileName} className="fs-preview-image" />
        <div className="fs-preview-image-foot">{fileName}</div>
      </div>
    );
  }

  if (cat === 'text' && text !== null) {
    const isError = text.startsWith('预览失败');
    return (
      <div className={`fs-preview-text-wrap${isError ? ' fs-preview-text-wrap--error' : ''}`}>
        <div className="fs-preview-text-header">
          <span className="fs-preview-text-dot fs-preview-text-dot--red" />
          <span className="fs-preview-text-dot fs-preview-text-dot--yellow" />
          <span className="fs-preview-text-dot fs-preview-text-dot--green" />
          <span className="fs-preview-text-filename">{fileName}</span>
          <span className="fs-preview-text-lang">{cat.toUpperCase()}</span>
          {!isError && !editing && canEdit && (
            <Tooltip title={canEdit ? '' : '当前无编辑权限'}>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                className="fs-preview-edit-btn"
                disabled={!canEdit}
                onClick={onStartEdit}
              >
                编辑
              </Button>
            </Tooltip>
          )}
        </div>
        {editing ? (
          <textarea
            className="fs-preview-editor"
            value={editContent}
            onChange={(e) => onEditContentChange?.(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <pre className="fs-preview-code"><code>{text}</code></pre>
        )}
      </div>
    );
  }

  if (cat === 'audio' && objectUrl) {
    return (
      <div className="fs-preview-media-wrap fs-preview-media-wrap--audio">
        <div className="fs-preview-media-glow" />
        <SoundOutlined className="fs-preview-media-icon" />
        <div className="fs-preview-media-label">{fileName}</div>
        <audio controls src={objectUrl} className="fs-preview-audio">
          您的浏览器不支持音频播放
        </audio>
      </div>
    );
  }

  if (cat === 'video' && objectUrl) {
    return (
      <div className="fs-preview-media-wrap fs-preview-media-wrap--video">
        <video controls src={objectUrl} className="fs-preview-video">
          您的浏览器不支持视频播放
        </video>
      </div>
    );
  }

  if (cat === 'pdf' && objectUrl) {
    return <PdfViewer url={objectUrl} fileName={fileName} />;
  }

  if (cat === 'docx' && objectUrl) {
    return <DocxPreviewContainer url={objectUrl} />;
  }

  return (
    <div className="fs-preview-unsupported">
      <div className="fs-preview-unsupported-art">
        <FileOutlined className="fs-preview-unsupported-icon" />
      </div>
      <div className="fs-preview-unsupported-text">该文件类型暂不支持预览</div>
      <div className="fs-preview-unsupported-hint">可点击「下载」获取原始文件</div>
    </div>
  );
};

export default FilePreviewer;
