/**
 * 提取纯函数（Story 3.3 铺垫）
 * - extractLinesContaining：行包含提取（按关键词过滤整行），纯字符串操作，无 ReDoS 风险，不走 Worker
 * - buildExtractRegex：由预设/模式生成扫描正则（供 Worker extract 使用）
 */

export interface LineExtractOptions {
  /** 关键词：行文本包含即命中；空字符串视为不过滤（返回全部行） */
  keyword: string;
  /** 忽略大小写 */
  ignoreCase?: boolean;
  /** 去除空行 */
  removeEmpty?: boolean;
}

export interface LineExtractResult {
  resultText: string;
  lines: string[];
  stats: { remaining: number; removed: number };
}

/** 按行切分（统一处理 \r\n） */
export function splitLines(input: string): string[] {
  return input.split(/\r?\n/);
}

/** 行包含提取：保留包含 keyword 的整行 */
export function extractLinesContaining(input: string, options: LineExtractOptions): LineExtractResult {
  if (typeof input !== 'string' || input === '') {
    return { resultText: '', lines: [], stats: { remaining: 0, removed: 0 } };
  }
  const { keyword, ignoreCase = false, removeEmpty = false } = options;
  const lines = splitLines(input);
  const needle = ignoreCase ? keyword.toLowerCase() : keyword;
  const kept = lines.filter((line) => {
    if (removeEmpty && line.trim() === '') return false;
    if (keyword === '') return true;
    const hay = ignoreCase ? line.toLowerCase() : line;
    return hay.includes(needle);
  });
  return {
    resultText: kept.join('\n'),
    lines: kept,
    stats: { remaining: kept.length, removed: lines.length - kept.length },
  };
}

/**
 * 由预设/模式生成提取正则。
 * - 预设（preset）传正则串；直接返回原串（由调用方确保合法）
 * - 该函数目前为薄包装，后续可扩展预编译与缓存
 */
export function buildExtractRegex(presetPattern: string): string {
  return presetPattern;
}

/** 提取结果格式（FR-4.4） */
export type ExtractFormat = 'all' | 'dedup' | 'groups';

/** Worker 返回的匹配项（含捕获组） */
export interface ExtractMatch {
  fullMatch: string;
  index: number;
  endIndex: number;
  groups?: string[];
}

/** 按格式格式化匹配项为「每行一个」的结果文本 */
export function formatExtractMatches(matches: ExtractMatch[], format: ExtractFormat = 'all'): string {
  let items: string[];
  switch (format) {
    case 'groups':
      // 仅捕获组：每行一个捕获组值（优先第一个非空组；无组时退回完整匹配）
      items = matches.map((m) => {
        if (m.groups && m.groups.length > 0) {
          return m.groups.find((g) => g !== '') ?? m.groups[0] ?? m.fullMatch;
        }
        return m.fullMatch;
      });
      break;
    case 'dedup':
      // 去重：按完整匹配去重（保留首次出现）
      items = [];
      {
        const seen = new Set<string>();
        for (const m of matches) {
          if (!seen.has(m.fullMatch)) {
            seen.add(m.fullMatch);
            items.push(m.fullMatch);
          }
        }
      }
      break;
    case 'all':
    default:
      items = matches.map((m) => m.fullMatch);
      break;
  }
  return items.join('\n');
}

/** 匹配项去重计数（供统计展示） */
export function countUniqueMatches(matches: ExtractMatch[]): number {
  return new Set(matches.map((m) => m.fullMatch)).size;
}
