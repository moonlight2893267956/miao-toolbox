/**
 * 汉字 ↔ 编码互查纯函数（Story 5.1）
 *
 * - 正查：字/词 → 编码（含简码标注）
 * - 反查：编码 → 候选字/词（重码按常用度排序）
 * - 归类：区分「字 / 词 / 未收录 / 非法编码」
 *
 * 重码排序依赖 chars.json 的条目顺序 —— 该顺序即常用度降序
 * （如「上的年下网为一中在页首请」）。
 *
 * !! 这个顺序是 build-wubi-tables.mjs 刻意保留的 !!
 * 脚本曾按拼音排序输出，静默丢掉了常用度信息；若后续有人为了
 * 「便于 diff」重新加回排序，反查重码会变成无意义顺序。
 */

import type { CharCode, CharMap, PhraseMap } from './code';

// ─── 类型 ────────────────────────────────────────────────

/** 正查结果：一个可查询项 */
export interface LookupEntry {
  text: string;
  /** 'char' = 单字，'phrase' = 词组 */
  kind: 'char' | 'phrase';
  /** 全码 */
  code: string;
  /** 简码等级：0 = 无简码，1~3 = 一/二/三级简码 */
  simplifiedLevel: 0 | 1 | 2 | 3;
  /** 简码编码（无简码时为 null） */
  simplifiedCode: string | null;
}

/** 反查候选项 */
export interface Candidate {
  text: string;
  kind: 'char' | 'phrase';
  code: string;
  /**
   * 命中方式。
   *
   * `full` = 输入的就是它的全码；`simplified` = 输入的是它的简码。
   * 必须在界面上说清：输入 `g` 会出现「一」，但「一」的全码是 ggll ——
   * 不标注的话，学员会以为「一」的编码就是 g。
   */
  match: 'full' | 'simplified';
  /** 命中简码时的等级（仅 `match === 'simplified'` 时有值） */
  simplifiedLevel?: 1 | 2 | 3;
  /** 该编码对应的候选总数（> 1 即重码） */
  duplicates: number;
  /** 在一组重码中的序号（从 1 起） */
  rank: number;
}

export type LookupKind = 'empty' | 'code' | 'text' | 'invalid';

export interface LookupResult {
  kind: LookupKind;
  /** 正查结果（输入为汉字/词组时） */
  entries: LookupEntry[];
  /** 反查候选（输入为编码时） */
  candidates: Candidate[];
  /** 未识别字符（正查时用于提示「未收录」） */
  missing: string[];
  /** 非法输入的说明 */
  error: string | null;
}

/**
 * 编码输入合法性：a~y，1~4 位。
 *
 * 带 `i` 标志：用户从别处粘贴的编码常是大写（VBG），
 * 不加标志会被判为「非法编码」并提示「只用 a~y」——
 * 而 V/B/G 恰恰都在 a~y 内，提示与事实矛盾。
 */
const CODE_RE = /^[a-y]{1,4}$/i;

// ─── 输入归类 ────────────────────────────────────────────

/**
 * 判定输入类型。
 * 空串 → empty；纯 a~y 且长度 1~4 → code；
 * 含 a~y 之外的拉丁字母或数字 → invalid（明确报错而非静默无结果）。
 */
export function classifyInput(raw: string): LookupKind {
  const input = raw.trim();
  if (!input) return 'empty';

  if (CODE_RE.test(input)) return 'code';

  // 含拉丁字母但不符合编码规则 → 非法
  if (/[a-zA-Z0-9]/.test(input)) return 'invalid';

  return 'text';
}

/** 非法编码的提示文案 */
export function describeInvalidInput(raw: string): string {
  const input = raw.trim();
  if (!input) return '';
  // 纯拉丁字母但不符合编码规则 → 直接指出编码规则
  if (/^[a-z]+$/i.test(input)) {
    return `「${input}」不是合法编码：五笔编码只用 a~y，且不超过 4 位`;
  }
  return `「${input}」既不是汉字，也不是合法编码（编码为 1~4 位 a~y）`;
}

// ─── 正查 ────────────────────────────────────────────────

/** 单字 → LookupEntry */
function charEntry(entry: CharCode): LookupEntry {
  return {
    text: entry.char,
    kind: 'char',
    code: entry.code,
    simplifiedLevel: entry.simplifiedLevel,
    simplifiedCode: entry.simplifiedCode,
  };
}

/**
 * 词组匹配的最长长度。
 *
 * !! 值必须覆盖词表里最长的词，否则那些词**永远查不到** !!
 *
 * 词组表按长度分三个桶，`phrases-4plus` 里除四字词外还含 5~8 字词共 67 条
 * （5 字 41 / 6 字 14 / 7 字 11 / 8 字 1）。这里曾经写死 4，于是
 * 「中华人民共和国」这类词在正查里被切成「中华 + 人民 + 共和国」——
 * 用户看到的不是词表里那个词，而是一串巧合切分。
 *
 * 4 → 8 的代价：每个起点多 4 次 Map 查询（不是字符串比较），
 * 百字文本也就多几百次 O(1) 查询，可以忽略。
 */
export const MAX_PHRASE_LEN = 8;

/**
 * 正查：把输入文本逐字/逐词拆开查询。
 *
 * 优先按「整词」匹配（长词优先），未命中再退化为单字，
 * 因此「中国人」会先试 3 字词，再试 2 字词，最后逐字。
 *
 * @param maxPhraseLen 最长词组长度；默认覆盖词表全文（见 `MAX_PHRASE_LEN`）
 */
export function lookupText(
  text: string,
  charMap: CharMap,
  phraseMap: PhraseMap | null,
  maxPhraseLen: number = MAX_PHRASE_LEN,
): { entries: LookupEntry[]; missing: string[] } {
  const chars = Array.from(text.trim());
  const entries: LookupEntry[] = [];
  const missing: string[] = [];

  let i = 0;
  while (i < chars.length) {
    // 跳过空白与标点（不报未收录，避免噪音）
    if (/[\s\p{P}]/u.test(chars[i])) {
      i += 1;
      continue;
    }

    let matched = false;

    // 长词优先：从最长可能长度往下试
    if (phraseMap) {
      const maxLen = Math.min(maxPhraseLen, chars.length - i);
      for (let len = maxLen; len >= 2; len--) {
        const word = chars.slice(i, i + len).join('');
        const code = phraseMap.get(word);
        if (code) {
          entries.push({
            text: word, kind: 'phrase', code,
            simplifiedLevel: 0, simplifiedCode: null,
          });
          i += len;
          matched = true;
          break;
        }
      }
    }

    if (matched) continue;

    const single = chars[i];
    const entry = charMap.get(single);
    if (entry) {
      entries.push(charEntry(entry));
    } else {
      missing.push(single);
    }
    i += 1;
  }

  return { entries, missing };
}

// ─── 反查 ────────────────────────────────────────────────

/**
 * 反查：编码 → 候选字/词。
 *
 * 重码（同一编码对应多个字）按「常用度」排序：
 * chars.json 的数组顺序即常用度序，因此遍历 Map 时命中顺序天然就是
 * 常用度降序 —— 不要改用 sort，那会打乱这个隐含契约。
 *
 * 同时匹配「该编码」与「以该编码为简码」的字：
 * 输入 `g` 既要返回一级简码「一」，也要返回全码为 g 的字。
 */
interface IndexHit {
  text: string;
  /** 该字的全码（即使命中的是它的简码） */
  code: string;
  /** 该条是挂在简码键下时的等级（挂在全码键下时不设） */
  simplifiedLevel?: 1 | 2 | 3;
}

/*
 * 倒排索引缓存：编码 → 候选列表。
 *
 * 没有索引时每次反查都要全表扫描（实测 13000 字 + 35000 词 ≈ 2.2ms/次），
 * 而反查是**逐键触发**的，这笔开销纯属浪费。
 *
 * 用 WeakMap 以 Map 实例为键：码表重新加载后旧索引会被自动回收，
 * 不会跨数据集串味。
 */
const charIndexCache = new WeakMap<CharMap, Map<string, IndexHit[]>>();
const phraseIndexCache = new WeakMap<PhraseMap, Map<string, IndexHit[]>>();

function pushHit(index: Map<string, IndexHit[]>, key: string, hit: IndexHit): void {
  const list = index.get(key);
  if (list) list.push(hit);
  else index.set(key, [hit]);
}

function getReverseIndex(charMap: CharMap): Map<string, IndexHit[]> {
  const cached = charIndexCache.get(charMap);
  if (cached) return cached;

  const index = new Map<string, IndexHit[]>();
  // 按 charMap 的插入顺序遍历 —— 即常用度降序，候选列表天然有序
  for (const entry of charMap.values()) {
    const hit: IndexHit = { text: entry.char, code: entry.code };
    pushHit(index, entry.code, hit);
    if (entry.simplifiedCode && entry.simplifiedCode !== entry.code) {
      const level = entry.simplifiedLevel;
      pushHit(index, entry.simplifiedCode, {
        ...hit,
        // simplifiedLevel 为 0（无简码）时不该走到这里；保险起见做一次收窄
        ...(level >= 1 && level <= 3 ? { simplifiedLevel: level as 1 | 2 | 3 } : {}),
      });
    }
  }

  charIndexCache.set(charMap, index);
  return index;
}

function getPhraseIndex(phraseMap: PhraseMap): Map<string, IndexHit[]> {
  const cached = phraseIndexCache.get(phraseMap);
  if (cached) return cached;

  const index = new Map<string, IndexHit[]>();
  for (const [word, code] of phraseMap) {
    pushHit(index, code, { text: word, code });
  }

  phraseIndexCache.set(phraseMap, index);
  return index;
}

export function lookupByCode(
  code: string,
  charMap: CharMap,
  phraseMap: PhraseMap | null,
  limit = 60,
): Candidate[] {
  const target = code.trim().toLowerCase();
  if (!CODE_RE.test(target)) return [];

  const hits: {
    text: string;
    kind: 'char' | 'phrase';
    code: string;
    simplifiedLevel?: 1 | 2 | 3;
  }[] = [];

  for (const hit of getReverseIndex(charMap).get(target) ?? []) {
    hits.push({
      text: hit.text, kind: 'char', code: hit.code,
      simplifiedLevel: hit.simplifiedLevel,
    });
  }

  if (phraseMap) {
    // 词组表只收全码，不存在简码命中
    for (const hit of getPhraseIndex(phraseMap).get(target) ?? []) {
      hits.push({ text: hit.text, kind: 'phrase', code: hit.code });
    }
  }

  const duplicates = hits.length;

  return hits.slice(0, Math.max(0, limit)).map((hit, index) => ({
    ...hit,
    // 输入的就是全码 → full；否则是它的简码被命中
    match: hit.code === target ? 'full' : 'simplified',
    duplicates,
    rank: index + 1,
  }));
}

// ─── 统一入口 ────────────────────────────────────────────

/**
 * 互查主入口：根据输入类型自动选择正查 / 反查。
 *
 * @param raw 用户输入
 * @param charMap 字编码映射（必需）
 * @param phraseMap 词组映射（null = phrases chunk 未就绪，正查会退化为逐字）
 */
export function lookup(
  raw: string,
  charMap: CharMap,
  phraseMap: PhraseMap | null,
): LookupResult {
  const kind = classifyInput(raw);

  if (kind === 'empty') {
    return { kind, entries: [], candidates: [], missing: [], error: null };
  }

  if (kind === 'invalid') {
    return {
      kind, entries: [], candidates: [], missing: [],
      error: describeInvalidInput(raw),
    };
  }

  if (kind === 'code') {
    return {
      kind,
      entries: [],
      candidates: lookupByCode(raw, charMap, phraseMap),
      missing: [],
      error: null,
    };
  }

  const { entries, missing } = lookupText(raw, charMap, phraseMap);
  return { kind, entries, candidates: [], missing, error: null };
}

/** 简码等级标签 */
export const SIMPLIFIED_LABELS: Record<1 | 2 | 3, string> = {
  1: '一级简码',
  2: '二级简码',
  3: '三级简码',
};

/** 复制到剪贴板的文本（全码优先，附带简码提示） */
export function formatForClipboard(entry: LookupEntry): string {
  return entry.code;
}

/**
 * 复制**整段**输入的全部编码，按切分顺序直接拼接。
 *
 * 不插分隔符：它的用途是「查完就照着打一遍」，而字母之间插任何符号都会
 * 变成必须删掉的多余字符。词组按其 4 码整体拼入，与逐字输入的手感一致。
 */
export function formatAllForClipboard(entries: LookupEntry[]): string {
  return entries.map((e) => e.code).join('');
}