/**
 * 文件类型判定与格式化工具
 *
 * 从 file-storage/index.tsx 抽取，供「我的文件」页与外链分享页共用，
 * 保证两处预览类型判定逻辑完全一致（PRD §4.12 FR-19）。
 */

export type FileCategory = 'image' | 'text' | 'audio' | 'video' | 'pdf' | 'docx' | 'other';

export const TEXT_EXTENSIONS = new Set([
  '.sh', '.bash', '.zsh', '.py', '.rb', '.rs', '.go', '.java', '.c', '.h',
  '.cpp', '.hpp', '.cc', '.cs', '.php', '.ts', '.tsx', '.js', '.jsx',
  '.mjs', '.cjs', '.vue', '.html', '.htm', '.css', '.scss', '.sass',
  '.less', '.json', '.xml', '.yml', '.yaml', '.toml', '.ini', '.cfg',
  '.conf', '.env', '.sql', '.md', '.markdown', '.txt', '.log', '.csv',
  '.tsv', '.gitignore', '.dockerignore', '.editorconfig', '.eslintrc',
  '.prettierrc', '.babelrc', '.npmrc', '.yarnrc', '.properties', '.gradle',
  '.cmake', '.makefile', '.dockerfile',
]);

export const isTextFileByName = (fileName: string | null | undefined): boolean => {
  if (!fileName) return false;
  const lower = fileName.toLowerCase();
  // 检查扩展名
  for (const ext of TEXT_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  // 无扩展名的常见文本文件名
  const baseName = lower.split('/').pop() || '';
  return ['makefile', 'dockerfile', 'vagrantfile', 'gemfile', 'rakefile', '.gitignore', '.env', '.npmrc'].includes(baseName);
};

export const getFileCategory = (mimeType: string | null | undefined, fileName?: string | null | undefined): FileCategory => {
  if (!mimeType) {
    // MIME 为空时，根据文件名兜底
    return isTextFileByName(fileName) ? 'text' : 'other';
  }
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('text/')) return 'text';
  if (mimeType.startsWith('application/x-shellscript')) return 'text';
  if ([
    'application/json', 'application/xml', 'application/javascript',
    'application/x-yaml', 'application/x-yml', 'application/x-sh',
    'application/x-python', 'application/x-java-source',
    'application/x-csrc', 'application/x-c++src',
    'application/x-go', 'application/x-rust', 'application/x-ruby',
    'application/x-php', 'application/x-httpd-php',
    'application/x-toml', 'application/x-ini', 'application/x-env',
    'application/x-sql', 'application/x-latex',
    'application/typescript', 'application/x-typescript',
    'application/x-jsx', 'application/x-tsx', 'application/x-vue',
    'application/x-scss', 'application/x-sass', 'application/x-less',
    'application/x-markdown', 'application/x-conf', 'application/x-config',
  ].includes(mimeType)) return 'text';
  // application/octet-stream 时根据文件名兜底
  if (mimeType === 'application/octet-stream' && isTextFileByName(fileName)) return 'text';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimeType === 'application/msword') return 'docx';
  return 'other';
};

export const isPreviewable = (mimeType: string | null | undefined, fileName?: string | null | undefined): boolean => {
  const cat = getFileCategory(mimeType, fileName);
  return cat === 'image' || cat === 'text' || cat === 'audio' || cat === 'video' || cat === 'pdf' || cat === 'docx';
};

export const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
};
