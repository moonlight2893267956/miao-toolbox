/**
 * 拆字逆推算法
 *
 * 输入：汉字 + 编码（来自 chars.json）
 * 输出：SplitResult — 该字拆成哪些字根、各在哪个键
 *
 * 算法核心思路：
 * 对编码的每一位，在该键的字根集合中筛选候选：
 * 1. glyph === char（该字根本身就是这个字，如键名字/成字字根）
 * 2. char.includes(glyph)（字形包含）
 * 3. 变体映射命中（如 月→⺼、氵→水）
 *
 * 三态判定：
 * - 任一位无候选 → unsupported
 * - 所有位唯一 → resolved
 * - 其余 → ambiguous
 *
 * 性能：单字计算为 O(4 × ~8) 常量级；配 LRU 缓存（上限 2000）。
 */

import {
  getKeyMeta,
  isKeyNameChar,
  isSelfRadical,
  type WubiKey,
  type Radical,
  type WubiKeyMeta,
} from '../../data/radicals';
import { type CharCode } from './code';

// ─── 类型定义 ────────────────────────────────────────────

/**
 * 拆分状态。
 *
 * ⚠️ 语义已修正（此前 resolved 的含义是「自动推出了唯一拆分」，
 * 而那个能力在当前数据下并不存在，导致 99.8% 的字被判 unsupported）：
 *
 * - `resolved`    —— 每一位都能确定。只发生在**取码规则可推**的字上
 *                    （键名字 / 成字字根），或字根本身就等于该字。
 * - `ambiguous`   —— 每一位都能给出候选字根，但需要**对照字形**挑选。
 *                    这是绝大多数字的情形。
 * - `unsupported` —— 某一位的键上没有字根（数据缺失，正常不应发生）。
 */
export type SplitStatus = 'resolved' | 'ambiguous' | 'unsupported';

export type SplitNoteType =
  | 'keyName'             // 键名字（连击该键 4 次）
  | 'selfRadical'         // 成字字根（键名码 + 首笔 + 次笔 + 末笔）
  | 'identificationCode'  // 需要识别码（末笔 + 字型结构）
  | 'simplified';         // 存在简码

export interface SplitNote {
  type: SplitNoteType;
  message: string;
}

export interface SplitSegment {
  /** 编码该位对应的键位 */
  key: WubiKey;
  /**
   * 该键上的**全部字根**，供用户对照字形挑选。
   * 补位位为空数组（补位键 L 不代表任何字根）。
   */
  candidates: Radical[];
  /**
   * 能**确定**这一位用的就是该字根时给出它，否则 null。
   *
   * 只有「字根本身就等于该字」能给出 —— 原因见 `findCertainRadical` 注释：
   * 字形包含关系对汉字不成立，无法据此自动挑出唯一字根。
   */
  certain: Radical | null;
  /**
   * 该位在**取码规则**中的角色（仅键名字 / 成字字根有值）：
   * 键名码 / 连击 / 首笔 / 次笔 / 末笔 / 补位。
   */
  role?: string;
}

export interface SplitResult {
  /** 被拆分的汉字 */
  char: string;
  /** 全码 */
  code: string;
  /** 拆分状态 */
  status: SplitStatus;
  /** 逐位拆分段 */
  segments: SplitSegment[];
  /** 标注信息 */
  notes: SplitNote[];
}

// ─── LRU 缓存 ────────────────────────────────────────────

const LRU_MAX = 2000;
const splitCache = new Map<string, SplitResult>();

/**
 * 清空缓存（测试用）。
 */
export function clearSplitCache(): void {
  splitCache.clear();
}

// ─── 核心算法 ────────────────────────────────────────────

/**
 * 对单个字执行拆字逆推。
 *
 * @param char 汉字
 * @param code 该字的全码（1~4 位小写字母）
 * @param keyMetos 可选：字根表（默认用 WUBI_KEYS）
 * @returns SplitResult
 */
export function splitChar(
  char: string,
  code: string,
): SplitResult {
  const cacheKey = `${char}:${code}`;
  const cached = splitCache.get(cacheKey);

  if (cached) {
    /*
     * 命中即移到队尾（删后重插，Map 保持插入顺序）。
     * 少了这一步就退化成 FIFO：热门字反复命中却仍按「最早写入」
     * 的顺序被淘汰，「LRU 上限 2000」名不副实。
     */
    splitCache.delete(cacheKey);
    splitCache.set(cacheKey, cached);
    return cached;
  }

  const result = computeSplit(char, code);
  splitCache.set(cacheKey, result);

  // 淘汰队首（最久未使用）
  if (splitCache.size > LRU_MAX) {
    const oldest = splitCache.keys().next().value;
    if (oldest !== undefined) splitCache.delete(oldest);
  }

  return result;
}

/**
 * 实际计算拆字结果（不含缓存）。
 */
function computeSplit(char: string, code: string): SplitResult {
  const segments: SplitSegment[] = [];
  const notes: SplitNote[] = [];

  // 标注：键名字
  if (isKeyNameChar(char)) {
    notes.push({
      type: 'keyName',
      message: `「${char}」是键名字，连击该键 4 次即可输入`,
    });
  }

  // 标注：成字字根
  if (isSelfRadical(char)) {
    notes.push({
      type: 'selfRadical',
      message: `「${char}」是成字字根，编码规则：键名码 + 首笔 + 次笔 + 末笔`,
    });
  }

  // 标注：简码（编码长度 < 4）
  if (code.length < 4) {
    const levelText = code.length === 1 ? '一级' : code.length === 2 ? '二级' : '三级';
    notes.push({
      type: 'simplified',
      message: `此字有${levelText}简码：${code}（打完按空格出字；打全码也判对）`,
    });
  }

  // 逐位展开：给出键位、该键的全部候选字根、以及规则角色
  const codeChars = code.split('');
  const roles = radicalCodeRoles(char, code);
  const isRuleBased = roles !== null;
  let hasEmpty = false;
  let hasUncertain = false;

  for (let i = 0; i < codeChars.length; i++) {
    const codeChar = codeChars[i];
    const keyMeta = getKeyMeta(codeChar as WubiKey);

    if (!keyMeta) {
      // 编码位不是合法键位（理论上不会发生，因为码表已校验）
      segments.push({ key: codeChar as WubiKey, candidates: [], certain: null });
      hasEmpty = true;
      continue;
    }

    const role = roles?.[i];
    const isPadding = role === '补位';
    // 补位键 L 不代表任何字根，因此不给候选
    const candidates = isPadding ? [] : keyMeta.radicals;
    const certain = isPadding ? null : findCertainRadical(char, keyMeta);

    if (candidates.length === 0 && !isPadding) hasEmpty = true;
    // 规则字每一位都由规则确定；其余字只在能确定时才算确定
    if (!isRuleBased && certain === null) hasUncertain = true;

    segments.push({ key: codeChar as WubiKey, candidates, certain, role });
  }

  // 标注：识别码（编码为 4 位且最后一位可能需要识别码说明）
  if (code.length === 4 && !isKeyNameChar(char)) {
    // 检查最后一位是否可能是识别码
    // 这里做简化判断：如果前 3 位的字根已能确定字形且最后一位是「补位」性质
    // 完整的识别码判定需要字形结构分析，此处给出提示性标注
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment.candidates.length > 0) {
      // 仅当最后一位的字根不直接出现在字形中时，提示可能是识别码
      const lastCandidatesInChar = lastSegment.candidates.filter(
        (r) => char.includes(r.glyph) || char === r.glyph,
      );
      if (lastCandidatesInChar.length === 0) {
        notes.push({
          type: 'identificationCode',
          message: `末位「${code[code.length - 1]}」可能为识别码（末笔 + 字型结构推导）`,
        });
      }
    }
  }

  // 判定状态
  let status: SplitStatus;
  if (hasEmpty) {
    status = 'unsupported';
  } else if (hasUncertain) {
    status = 'ambiguous';
  } else {
    status = 'resolved';
  }

  return { char, code, status, segments, notes };
}

/**
 * 键名字 / 成字字根的**逐位角色**；不属于这两类时返回 null。
 *
 * 这两类字的编码是**规则生成**的，不是拆出来的，因此每一位都能确定：
 * - 键名字：键名码 + 连击 ×3
 * - 成字字根：键名码 + 首笔 + 次笔 + 末笔
 *
 * 判据：首笔/次笔/末笔只可能是横竖撇捺折（g/h/t/y/n），
 * 所以**第 2 位起出现的 `l` 一定是补位，不是字根** ——
 * `一 = GGLL` 的后两位正因如此被判成「暂不支持」。
 */
function radicalCodeRoles(char: string, code: string): string[] | null {
  if (isKeyNameChar(char)) {
    return code.split('').map((_, i) => (i === 0 ? '键名码' : '连击'));
  }
  if (!isSelfRadical(char)) return null;

  const labels = ['键名码', '首笔', '次笔', '末笔'];
  return code.split('').map((key, i) => {
    if (i > 0 && key === 'l') return '补位';
    return labels[i] ?? '—';
  });
}

/**
 * 某一编码位上**能确定**的字根；确定不了返回 null。
 *
 * ── 为什么不做「自动挑出唯一字根」──
 *
 * 汉字在 Unicode 里是**单个码位**（`'的'.length === 1`），因此
 * `'的'.includes('白')` 恒为 false —— 字形包含关系只在
 * 「字根就是该字本身」时才成立。
 *
 * 旧实现以「字根是否是字形的子串」（含变体映射）为判据去匹配每一位，
 * 结果 12452 个字里只有 25 个（**0.2%**）能推出拆分，其余全部报
 * 「暂不支持」；而验收脚本自己另算一套，恒报 100%，把这个缺陷盖住了。
 *
 * 真正的唯一拆分需要**字根分解表**（`char → 字根序列`），
 * 而上游码表只有 `字\t编码\t词频` 三列，没有这份数据。
 * 因此这里只保留站得住的判据，「每一位是哪个字根」交给用户
 * 对照字形从该键候选里挑选（对照视图）。
 */
function findCertainRadical(char: string, keyMeta: WubiKeyMeta): Radical | null {
  return keyMeta.radicals.find((r) => r.glyph === char) ?? null;
}

/**
 * 获取拆分结果的简短描述（用于 UI 展示）。
 */
export function describeSplit(result: SplitResult): string {
  const { char, code, status, segments } = result;

  const parts = segments.map((seg) => {
    // 规则字：角色（键名码/首笔/补位…）比字根更有信息量
    if (seg.role) {
      const glyph = seg.certain ? `${seg.certain.glyph} ` : '';
      return `${glyph}${seg.key.toUpperCase()}（${seg.role}）`;
    }
    // 能确定的位直接给字根
    if (seg.certain) return seg.certain.glyph;
    // 其余位列出该键候选，供对照字形挑选
    if (seg.candidates.length > 0) {
      return `${seg.key.toUpperCase()} → ${seg.candidates.map((c) => c.glyph).join('/')}`;
    }
    return `${seg.key.toUpperCase()}(?)`;
  });

  const body = `${char} → ${parts.join(' ')} → ${code}`;

  if (status === 'unsupported') {
    return `「${char}」有编码位在对应键上找不到字根，请对照字根表分析。${body}`;
  }
  return status === 'ambiguous' ? `${body}（候选字根，需对照字形确认）` : body;
}

// ─── 批量拆分（覆盖率统计用） ──────────────────────────────

/**
 * 批量拆分结果统计。
 */
export interface SplitCoverage {
  total: number;
  resolved: number;
  ambiguous: number;
  unsupported: number;
  resolvedRate: number;
  ambiguousRate: number;
  unsupportedRate: number;
  /** 不支持的字列表（用于排查与补充） */
  unsupportedChars: string[];
  /** 歧义的字列表 */
  ambiguousChars: string[];
}

/**
 * 对一批字执行拆分并统计覆盖率。
 *
 * @param entries CharCode 列表
 * @returns 覆盖率统计
 */
export function analyzeCoverage(entries: CharCode[]): SplitCoverage {
  let resolved = 0;
  let ambiguous = 0;
  let unsupported = 0;
  const unsupportedChars: string[] = [];
  const ambiguousChars: string[] = [];

  for (const entry of entries) {
    const result = splitChar(entry.char, entry.code);
    if (result.status === 'resolved') {
      resolved++;
    } else if (result.status === 'ambiguous') {
      ambiguous++;
      ambiguousChars.push(entry.char);
    } else {
      unsupported++;
      unsupportedChars.push(entry.char);
    }
  }

  const total = entries.length;
  return {
    total,
    resolved,
    ambiguous,
    unsupported,
    resolvedRate: total > 0 ? resolved / total : 0,
    ambiguousRate: total > 0 ? ambiguous / total : 0,
    unsupportedRate: total > 0 ? unsupported / total : 0,
    unsupportedChars,
    ambiguousChars,
  };
}
