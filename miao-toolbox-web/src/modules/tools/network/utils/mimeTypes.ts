/**
 * 常见 MIME 类型互查（扩展名 ↔ MIME）
 */

export interface MimeEntry {
  ext: string;
  mime: string;
  desc: string;
}

export const MIME_LIST: MimeEntry[] = [
  { ext: '.html', mime: 'text/html', desc: 'HTML 文档' },
  { ext: '.htm', mime: 'text/html', desc: 'HTML 文档' },
  { ext: '.css', mime: 'text/css', desc: '样式表' },
  { ext: '.js', mime: 'text/javascript', desc: 'JavaScript' },
  { ext: '.mjs', mime: 'text/javascript', desc: 'ES Module' },
  { ext: '.json', mime: 'application/json', desc: 'JSON 数据' },
  { ext: '.xml', mime: 'application/xml', desc: 'XML' },
  { ext: '.txt', mime: 'text/plain', desc: '纯文本' },
  { ext: '.csv', mime: 'text/csv', desc: 'CSV' },
  { ext: '.md', mime: 'text/markdown', desc: 'Markdown' },
  { ext: '.png', mime: 'image/png', desc: 'PNG 图片' },
  { ext: '.jpg', mime: 'image/jpeg', desc: 'JPEG 图片' },
  { ext: '.jpeg', mime: 'image/jpeg', desc: 'JPEG 图片' },
  { ext: '.gif', mime: 'image/gif', desc: 'GIF 图片' },
  { ext: '.webp', mime: 'image/webp', desc: 'WebP 图片' },
  { ext: '.svg', mime: 'image/svg+xml', desc: 'SVG 矢量图' },
  { ext: '.ico', mime: 'image/x-icon', desc: '图标' },
  { ext: '.mp3', mime: 'audio/mpeg', desc: 'MP3 音频' },
  { ext: '.wav', mime: 'audio/wav', desc: 'WAV 音频' },
  { ext: '.mp4', mime: 'video/mp4', desc: 'MP4 视频' },
  { ext: '.webm', mime: 'video/webm', desc: 'WebM 视频' },
  { ext: '.pdf', mime: 'application/pdf', desc: 'PDF' },
  { ext: '.zip', mime: 'application/zip', desc: 'ZIP 压缩包' },
  { ext: '.gz', mime: 'application/gzip', desc: 'Gzip' },
  { ext: '.tar', mime: 'application/x-tar', desc: 'Tar' },
  { ext: '.woff', mime: 'font/woff', desc: 'WOFF 字体' },
  { ext: '.woff2', mime: 'font/woff2', desc: 'WOFF2 字体' },
  { ext: '.ttf', mime: 'font/ttf', desc: 'TrueType 字体' },
  { ext: '.wasm', mime: 'application/wasm', desc: 'WebAssembly' },
  { ext: '.yaml', mime: 'application/yaml', desc: 'YAML' },
  { ext: '.yml', mime: 'application/yaml', desc: 'YAML' },
  { ext: '.toml', mime: 'application/toml', desc: 'TOML' },
  { ext: '.bin', mime: 'application/octet-stream', desc: '二进制流' },
];

/**
 * 扩展名 / MIME / 类型前缀 / 中文描述 模糊匹配。
 * 注意：不能把无点号词一律当成扩展名（否则 image → .image，匹配不到 image/png）。
 */
export function lookupMime(query: string): MimeEntry[] {
  const raw = query.trim().toLowerCase();
  if (!raw) return MIME_LIST;

  const bare = raw.replace(/^\./, '');
  const asExt = raw.startsWith('.') ? raw : `.${bare}`;

  return MIME_LIST.filter((e) => {
    const desc = e.desc.toLowerCase();
    return (
      e.ext === asExt ||
      e.ext === raw ||
      e.ext.includes(bare) ||
      e.mime === raw ||
      e.mime.includes(raw) ||
      e.mime.startsWith(`${bare}/`) || // image → image/png
      desc.includes(bare) ||
      desc.includes(raw)
    );
  });
}

export function formatMimeText(items: MimeEntry[]): string {
  if (items.length === 0) return '未找到匹配的 MIME 类型';
  return items.map((e) => `${e.ext.padEnd(8)} → ${e.mime}\n  ${e.desc}`).join('\n\n');
}
