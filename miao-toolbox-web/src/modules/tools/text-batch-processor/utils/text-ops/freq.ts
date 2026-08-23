/**
 * 词频统计纯函数（Story 4.1）
 * - basicStats：基础统计（字符/行/段落/英文单词）
 * - wordFrequency：词频统计（按空格 / 按字 / 按词，支持停用词过滤 + Top N）
 */

/** 基础统计结果（FR-6.1） */
export interface BasicStats {
  /** 字符数（含空白） */
  chars: number;
  /** 字符数（不含空白） */
  charsNoSpace: number;
  /** 行数 */
  lines: number;
  /** 段落数（按空行分隔） */
  paragraphs: number;
  /** 英文单词数 */
  words: number;
}

/** 切分模式（FR-6.5） */
export type SplitMode = 'space' | 'char' | 'word';

/** 词频条目 */
export interface WordFreqEntry {
  word: string;
  count: number;
  /** 占比（0~1，保留 3 位） */
  percentage: number;
}

export interface WordFrequencyOptions {
  /** 切分模式：按空格 / 按字 / 按词（默认 space） */
  splitMode?: SplitMode;
  /** 只保留前 N 个（按次数降序） */
  topN?: number;
  /** 停用词表（过滤不计入） */
  stopWords?: string[];
  /** 中文分词函数（splitMode='word' 时注入；null 表示不可用） */
  segment?: (text: string) => string[];
}

/**
 * 基础统计：字符（含/不含空白）、行、段落、英文单词。
 * - 行：按 \r?\n 切分；空输入视为 0 行
 * - 段落：按空行分隔
 * - 英文单词：连续 [A-Za-z0-9_'] 片段计数
 */
export function basicStats(input: string): BasicStats {
  if (typeof input !== 'string' || input === '') {
    return { chars: 0, charsNoSpace: 0, lines: 0, paragraphs: 0, words: 0 };
  }
  const chars = input.length;
  const charsNoSpace = input.replace(/\s/g, '').length;
  const lines = input.split(/\r?\n/).length;
  // 段落：按 1 个以上空行分割，过滤空段
  const paragraphs = input
    .split(/\r?\n\s*\r?\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0).length;
  const words = (input.match(/[A-Za-z0-9_']+/g) ?? []).length;
  return { chars, charsNoSpace, lines, paragraphs, words };
}

/** 按空格切分：中英文混排时保留英文单词与中文片段 */
function splitBySpace(input: string): string[] {
  return input.split(/[\s,，。.;；:：!！?？"'“”‘’()（）[\]【】{}]/).filter((w) => w.length > 0);
}

/** 按字切分（中文逐字；保留英文单词整体） */
function splitByChar(input: string): string[] {
  const out: string[] = [];
  // 英文单词连续片段整体保留
  const enRe = /[A-Za-z0-9_']+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = enRe.exec(input)) !== null) {
    if (m.index > last) {
      for (const ch of input.slice(last, m.index)) {
        if (ch.trim() !== '') out.push(ch);
      }
    }
    out.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < input.length) {
    for (const ch of input.slice(last)) {
      if (ch.trim() !== '') out.push(ch);
    }
  }
  return out;
}

/**
 * 词频统计：按切分模式分词 → 停用词过滤 → 计数 → 降序 → Top N。
 * 占比 = count / 总词数（过滤停用词后）。
 */
export function wordFrequency(input: string, options: WordFrequencyOptions = {}): WordFreqEntry[] {
  if (typeof input !== 'string' || input === '') return [];
  const { splitMode = 'space', topN, stopWords = [], segment } = options;

  let tokens: string[];
  if (splitMode === 'word') {
    if (!segment) {
      // 分词不可用：降级为按字切分
      tokens = splitByChar(input);
    } else {
      // 分词器可能未就绪（WASM 加载异常/返回空）：try-catch 兜底降级为按字，UI 不崩溃
      try {
        const seg = segment(input).filter((w) => w.trim() !== '');
        tokens = seg.length > 0 ? seg : splitByChar(input);
      } catch {
        tokens = splitByChar(input);
      }
    }
  } else if (splitMode === 'char') {
    tokens = splitByChar(input);
  } else {
    tokens = splitBySpace(input);
  }

  const stopSet = new Set(stopWords.map((w) => w.toLowerCase()));
  const countMap = new Map<string, number>();
  let total = 0;
  for (const raw of tokens) {
    const w = raw;
    if (stopSet.has(w.toLowerCase())) continue;
    countMap.set(w, (countMap.get(w) ?? 0) + 1);
    total++;
  }

  const entries: WordFreqEntry[] = [...countMap.entries()]
    .map(([word, count]) => ({
      word,
      count,
      percentage: total === 0 ? 0 : Math.round((count / total) * 1000) / 1000,
    }))
    // 仅按次数降序；JS sort 稳定，同次数保持首次出现顺序
    .sort((a, b) => b.count - a.count);

  return topN && topN > 0 ? entries.slice(0, topN) : entries;
}
