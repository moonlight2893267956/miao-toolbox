/**
 * 文章难度量化。
 *
 * ── 口径演进（实测数据，不是推测）──
 *
 * 最初想用「字等级（一级/二级/三级字）」，后发现两件事：
 *
 * 1. chars.json 第3 位 `simplifiedLevel` **不是字等级**，而是**简码等级**
 *    （`lookup.ts:27`：0 = 无简码，1/2/3 = 一/二/三级简码）。码表里
 *    根本没有「常用字等级」字段。
 * 2. 改用「全码长度」当难度信号，**实测不成立** —— 18 篇文章的平均码长
 *    是 入门 3.64 / 进阶 3.68 / 挑战 3.68，4 键字占比 63.8% / 68.4% / 68.1%，
 *    三个档位几乎重合。五笔 86 本来就以 3~4 键为主（字根拆分 + 识别码），
 *    连最浅的文章也有 64% 的 4 键字，所以码长只反映「五笔有多长」，
 *    不反映「这篇文章有多难」。
 *
 * 最终采用两个**实测能分开档位**的信号：
 *
 * - **常用度位置**（meanRankPercentile）：码表 entries 的数组顺序即常用度降序
 *   （依据 `lookup.ts:202` 的注释）。`CharMap` 由 `buildCharMap` 按同一顺序
 *   插入，因此直接用 `charMap.keys()` 的迭代序号就是排名，无需改任何签名。
 *   实测分档均值：入门 6.9% / 进阶 8.6% / 挑战 10.6%。
 * - **缺码字数**：码表里查不到的字在练习时会被跳过，破坏打字节奏。
 *   实测只有 art-5 有 2 个（它用了 `——`，落在 General Punctuation 区）。
 *
 * 注意：常用度位置**有档位重叠**（进阶 art-14 的 6.6% 低于入门 art-7 的 9.3%），
 * 所以它只能当「越界 sanity 检查」，不能当分类器 —— 档位仍由人工判断。
 *
 * ── 与 tokenizer 严格同口径 ──
 *
 * 直接复用 `tokenizeArticle` 的分词结果做聚合，不另写一套分类。
 * 否则会出现「分析说这个字可打、练习时却渲染成跳过态」这类难排查的偏差。
 */

import { tokenizeArticle } from './articleTokenizer';
import type { CharMap } from './code';

/** 常用度分位 ≥ 此值算「生僻字」（码表后一半） */
const RARE_THRESHOLD = 0.5;

/**
 * CharMap → 字 → 常用度排名（0 起）。
 *
 * 用 WeakMap 按 CharMap 实例缓存：18 篇文章共用同一个 CharMap，
 * 不缓存的话每次分析都要重建 1.2 万条索引。
 */
const rankCache = new WeakMap<CharMap, Map<string, number>>();

function rankOf(charMap: CharMap): Map<string, number> {
  const cached = rankCache.get(charMap);
  if (cached) return cached;

  const ranks = new Map<string, number>();
  let i = 0;
  for (const char of charMap.keys()) {
    ranks.set(char, i);
    i += 1;
  }
  rankCache.set(charMap, ranks);
  return ranks;
}

export interface ArticleAnalysis {
  /** 全部字符数（含标点与空白） */
  totalChars: number;
  /** 可打字数：练习里真正要敲的字 */
  codableChars: number;
  /** 缺码字数：码表里查不到，练习中会被跳过 */
  uncodableChars: number;
  /** 总击键数：所有可打字的编码长度之和 */
  totalKeys: number;
  /** 平均码长（保留 2 位小数） */
  avgCodeLen: number;
  /** 码长分布：下标 0~3 对应 1~4 键字的数量 */
  codeLenCount: [number, number, number, number];
  /** 有简码的字数 */
  simplifiedChars: number;
  /** 常用度平均分位（0~1），越小越常用 */
  meanRankPercentile: number;
  /** 生僻字（常用度分位 ≥ 0.5）数量 */
  rareCharCount: number;
  /** 4 键字（最难打的一批）去重后的字符 */
  longCodeChars: string[];
  /** 生僻字去重后的字符 */
  rareCharList: string[];
  /** 缺码字去重后的字符 */
  uncodableCharList: string[];
  /** 4 键字占比 */
  hardRatio: number;
  /** 缺码字数 / 可打字数 */
  uncodableRatio: number;
}

/** 空分析结果：text 为空或全部不可打时返回，保证字段永远有值 */
function emptyAnalysis(): ArticleAnalysis {
  return {
    totalChars: 0,
    codableChars: 0,
    uncodableChars: 0,
    totalKeys: 0,
    avgCodeLen: 0,
    codeLenCount: [0, 0, 0, 0],
    simplifiedChars: 0,
    meanRankPercentile: 0,
    rareCharCount: 0,
    longCodeChars: [],
    rareCharList: [],
    uncodableCharList: [],
    hardRatio: 0,
    uncodableRatio: 0,
  };
}

/**
 * 统计一篇文章的打字难度。
 *
 * 复杂度 O(字数)：分词一遍 + 查表一遍（排名表按 CharMap 实例缓存）。
 * 18 篇合计几千次查表，只在选择界面挂载时跑一次，不进入渲染热路径。
 */
export function analyzeArticle(text: string, charMap: CharMap): ArticleAnalysis {
  if (!text) return emptyAnalysis();

  const tokens = tokenizeArticle(text, charMap);
  const ranks = rankOf(charMap);
  const tableSize = Math.max(1, ranks.size);

  const result = emptyAnalysis();
  result.totalChars = tokens.length;

  // 去重用 Set 判重，但用数组保序 —— 徽标里要按出现顺序提示用户
  const longCodeSeen = new Set<string>();
  const rareSeen = new Set<string>();
  const uncodableSeen = new Set<string>();
  let percentileSum = 0;

  for (const token of tokens) {
    if (token.kind === 'uncodable') {
      result.uncodableChars += 1;
      if (!uncodableSeen.has(token.char)) {
        uncodableSeen.add(token.char);
        result.uncodableCharList.push(token.char);
      }
      continue;
    }

    if (token.kind !== 'char') continue;

    result.codableChars += 1;
    const entry = charMap.get(token.char);
    const code = token.code ?? entry?.code ?? '';
    const len = Math.min(4, Math.max(1, code.length));
    result.totalKeys += len;
    result.codeLenCount[len - 1] += 1;

    if (entry?.simplifiedCode) result.simplifiedChars += 1;

    // 4 键字：击键量最大的一批
    if (len >= 4 && !longCodeSeen.has(token.char)) {
      longCodeSeen.add(token.char);
      result.longCodeChars.push(token.char);
    }

    // 常用度分位
    const rank = ranks.get(token.char);
    if (rank !== undefined) {
      const p = rank / tableSize;
      percentileSum += p;
      if (p >= RARE_THRESHOLD && !rareSeen.has(token.char)) {
        rareSeen.add(token.char);
        result.rareCharList.push(token.char);
      }
    }
  }

  result.meanRankPercentile =
    result.codableChars > 0
      ? Math.round((percentileSum / result.codableChars) * 1000) / 1000
      : 0;
  result.rareCharCount = result.rareCharList.length;
  result.avgCodeLen =
    result.codableChars > 0
      ? Math.round((result.totalKeys / result.codableChars) * 100) / 100
      : 0;
  result.hardRatio =
    result.codableChars > 0 ? result.codeLenCount[3] / result.codableChars : 0;
  result.uncodableRatio =
    result.codableChars > 0 ? result.uncodableChars / result.codableChars : 0;

  return result;
}

/**
 * 把analysis 压成人类可读的难度标签，给选择界面的徽标用。
 *
 * 只在真的有落差时才提示，避免每篇文章都挂两个标签变成噪声。
 *
 * 阈值来自实测分布（生僻字数：入门 2~5、进阶 4~10、挑战 6~10）：
 * 取 8 是因为 3 会让 18 篇里有 15 篇挂上徽标 —— 全都挂等于没挂。
 * 现在入门档一个都不挂，进阶只有最难的 1~2 篇挂，挑战 3~4 篇挂。
 *
 * 不用「长码字占比」：实测所有档位都在 50%~81%，挂了等于每篇都挂。
 */
export function formatAnalysisTags(analysis: ArticleAnalysis): string[] {
  const tags: string[] = [];
  if (analysis.uncodableChars > 0) {
    tags.push(`${analysis.uncodableChars} 字缺码`);
  }
  if (analysis.rareCharCount >= 8) {
    tags.push(`${analysis.rareCharCount} 个生僻字`);
  }
  return tags;
}