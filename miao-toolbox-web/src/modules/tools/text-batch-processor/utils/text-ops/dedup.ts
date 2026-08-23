export interface DedupOptions {
  /** 保留末次出现位置（默认保留首次） */
  keepLast?: boolean;
  /** 忽略大小写后判定重复 */
  ignoreCase?: boolean;
  /** 比较前 trim 单元首尾空白（输出单元同样去首尾空白） */
  ignoreWhitespace?: boolean;
  /** 移除空单元（仅空白也视为空） */
  ignoreEmptyLines?: boolean;
  /** 自定义分隔符；非空时按分隔符切分/合并，否则按换行 */
  delimiter?: string;
}

export interface DedupResult {
  resultText: string;
  stats: {
    removed: number;
    remaining: number;
  };
  /** 每行的命运（与输入 split 后的行一一对应，便于 UI 渲染 diff） */
  units: Array<{
    index: number;
    text: string;
    action: 'kept' | 'removed' | 'empty-filtered';
  }>;
}

const DEFAULT_OPTIONS: Required<Omit<DedupOptions, 'delimiter'>> & { delimiter?: string } = {
  keepLast: false,
  ignoreCase: false,
  ignoreWhitespace: false,
  ignoreEmptyLines: false,
  delimiter: undefined,
};

function normalizeKey(unit: string, options: Required<Omit<DedupOptions, 'delimiter'>>): string {
  let key = unit;
  if (options.ignoreWhitespace) {
    key = key.trim();
  }
  if (options.ignoreCase) {
    key = key.toLowerCase();
  }
  return key;
}

function transformUnit(unit: string, options: Required<Omit<DedupOptions, 'delimiter'>>): string {
  return options.ignoreWhitespace ? unit.trim() : unit;
}

/**
 * 对文本执行去重，返回去重后文本与统计。
 * 纯函数，无副作用，不依赖 DOM / 框架。
 */
export function deduplicate(input: string, options?: DedupOptions): DedupResult {
  const opts = { ...DEFAULT_OPTIONS, ...options } as Required<Omit<DedupOptions, 'delimiter'>> & {
    delimiter?: string;
  };

  if (input === '' || input == null) {
    return { resultText: '', stats: { removed: 0, remaining: 0 }, units: [] };
  }

  const sep = opts.delimiter !== undefined && opts.delimiter !== '' ? opts.delimiter : '\n';
  const rawUnits = input.split(sep);

  // 预处理：ignoreEmptyLines 移除空单元（忽略空白模式下仅空白也视为空）
  // 同时记录每个归一化 key 应保留的单元索引：
  //   keepFirst -> 首次出现的索引；keepLast -> 末次出现的索引
  const units: string[] = rawUnits.map((u) => transformUnit(u, opts));
  const keepIndexByKey = new Map<string, number>();
  let filteredCount = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (opts.ignoreEmptyLines && u.length === 0) {
      continue;
    }
    filteredCount++;
    const key = normalizeKey(u, opts);
    if (opts.keepLast || !keepIndexByKey.has(key)) {
      keepIndexByKey.set(key, i);
    }
  }

  // 按原始顺序输出应保留的单元
  const resultUnits = Array.from(keepIndexByKey.values())
    .sort((a, b) => a - b)
    .map((i) => units[i]);
  const resultText = resultUnits.join(sep);

  // 构建每行的命运（与原始 split 行一一对应），供 UI 渲染 diff
  const keptSet = new Set(keepIndexByKey.values());
  const meta: DedupResult['units'] = rawUnits.map((raw, i) => {
    if (opts.ignoreEmptyLines && units[i].length === 0) {
      return { index: i, text: raw, action: 'empty-filtered' as const };
    }
    if (keptSet.has(i)) {
      return { index: i, text: raw, action: 'kept' as const };
    }
    return { index: i, text: raw, action: 'removed' as const };
  });

  return {
    resultText,
    stats: {
      removed: filteredCount - resultUnits.length,
      remaining: resultUnits.length,
    },
    units: meta,
  };
}
