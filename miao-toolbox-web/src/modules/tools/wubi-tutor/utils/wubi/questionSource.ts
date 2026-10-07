/**
 * 题源抽象接口与实现
 *
 * 不同练习模式（键位/字根/单字/简码/词组/文章）实现各自的 QuestionSource，
 * 会话状态机不关心题目内容的差异。
 */

import {
  WUBI_KEYS,
  getKeysByZone,
  type WubiKey,
  type WubiZone,
  type Radical,
} from '../../data/radicals';
import type { CharMap, PhraseMap } from './code';
import { tokenizeArticle, type ArticleToken } from './articleTokenizer';
import { createRng, type Rng } from './rng';

// ─── 类型定义 ────────────────────────────────────────────

export type PracticeMode =
  | 'key-drill'
  | 'radical-identify'
  | 'radical-sequence'
  | 'char-code'
  | 'simplified-code'
  | 'phrase-code'
  | 'article';

export interface QuestionState {
  index: number;
  total: number | null;
  internal: unknown;
}

export interface Question {
  id: string;
  mode: PracticeMode;
  prompt: string;
  answerKeys: string[];
  altAnswers?: string[][];
  hint?: string;
  /** 字根反向模式的选项（4 选 1） */
  choices?: string[];
  /** 文章模式的分词结果 */
  tokens?: ArticleToken[];
  /**
   * 本题包含多少个**待输入的汉字**。
   *
   * 这是所有「以字为单位」指标的根基（累计字数 / 字每分钟 / 通关字数）：
   * - 单字、简码：1
   * - 词组：词组长度（2~6）
   * - 文章：整篇的可打字数
   * - **键位、字根类：0** —— 这些练习不涉及汉字，不该被算进字数
   *
   * 此前统计层拿 `completedCount`（题数）当字数，于是词组少算 2~6 倍、
   * 键位/字根练习则虚增（一个字没打却"累计几百字"）。
   *
   * 为 0 时统计层会回退到「按题计」，见 `session.computeSessionResult`。
   */
  charCount?: number;
}

export interface QuestionSource {
  id: string;
  mode: PracticeMode;
  finite: boolean;
  init: () => QuestionState;
  /**
   * 取下一题。
   *
   * !! 必须是同步的 !!
   * 会话状态机（session.ts）在按键回调里同步调用本方法，并把返回值直接
   * 存进 `currentQuestion`。若某个题源返回 Promise，它会被当作题目对象
   * 存下来，导致后续所有取值在运行时崩 —— 而类型系统原本也不拦，
   * 因为「Promise 也是对象」。
   *
   * 需要异步数据的题源请在 `init` 阶段预取，`next` 只做缓存读取。
   */
  next: (state: QuestionState) => Question;
}

// ─── 工具函数 ────────────────────────────────────────────

/** 简码等级 → 中文标签 */
const LEVEL_LABEL: Record<number, string> = { 1: '一级', 2: '二级', 3: '三级' };

/**
 * 从数组中随机取一个未被使用的索引，用完则重置。
 *
 * `rng` 默认是 `Math.random`；传入种子发生器即可让整轮题序可复现 ——
 * 这是「刷新后接着上一轮继续」的基础（见 `utils/wubi/rng.ts`）。
 */
function pickUnused(poolLength: number, used: Set<number>, rng: Rng = Math.random): number {
  const available: number[] = [];
  for (let i = 0; i < poolLength; i++) {
    if (!used.has(i)) available.push(i);
  }
  const list = available.length > 0 ? available : Array.from({ length: poolLength }, (_, i) => i);
  const idx = list[Math.floor(rng() * list.length)];
  used.add(idx);
  if (used.size >= poolLength) used.clear();
  return idx;
}

/** 洗牌（Fisher-Yates），返回新数组。`rng` 同上。 */
function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 由配置里的 seed 造随机数发生器。
 *
 * 未传 seed（复习页、每日计划等一次性入口）则回落到 `Math.random`，
 * 这些场景不需要复现题序，也就没必要引入种子概念。
 */
function rngFor(config: { seed?: number }): Rng {
  return config.seed === undefined ? Math.random : createRng(config.seed);
}

// ═══════════════════════════════════════════════════════
// 题源：key-drill（键位热身）
// ═══════════════════════════════════════════════════════

export interface KeyDrillConfig {
  scope: 'all' | 'zone';
  zone?: WubiZone;
  count: number | null;
  /** 本轮题序种子：传入可复现题序（中断恢复用），不传则每次新题序 */
  seed?: number;
}

export function createKeyDrillSource(config: KeyDrillConfig): QuestionSource {
  // 每次构造只建一次：反复调用 rngFor 会每次拿到新序列，种子就失效了
  // 每次 init() 都重置回种子起点；理由见 rng.ts 顶部说明
  let rng = rngFor(config);
  const keys: WubiKey[] = config.scope === 'zone' && config.zone
    ? getKeysByZone(config.zone).map((m) => m.key)
    : WUBI_KEYS.map((m) => m.key);

  return {
    id: 'key-drill',
    mode: 'key-drill',
    finite: config.count !== null,
    init: () => {
      rng = rngFor(config);
      return { index: 0, total: config.count, internal: { keys, used: new Set<number>() } };
    },
    next: (state) => {
      const internal = state.internal as { keys: WubiKey[]; used: Set<number> };
      const idx = pickUnused(internal.keys.length, internal.used, rng);
      const key = internal.keys[idx];
      const keyMeta = WUBI_KEYS.find((m) => m.key === key)!;

      return {
        id: `kd-${state.index}`,
        mode: 'key-drill',
        prompt: key.toUpperCase(),
        answerKeys: [key],
        // 键位练习不产生汉字
        charCount: 0,
        hint: `${keyMeta.keyNameChar} · ${keyMeta.finger}`,
      };
    },
  };
}

// ═══════════════════════════════════════════════════════
// 题源：radical-identify（字根定位：正向 + 反向）
// ═══════════════════════════════════════════════════════

export interface RadicalIdentifyConfig {
  /** 'forward' 看字根按键位 | 'backward' 看键位选字根 */
  direction: 'forward' | 'backward';
  scope: 'all' | 'key' | 'zone';
  key?: WubiKey;
  zone?: WubiZone;
  /**
   * 限定字根来源为这些键（优先级高于 scope）。
   *
   * 关卡用：传「已学键」而不是只有本关的键 —— 否则每题的答案都是同一个
   * 字母（学 G 关时 20 题全按 G），辨识练习退化成「按同一个键」。
   */
  keys?: WubiKey[];
  count: number | null;
  /** 本轮题序种子：传入可复现题序（中断恢复用），不传则每次新题序 */
  seed?: number;
}

export function createRadicalIdentifySource(config: RadicalIdentifyConfig): QuestionSource {
  // 每次构造只建一次：反复调用 rngFor 会每次拿到新序列，种子就失效了
  // 每次 init() 都重置回种子起点；理由见 rng.ts 顶部说明
  let rng = rngFor(config);
  // 收集候选字根（含所属键）
  let pool: { radical: Radical; key: WubiKey }[] = [];

  if (config.keys && config.keys.length > 0) {
    const allowed = new Set<WubiKey>(config.keys);
    for (const meta of WUBI_KEYS) {
      if (!allowed.has(meta.key)) continue;
      pool.push(...meta.radicals.map((r) => ({ radical: r, key: meta.key })));
    }
  } else if (config.scope === 'key' && config.key) {
    const meta = WUBI_KEYS.find((m) => m.key === config.key);
    if (meta) pool = meta.radicals.map((r) => ({ radical: r, key: meta.key }));
  } else if (config.scope === 'zone' && config.zone) {
    for (const meta of getKeysByZone(config.zone)) {
      pool.push(...meta.radicals.map((r) => ({ radical: r, key: meta.key })));
    }
  } else {
    for (const meta of WUBI_KEYS) {
      pool.push(...meta.radicals.map((r) => ({ radical: r, key: meta.key })));
    }
  }

  return {
    id: 'radical-identify',
    mode: 'radical-identify',
    finite: config.count !== null,
    init: () => {
      rng = rngFor(config);
      return { index: 0, total: config.count, internal: { pool, used: new Set<number>() } };
    },
    next: (state) => {
      const internal = state.internal as { pool: typeof pool; used: Set<number> };
      const idx = pickUnused(internal.pool.length, internal.used, rng);
      const { radical, key } = internal.pool[idx];
      const keyMeta = WUBI_KEYS.find((m) => m.key === key)!;

      if (config.direction === 'forward') {
        // 正向：显示字根 → 按键位
        return {
          id: `ri-f-${state.index}`,
          mode: 'radical-identify',
          prompt: radical.glyph,
          answerKeys: [key],
          // 字根认知不产生汉字（字的部件 ≠ 字）
          charCount: 0,
          hint: `${radical.name} · ${keyMeta.mnemonic}`,
        };
      }

      // 反向：显示键位 → 4 选 1 选字根
      const correct = radical.glyph;
      const wrongPool = internal.pool
        .filter((p) => p.radical.glyph !== correct)
        .map((p) => p.radical.glyph);
      // 去重并取 3 个干扰项
      const distractors = shuffle(Array.from(new Set(wrongPool)), rng).slice(0, 3);
      const choices = shuffle([correct, ...distractors], rng);

      return {
        id: `ri-b-${state.index}`,
        mode: 'radical-identify',
        prompt: key.toUpperCase(),
        answerKeys: [key],
        charCount: 0,
        hint: keyMeta.mnemonic,
        choices,
      };
    },
  };
}

// ═══════════════════════════════════════════════════════
// 题源：radical-sequence（字根序列输入）
// ═══════════════════════════════════════════════════════

export interface RadicalSequenceConfig {
  count: number | null;
  /** 每题的序列长度范围 */
  minLen?: number;
  maxLen?: number;
  /** 限定字根来源的键位（关卡练习用） */
  keys?: WubiKey[];
  /** 本轮题序种子：传入可复现题序（中断恢复用），不传则每次新题序 */
  seed?: number;
}

export function createRadicalSequenceSource(config: RadicalSequenceConfig): QuestionSource {
  // 每次构造只建一次：反复调用 rngFor 会每次拿到新序列，种子就失效了
  // 每次 init() 都重置回种子起点；理由见 rng.ts 顶部说明
  let rng = rngFor(config);
  const minLen = config.minLen ?? 3;
  const maxLen = config.maxLen ?? 6;
  // 限定键位时只从这些键的字根中抽取
  const pool = config.keys
    ? WUBI_KEYS.filter((m) => config.keys!.includes(m.key))
    : WUBI_KEYS;

  return {
    id: 'radical-sequence',
    mode: 'radical-sequence',
    finite: config.count !== null,
    init: () => {
      rng = rngFor(config);
      return { index: 0, total: config.count, internal: {} };
    },
    next: (state) => {
      const len = minLen + Math.floor(rng() * (maxLen - minLen + 1));
      const picked: { glyph: string; key: WubiKey }[] = [];

      for (let i = 0; i < len; i++) {
        const keyMeta = pool[Math.floor(rng() * pool.length)];
        const radical = keyMeta.radicals[Math.floor(rng() * keyMeta.radicals.length)];
        picked.push({ glyph: radical.glyph, key: keyMeta.key });
      }

      return {
        id: `rs-${state.index}`,
        mode: 'radical-sequence',
        prompt: picked.map((p) => p.glyph).join(' '),
        answerKeys: picked.map((p) => p.key),
        charCount: 0,
        hint: `${len} 个字根`,
      };
    },
  };
}

// ═══════════════════════════════════════════════════════
// 题源：radical-code（字根编码，关卡「字根编码」环节）
// ═══════════════════════════════════════════════════════

export interface RadicalCodeConfig {
  /** 限定字根来源的键位（关卡内传本关的键） */
  keys: WubiKey[];
  count: number | null;
  /** 本轮题序种子：传入可复现题序（中断恢复用），不传则每次新题序 */
  seed?: number;
}

/**
 * 字根编码练习：看字根 → 打出它的**完整五笔编码**。
 *
 * 这才是「字根输入」环节该有的样子：
 * - 键名字（王）→ 连击 4 次：`gggg`
 * - 成字字根（五）→ 键名码 + 首笔 + 次笔 + 末笔：`gghg`
 * - 笔画不足的（一）→ 末位补 `l`：`ggll`
 *
 * 为什么不复用 `createRadicalSequenceSource`：
 * 那个题源的答案是「字根所属键的序列」。关卡内只看一个键时，
 * 每个字根的 key 都是同一个字母 → **答案恒为 `gggg`**，
 * 而题面显示「王 青 戋 五」。用户按 4 次 G 就过关，
 * 等于在教「所有 G 键字根都打 G」这条**错误规则**。
 */
export function createRadicalCodeSource(
  config: RadicalCodeConfig,
  charMap: CharMap,
): QuestionSource {
  // 每次构造只建一次：反复调用 rngFor 会每次拿到新序列，种子就失效了
  // 每次 init() 都重置回种子起点；理由见 rng.ts 顶部说明
  let rng = rngFor(config);
  const allowed = new Set<WubiKey>(config.keys);

  interface Candidate {
    glyph: string;
    name: string;
    code: string;
    key: WubiKey;
    isKeyName: boolean;
  }

  const candidates: Candidate[] = [];

  for (const meta of WUBI_KEYS) {
    if (!allowed.has(meta.key)) continue;

    for (const radical of meta.radicals) {
      /*
       * 两道过滤，缺一不可：
       * 1. 必须能独立成字（码表里有它的编码）
       * 2. 编码必须符合**成字字根取码规则**
       *
       * 第 2 条用于排除「借某个字代为表示的部件」：
       * G 键的「青头」在数据里记作 glyph '青'，但 青 是 龶+月 的合体字
       * （gef，要用 月(E)、土(F)）—— 让用户打它就会撞上没学过的键。
       * 这类部件只能在「字根认知」环节认键位，无法单独取码。
       */
      const entry = charMap.get(radical.glyph);
      if (!entry) continue;
      if (!isRadicalCode(entry.code, meta.key)) continue;

      candidates.push({
        glyph: radical.glyph,
        name: radical.name,
        code: entry.code,
        key: meta.key,
        isKeyName: radical.keyName === true,
      });
    }
  }

  return {
    id: 'radical-code',
    // 复用 radical-sequence：同为「字根输入」语义，且不涉及汉字
    mode: 'radical-sequence',
    finite: config.count !== null,
    init: () => {
      if (candidates.length === 0) {
        throw new Error('本键没有可独立成字的字根');
      }
      rng = rngFor(config);
      return { index: 0, total: config.count, internal: { candidates, used: new Set<number>() } };
    },
    next: (state) => {
      const internal = state.internal as { candidates: Candidate[]; used: Set<number> };
      const idx = pickUnused(internal.candidates.length, internal.used, rng);
      const item = internal.candidates[idx];

      return {
        id: `rc-${state.index}`,
        mode: 'radical-sequence',
        prompt: item.glyph,
        answerKeys: item.code.split(''),
        // 字根不是「字」，不计入字数统计
        charCount: 0,
        // 明示取码规则：这是本环节真正要教会的东西
        hint: item.isKeyName
          ? `键名字：连击 ${item.key.toUpperCase()} 4 次`
          : `成字字根：键名码 + 首笔 + 次笔 + 末笔`,
      };
    },
  };
}

// ─── 键位 → 含该键码的单字索引（关卡单字练习用） ──────────

const keyCharIndexCache = new WeakMap<CharMap, Map<string, string[]>>();

/**
 * 构建「键位 → 编码包含该键位的单字」索引。
 *
 * 用于关卡「单字练习」环节：取该键参与的汉字。
 * 按 charMap 实例缓存，避免重复遍历 1.3 万条数据。
 */
export function getKeyCharIndex(charMap: CharMap): Map<string, string[]> {
  const cached = keyCharIndexCache.get(charMap);
  if (cached) return cached;

  const index = new Map<string, string[]>();
  for (const entry of charMap.values()) {
    // 同一字对同一个键只记一次
    for (const k of new Set(entry.code.split(''))) {
      const list = index.get(k);
      if (list) list.push(entry.char);
      else index.set(k, [entry.char]);
    }
  }

  keyCharIndexCache.set(charMap, index);
  return index;
}

// ─── 关卡单字池 ──────────────────────────────────────────

/**
 * 是否是可正常练习的汉字：BMP 内的 CJK 统一表意文字。
 *
 * 码表里有 1848 条（14.8%）是扩展区 / 兼容汉字（如 䜣、㣺、𩂊）：
 * - 一部分是代理对（JS 里 `length === 2`），会破坏「一个字 = 一个字符」的假设
 * - 字形极生僻，练了没有实用价值
 */
export function isPracticableChar(char: string): boolean {
  return /^[\u4e00-\u9fff]$/.test(char);
}

/** 关卡单字池上限（按常用度取前 N 个） */
const LESSON_POOL_MAX = 40;

/**
 * 「成字字根取码规则」会用到的键：
 * 五个区内首笔键 —— 一(G)、丨(H)、丿(T)、丶(Y)、乙(N)，
 * 以及笔画不足时的**补位键 L**（一 = GGLL 的两个 L）。
 */
const RADICAL_RULE_KEYS: ReadonlySet<WubiKey> = new Set<WubiKey>([
  'g', 'h', 't', 'y', 'n', 'l',
]);

/**
 * 该字的编码是否符合「成字字根取码规则」。
 *
 * 用来把**真正的成字字根**与「只是借某个字代为表示的部件」区分开：
 * G 键的「青头」在字根数据里记作 glyph `'青'`，但 青 是 龶+月 的合体字
 * （编码 `gef`，用到 E/F 键），并不是成字字根 ——
 * 把它放进 G 关的练习，用户就会撞上还没学的 月(E)、土(F)。
 *
 * 成字字根的编码只由「本键 + 五个首笔键 + 补位键 L」构成。
 */
function isRadicalCode(code: string, lessonKey: WubiKey): boolean {
  if (code[0] !== lessonKey) return false;
  return [...code].every((c) => RADICAL_RULE_KEYS.has(c as WubiKey));
}

/**
 * 关卡「单字练习」该练哪些字。
 *
 * 两部分取并集：
 *
 * **① 本关字根中能独立成字者**（无条件收录）
 *    这就是本关要掌握的内容本身（G 关 = 王 五 青 戋 一）。
 *    即使它的编码要用到还没学的键（如 五 = gghg 用到 h）也必须练 ——
 *    「成字字根取码规则」本来就依赖五笔区首键，属于该规则的固有部分。
 *
 * **② 只用已学键就能打出的字**（首码须为本键）
 *    随课程推进逐步放开。
 *
 * 此前用的是 `getKeyCharIndex`（「编码含该键」），有两个致命问题：
 * - 会把 `g` 当**末笔识别码**的字也算进来，那些字压根不含 G 键字根
 * - 完全不看用户学没学过其余字根 —— 第一关（只学 G）就丢出
 *   「是」(jghu)、「有」(def)、「心」(nyny) 这类字
 *
 * 注意**不要**把「五个笔画键 (g/h/t/y/n)」整体当作前置已学：
 * 那会连这些键上的真实字根一起放进来（G 关出现「政」= 一+止+攵+丶，
 * 而 止(H)、攵(T) 还没学）。② 只认已学键，才能保证零未学字根。
 */
export function getLessonCharPool(
  lessonKey: WubiKey,
  learnedKeys: ReadonlySet<WubiKey>,
  charMap: CharMap,
): string[] {
  const pool: string[] = [];
  const seen = new Set<string>();

  // ① 本关的字根本身（能独立成字、且确实符合成字字根取码规则的）
  const meta = WUBI_KEYS.find((m) => m.key === lessonKey);
  for (const radical of meta?.radicals ?? []) {
    const glyph = radical.glyph;
    if (seen.has(glyph)) continue;
    if (!isPracticableChar(glyph)) continue;

    const entry = charMap.get(glyph);
    if (!entry) continue;
    // 过滤「借字表示的部件」：青不是 G 的成字字根（它要用到 E/F 键）
    if (!isRadicalCode(entry.code, lessonKey)) continue;

    seen.add(glyph);
    pool.push(glyph);
  }

  // ② 其余只用已学键（含本关）就能打出的字
  const learned = new Set<WubiKey>([...learnedKeys, lessonKey]);

  for (const [char, entry] of charMap) {
    if (seen.has(char)) continue;
    if (!isPracticableChar(char)) continue;
    if (entry.code[0] !== lessonKey) continue;
    if (![...entry.code].every((k) => learned.has(k as WubiKey))) continue;

    seen.add(char);
    pool.push(char);
    if (pool.length >= LESSON_POOL_MAX) break;
  }

  return pool;
}

// ═══════════════════════════════════════════════════════
// 题源：char-code（单字练习）
// ═══════════════════════════════════════════════════════

export interface CharCodeConfig {
  count: number | null;
  chars?: string[];
  /** 本轮题序种子：传入可复现题序（中断恢复用），不传则每次新题序 */
  seed?: number;
}

export function createCharCodeSource(config: CharCodeConfig, charMap: CharMap): QuestionSource {
  // 每次构造只建一次：反复调用 rngFor 会每次拿到新序列，种子就失效了
  // 每次 init() 都重置回种子起点；理由见 rng.ts 顶部说明
  let rng = rngFor(config);
  const availableChars = config.chars
    ? config.chars.filter((c) => charMap.has(c))
    // 默认池过滤扩展区 / 兼容汉字：生僻，且部分为代理对
    : Array.from(charMap.keys()).filter(isPracticableChar);

  return {
    id: 'char-code',
    mode: 'char-code',
    finite: config.count !== null,
    init: () => {
      rng = rngFor(config);
      return { index: 0, total: config.count, internal: { chars: availableChars, used: new Set<number>() } };
    },
    next: (state) => {
      const internal = state.internal as { chars: string[]; used: Set<number> };

      if (internal.chars.length === 0) {
        throw new Error('No available chars');
      }

      const idx = pickUnused(internal.chars.length, internal.used, rng);
      const char = internal.chars[idx];
      const charCode = charMap.get(char)!;

      const question: Question = {
        id: `cc-${state.index}`,
        mode: 'char-code',
        prompt: char,
        answerKeys: charCode.code.split(''),
        charCount: 1,
      };

      // 有简码时：全码与简码都判对，并提示更短的编码
      if (charCode.simplifiedCode) {
        question.altAnswers = [charCode.simplifiedCode.split('')];
        // 必须写明「按空格」：只打简码不会自动上屏（见 session.confirmShortAnswer）
        question.hint =
          `有${LEVEL_LABEL[charCode.simplifiedLevel] ?? ''}简码：`
          + `${charCode.simplifiedCode}（打完按空格出字）`;
      }

      return question;
    },
  };
}

// ═══════════════════════════════════════════════════════
// 题源：simplified-code（简码专项）
// ═══════════════════════════════════════════════════════

export interface SimplifiedCodeConfig {
  /** 简码级别：1 | 2 | 3 | 'all' */
  level: 1 | 2 | 3 | 'all';
  count: number | null;
  /** 本轮题序种子：传入可复现题序（中断恢复用），不传则每次新题序 */
  seed?: number;
}

export function createSimplifiedCodeSource(config: SimplifiedCodeConfig, charMap: CharMap): QuestionSource {
  // 每次构造只建一次：反复调用 rngFor 会每次拿到新序列，种子就失效了
  // 每次 init() 都重置回种子起点；理由见 rng.ts 顶部说明
  let rng = rngFor(config);
  // 筛选出指定级别的简码字
  // 注意：code 是「全码」（通常 4 位），简码在 simplifiedCode 字段。
  // 旧实现误判为 c.code.length < 4，会漏掉全码为 4 位的大多数简码字（含全部一级简码）。
  const candidates = Array.from(charMap.values()).filter((c) => {
    if (config.level === 'all') return c.simplifiedCode !== null;
    return c.simplifiedLevel === config.level;
  });

  return {
    id: 'simplified-code',
    mode: 'simplified-code',
    finite: config.count !== null,
    init: () => {
      rng = rngFor(config);
      return { index: 0, total: config.count, internal: { candidates, used: new Set<number>() } };
    },
    next: (state) => {
      const internal = state.internal as { candidates: typeof candidates; used: Set<number> };

      if (internal.candidates.length === 0) {
        throw new Error('No simplified code chars available');
      }

      const idx = pickUnused(internal.candidates.length, internal.used, rng);
      const entry = internal.candidates[idx];

      // 使用简码编码作答（无简码字段时回退到全码）
      const answerCode = entry.simplifiedCode ?? entry.code;

      const question: Question = {
        id: `sc-${state.index}`,
        mode: 'simplified-code',
        prompt: entry.char,
        answerKeys: answerCode.split(''),
        charCount: 1,
        hint: `${LEVEL_LABEL[entry.simplifiedLevel] ?? ''}简码：${answerCode}`,
        // 打出全码也判对
        altAnswers: [entry.code.split('')],
      };

      return question;
    },
  };
}

// ═══════════════════════════════════════════════════════
// 题源：phrase-code（词组练习）
// ═══════════════════════════════════════════════════════

export interface PhraseCodeConfig {
  /** 词组长度：2 | 3 | 4 | 'multi'(≥5) */
  length: 2 | 3 | 4 | 'multi';
  count: number | null;
  /** 本轮题序种子：传入可复现题序（中断恢复用），不传则每次新题序 */
  seed?: number;
}

export function createPhraseCodeSource(config: PhraseCodeConfig, phraseMap: PhraseMap): QuestionSource {
  // 每次构造只建一次：反复调用 rngFor 会每次拿到新序列，种子就失效了
  // 每次 init() 都重置回种子起点；理由见 rng.ts 顶部说明
  let rng = rngFor(config);
  const candidates = Array.from(phraseMap.entries()).filter(([phrase]) => {
    if (config.length === 'multi') return phrase.length >= 5;
    return phrase.length === config.length;
  });

  return {
    id: 'phrase-code',
    mode: 'phrase-code',
    finite: config.count !== null,
    init: () => {
      rng = rngFor(config);
      return { index: 0, total: config.count, internal: { candidates, used: new Set<number>() } };
    },
    next: (state) => {
      const internal = state.internal as { candidates: typeof candidates; used: Set<number> };

      if (internal.candidates.length === 0) {
        throw new Error('No phrases available for this length');
      }

      const idx = pickUnused(internal.candidates.length, internal.used, rng);
      const [phrase, code] = internal.candidates[idx];

      return {
        id: `pc-${state.index}`,
        mode: 'phrase-code',
        prompt: phrase,
        answerKeys: code.split(''),
        // 一个词组题要打 phrase.length 个字
        charCount: phrase.length,
        hint: `${phrase.length} 字词组`,
      };
    },
  };
}

// ═══════════════════════════════════════════════════════
// 题源：article（文章 / 自定义文本）
// ═══════════════════════════════════════════════════════

export interface ArticleConfig {
  /** 内置文章 ID 或自定义文本 */
  scope: 'builtin' | 'custom';
  /** 文本内容 */
  text: string;
  /** 是否跳过无编码字符 */
  skipUncodable: boolean;
}

export function createArticleSource(config: ArticleConfig, charMap: CharMap): QuestionSource {
  const tokens = tokenizeArticle(config.text, charMap);

  // 可打序列（有编码的字符）
  const playableTokens = config.skipUncodable
    ? tokens.filter((t) => t.isCodable)
    : tokens;

  return {
    id: 'article',
    mode: 'article',
    finite: true,
    // 整篇文章 = 一道题，故 total 恒为 1（不是字数！）
    init: () => ({ index: 0, total: 1, internal: { tokens, playableTokens, cursor: 0 } }),
    next: (state) => {
      const internal = state.internal as { tokens: ArticleToken[]; playableTokens: ArticleToken[] };

      if (internal.playableTokens.length === 0) {
        throw new Error('Empty article');
      }

      // 文章模式：整篇作为一道大题，answerKeys 为全部可打字符的编码序列
      const allKeys: string[] = [];
      for (const token of internal.playableTokens) {
        const entry = charMap.get(token.char);
        if (entry) {
          allKeys.push(...entry.code.split(''));
        }
      }

      return {
        id: `art-${state.index}`,
        mode: 'article',
        prompt: config.text.slice(0, 50) + (config.text.length > 50 ? '…' : ''),
        answerKeys: allKeys,
        // 整篇作为一道大题，字数是可打字数（此前被当成 1 个字）
        charCount: internal.playableTokens.length,
        tokens: internal.tokens,
        hint: `共 ${internal.playableTokens.length} 字`,
      };
    },
  };
}
