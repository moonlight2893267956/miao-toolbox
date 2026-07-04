/**
 * 编码自动检测工具 — Story 3.3
 *
 * 读取文件时自动检测编码：
 * - UTF-8 BOM (EF BB BF)
 * - UTF-16 BE BOM (FE FF)
 * - UTF-16 LE BOM (FF FE)
 * - UTF-16 启发式（高比例 null 字节）
 * - 默认 UTF-8
 */

const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB

/** 允许的导入文件扩展名 */
const ALLOWED_EXTENSIONS = ['.json', '.txt'];

/**
 * 读取文件内容，自动检测编码。
 *
 * @param file 用户选择的文件
 * @returns 文件文本内容，或错误消息
 */
export async function readFileWithEncoding(file: File): Promise<{ text: string } | { error: string }> {
  // 文件大小检查
  if (file.size > FILE_SIZE_LIMIT) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return { error: `文件过大（${sizeMB} MB），建议使用本地编辑器` };
  }

  // 扩展名检查
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext) && !file.name.endsWith('.schema.json')) {
    return { error: `不支持的文件类型 "${ext}"，请使用 .json 或 .txt 文件` };
  }

  // 读取并检测编码
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const text = detectEncoding(bytes, buffer);
  return { text };
}

/**
 * 根据 BOM 和启发式规则检测编码并解码。
 */
function detectEncoding(bytes: Uint8Array, buffer: ArrayBuffer): string {
  // UTF-16 BE BOM: FE FF
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(buffer);
  }

  // UTF-16 LE BOM: FF FE
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(buffer);
  }

  // UTF-8 BOM: EF BB BF
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(buffer.slice(3));
  }

  // 启发式：检查前 512 字节中的 null 字节比例
  const sampleLen = Math.min(bytes.length, 512);
  let nullCount = 0;
  for (let i = 0; i < sampleLen; i++) {
    if (bytes[i] === 0) nullCount++;
  }

  // 如果 null 字节超过 30%，很可能是 UTF-16 LE（常见于 Windows 生成的 txt）
  if (nullCount > sampleLen * 0.3) {
    return new TextDecoder('utf-16le').decode(buffer);
  }

  // 默认 UTF-8
  return new TextDecoder('utf-8').decode(buffer);
}
