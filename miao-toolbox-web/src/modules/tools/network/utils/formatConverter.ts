/**
 * 数据格式转换：JSON / YAML / CSV / TOML 互转
 */
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';

export type DataFormat = 'json' | 'yaml' | 'csv' | 'toml';

export class FormatConvertError extends Error {
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, line?: number, column?: number) {
    super(message);
    this.name = 'FormatConvertError';
    this.line = line;
    this.column = column;
  }
}

/** 将字符偏移转为 1-based 行号 / 列号 */
export function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  const safe = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let col = 1;
  for (let i = 0; i < safe; i++) {
    if (text[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, column: col };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'JSON 解析失败';
    // V8: "... at position 12" / "... in JSON at position 12"
    const m = msg.match(/position\s+(\d+)/i);
    if (m) {
      const pos = Number(m[1]);
      const { line, column } = offsetToLineCol(text, pos);
      throw new FormatConvertError(`JSON 解析错误（第 ${line} 行第 ${column} 列）：${msg}`, line, column);
    }
    // 部分引擎: line 2 column 5
    const m2 = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (m2) {
      const line = Number(m2[1]);
      const column = Number(m2[2]);
      throw new FormatConvertError(`JSON 解析错误（第 ${line} 行第 ${column} 列）：${msg}`, line, column);
    }
    throw new FormatConvertError(`JSON 解析错误：${msg}`);
  }
}

function parseYaml(text: string): unknown {
  try {
    return yamlLoad(text);
  } catch (e) {
    const anyErr = e as { mark?: { line?: number; column?: number }; message?: string };
    const line = anyErr.mark?.line !== undefined ? anyErr.mark.line + 1 : undefined;
    const column = anyErr.mark?.column !== undefined ? anyErr.mark.column + 1 : undefined;
    const base = anyErr.message ?? 'YAML 解析失败';
    if (line !== undefined) {
      throw new FormatConvertError(`YAML 解析错误（第 ${line} 行）：${base}`, line, column);
    }
    throw new FormatConvertError(`YAML 解析错误：${base}`);
  }
}

function parseTomlDoc(text: string): unknown {
  try {
    return parseToml(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'TOML 解析失败';
    const m = msg.match(/[Ll]ine\s+(\d+)/);
    const line = m ? Number(m[1]) : undefined;
    if (line !== undefined) {
      throw new FormatConvertError(`TOML 解析错误（第 ${line} 行）：${msg}`, line);
    }
    throw new FormatConvertError(`TOML 解析错误：${msg}`);
  }
}

/**
 * 简易 RFC4180 风格 CSV 解析：
 * - 首行为表头
 * - 字段可被双引号包裹；引号内 "" 表示转义引号
 * - 支持字段内换行（引号内）
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = tokenizeCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0]!.map((h) => h.trim());
  if (headers.length === 0 || headers.every((h) => !h)) {
    throw new FormatConvertError('CSV 解析错误：缺少表头');
  }
  const result: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    // 跳过全空行
    if (row.every((c) => c.trim() === '')) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] || `col_${c + 1}`;
      obj[key] = row[c] ?? '';
    }
    result.push(obj);
  }
  return result;
}

export function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    // 避免文件末尾空行产生多余空行
    if (row.length === 1 && row[0] === '' && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      pushField();
      i++;
      continue;
    }
    if (ch === '\n') {
      pushField();
      pushRow();
      i++;
      continue;
    }
    if (ch === '\r') {
      // CRLF
      if (text[i + 1] === '\n') i++;
      pushField();
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // 最后字段
  if (field.length > 0 || row.length > 0 || text.endsWith(',')) {
    pushField();
    pushRow();
  }
  if (inQuotes) {
    throw new FormatConvertError('CSV 解析错误：存在未闭合的引号');
  }
  return rows;
}

export function stringifyCsv(data: unknown): string {
  let rows: Record<string, unknown>[];
  if (Array.isArray(data)) {
    if (data.length === 0) return '';
    if (typeof data[0] !== 'object' || data[0] === null) {
      // 简单数组 → 单列
      return ['value', ...data.map((v) => escapeCsvField(String(v)))].join('\n');
    }
    rows = data as Record<string, unknown>[];
  } else if (data && typeof data === 'object') {
    rows = [data as Record<string, unknown>];
  } else {
    throw new FormatConvertError('CSV 输出需要对象数组或对象');
  }

  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
    }
  }
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvField(row[h] == null ? '' : String(row[h]))).join(','));
  }
  return lines.join('\n');
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseByFormat(text: string, format: DataFormat): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new FormatConvertError('输入为空');
  }
  switch (format) {
    case 'json':
      return parseJson(trimmed);
    case 'yaml':
      return parseYaml(trimmed);
    case 'toml':
      return parseTomlDoc(trimmed);
    case 'csv':
      return parseCsv(text); // 保留前导空白可能在字段里，用原文
    default:
      throw new FormatConvertError(`不支持的输入格式：${format}`);
  }
}

function stringifyByFormat(data: unknown, format: DataFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'yaml':
      return yamlDump(data, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false,
      }).trimEnd();
    case 'toml':
      try {
        return stringifyToml(data as Record<string, unknown>).trimEnd();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'TOML 序列化失败';
        throw new FormatConvertError(
          `TOML 输出失败（顶层需为对象，且类型受限）：${msg}`,
        );
      }
    case 'csv':
      return stringifyCsv(data);
    default:
      throw new FormatConvertError(`不支持的输出格式：${format}`);
  }
}

export interface ConvertResult {
  output: string;
  error?: string;
}

/**
 * 将 input 从 from 格式转换到 to 格式。
 */
export function convertDataFormat(
  input: string,
  from: DataFormat,
  to: DataFormat,
): ConvertResult {
  if (from === to) {
    // 同源：做一轮格式化
    try {
      const data = parseByFormat(input, from);
      return { output: stringifyByFormat(data, to) };
    } catch (e) {
      return { output: '', error: formatErrorMessage(e) };
    }
  }
  try {
    const data = parseByFormat(input, from);
    return { output: stringifyByFormat(data, to) };
  } catch (e) {
    return { output: '', error: formatErrorMessage(e) };
  }
}

function formatErrorMessage(e: unknown): string {
  if (e instanceof FormatConvertError) return e.message;
  if (e instanceof Error) return e.message;
  return '转换失败';
}
