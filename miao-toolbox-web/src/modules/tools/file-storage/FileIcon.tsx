import {
  FileOutlined,
  FileTextOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  FileWordOutlined,
} from '@ant-design/icons';
import { getFileCategory } from './fileCategory';

/**
 * 文件类型图标（配色沿用文件管理页既有规范）
 *
 * 单独成文件的原因：FilePreviewer.tsx 需要保持「只导出组件」，
 * 否则会触发 react-refresh/only-export-components 告警，影响 HMR。
 */
export const getFileIcon = (
  mimeType: string | null | undefined,
  className?: string,
  fileName?: string | null | undefined,
) => {
  const cat = getFileCategory(mimeType, fileName);
  const iconClass = className || 'fs-file-icon';
  switch (cat) {
    case 'image': return <FileImageOutlined className={iconClass} style={{ color: '#eb2f96' }} />;
    case 'text': return <FileTextOutlined className={iconClass} style={{ color: '#1890ff' }} />;
    case 'audio': return <SoundOutlined className={iconClass} style={{ color: '#722ed1' }} />;
    case 'video': return <VideoCameraOutlined className={iconClass} style={{ color: '#fa8c16' }} />;
    case 'pdf': return <FilePdfOutlined className={iconClass} style={{ color: '#f5222d' }} />;
    case 'docx': return <FileWordOutlined className={iconClass} style={{ color: '#1677ff' }} />;
    default: return <FileOutlined className={iconClass} style={{ color: '#8c8c8c' }} />;
  }
};

export default getFileIcon;
