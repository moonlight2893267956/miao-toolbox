export type SortMethod =
  | 'asc'
  | 'desc'
  | 'natural'
  | 'length-asc'
  | 'length-desc'
  | 'shuffle';

export interface SortOptions {
  method: SortMethod;
  delimiter: string;
  ignoreCase: boolean;
  /**
   * 注入的随机源，默认 Math.random。仅用于 shuffle，方便测试做确定性断言。
   */
  rng?: () => number;
}

export interface SortResult {
  resultText: string;
  stats: { remaining: number; removed: number };
  units: Array<{ index: number; text: string; action: 'kept' | 'empty-filtered' }>;
}

const DEFAULT_OPTIONS: SortOptions = {
  method: 'asc',
  delimiter: '\n',
  ignoreCase: false,
};

/** 按分隔符切分；空分隔符退化为按换行处理 */
function splitUnits(input: string, delimiter: string): string[] {
  if (delimiter === '') return input.split('\n');
  return input.split(delimiter);
}

/** 自然排序比较器：将字符串中的数字段按数值比较 */
function naturalCompare(a: string, b: string): number {
  const ax: Array<string | number> = [];
  const bx: Array<string | number> = [];
  const re = /(\d+)|(\D+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(a)) !== null) {
    ax.push(m[1] !== undefined ? Number(m[1]) : m[2]!);
  }
  while ((m = re.exec(b)) !== null) {
    bx.push(m[1] !== undefined ? Number(m[1]) : m[2]!);
  }
  const len = Math.min(ax.length, bx.length);
  for (let i = 0; i < len; i++) {
    const av = ax[i];
    const bv = bx[i];
    if (typeof av === 'number' && typeof bv === 'number') {
      if (av !== bv) return av - bv;
    } else if (av < bv) {
      return -1;
    } else if (av > bv) {
      return 1;
    }
  }
  return ax.length - bx.length;
}

/** Fisher-Yates 稳定乱序（使用注入 rng 便于测试） */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 对文本按行或分隔符进行纯函数排序。
 * 默认不使用执行按钮——选项即时生效。
 */
export function sortText(input: string, options: Partial<SortOptions> = {}): SortResult {
  if (typeof input !== 'string' || input === '') {
    return { resultText: '', stats: { remaining: 0, removed: 0 }, units: [] };
  }

  const opts: SortOptions = { ...DEFAULT_OPTIONS, ...options };
  const rawUnits = splitUnits(input, opts.delimiter);

  // 构建带原始索引的工作单元
  const items = rawUnits.map((text, index) => ({ index, text }));

  let ordered: Array<{ index: number; text: string }>;
  const removed = 0;

  if (opts.method === 'shuffle') {
    ordered = shuffle(items, opts.rng ?? Math.random);
  } else {
    // 大小写敏感：按码点顺序（'B'(66) < 'a'(97)）；
    // 忽略大小写：统一小写后比较。
    const norm = (s: string) => (opts.ignoreCase ? s.toLowerCase() : s);
    const cmpBaseline = (x: string, y: string): number => {
      if (x < y) return -1;
      if (x > y) return 1;
      return 0;
    };

    // 数组 sort 自 ES2019 起稳定；以 index 作为 tie-breaker 保证完全确定。
    ordered = items.slice().sort((a, b) => {
      let cmp: number;
      switch (opts.method) {
        case 'desc':
          cmp = cmpBaseline(norm(b.text), norm(a.text));
          break;
        case 'natural':
          cmp = naturalCompare(norm(a.text), norm(b.text));
          break;
        case 'length-asc':
          cmp = a.text.length - b.text.length;
          break;
        case 'length-desc':
          cmp = b.text.length - a.text.length;
          break;
        case 'asc':
        default:
          cmp = cmpBaseline(norm(a.text), norm(b.text));
          break;
      }
      return cmp !== 0 ? cmp : a.index - b.index;
    });
  }

  const units = ordered.map((it) => ({
    index: it.index,
    text: it.text,
    action: 'kept' as const,
  }));

  const resultText = ordered.map((it) => it.text).join(opts.delimiter === '' ? '\n' : opts.delimiter);

  return {
    resultText,
    stats: { remaining: ordered.length, removed },
    units,
  };
}
