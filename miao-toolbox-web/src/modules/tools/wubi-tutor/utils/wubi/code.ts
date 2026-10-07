/**
 * 五笔编码解析纯函数
 *
 * 全部为纯函数（无副作用、无 IO、不读全局状态）。
 * 练习判定、简码提示与识别码标注都基于本模块。
 */

import {
  isKeyNameChar,
  isSelfRadical,
  type WubiKey,
} from '../../data/radicals';

// ─── 类型定义 ────────────────────────────────────────────

export interface CharCode {
  /** 汉字 */
  char: string;
  /** 全码（1~4 位小写字母） */
  code: string;
  /** 简码等级：0=无 1=一级 2=二级 3=三级 */
  simplifiedLevel: 0 | 1 | 2 | 3;
  /** 简码编码（长度 < 4；无简码时为 null） */
  simplifiedCode: string | null;
}

/** 字 → CharCode 的快速查找映射 */
export type CharMap = Map<string, CharCode>;

/** 词组 → 编码的映射 */
export type PhraseMap = Map<string, string>;

// ─── 识别码类型 ──────────────────────────────────────────

/** 末笔笔画 */
export type LastStroke = 'heng' | 'shu' | 'pie' | 'na' | 'zhe';

/** 字型结构 */
export type CharStructure = 'left-right' | 'up-down' | 'misc';

/** 识别码推导结果 */
export interface IdentificationCode {
  /** 末笔笔画 */
  lastStroke: LastStroke;
  /** 字型结构 */
  structure: CharStructure;
  /** 推导出的识别码键位 */
  key: WubiKey;
}

// ─── 识别码交叉表 ────────────────────────────────────────
//
// 识别码 = 末笔笔画 × 字型结构 → 对应区+位的键
//
//          左右(1)    上下(2)    杂合(3)
// 横(1)      g          f          d
// 竖(2)      h          j          k
// 撇(3)      t          r          e
// 捺(4)      y          u          i
// 折(5)      n          b          v
//

const IDENTIFICATION_TABLE: Record<LastStroke, Record<CharStructure, WubiKey>> = {
  heng: { 'left-right': 'g', 'up-down': 'f', 'misc': 'd' },
  shu:  { 'left-right': 'h', 'up-down': 'j', 'misc': 'k' },
  pie:  { 'left-right': 't', 'up-down': 'r', 'misc': 'e' },
  na:   { 'left-right': 'y', 'up-down': 'u', 'misc': 'i' },
  zhe:  { 'left-right': 'n', 'up-down': 'b', 'misc': 'v' },
};

// ─── 核心函数 ────────────────────────────────────────────

/**
 * 查询某字的全码与简码等级。
 * 未收录返回 null。
 */
export function parseChar(char: string, charMap: CharMap): CharCode | null {
  if (!char || char.length === 0) return null;
  return charMap.get(char) ?? null;
}

/**
 * 获取某字的简码信息。
 *
 * 若该字的编码长度 < 4，则该编码本身就是简码：
 * - 长度 1 → 一级简码（一键 + 空格）
 * - 长度 2 → 二级简码
 * - 长度 3 → 三级简码
 *
 * 返回该字的全码（若简码短于 4 位，全码需要从编码补齐——但码表中
 * 每个字只存一条编码，所以这里以码表中的编码为准）。
 *
 * @returns 简码信息对象，若未收录返回 null
 */
export function getSimplifiedCodes(char: string, charMap: CharMap): {
  char: string;
  fullCode: string;
  simplifiedLevel: 0 | 1 | 2 | 3;
  /** 若存在简码，该字段为简码编码（长度 < 4） */
  simplifiedCode: string | null;
} | null {
  const entry = parseChar(char, charMap);
  if (!entry) return null;

  return {
    char,
    fullCode: entry.code,
    simplifiedLevel: entry.simplifiedLevel,
    simplifiedCode: entry.simplifiedCode,
  };
}

/**
 * 判定某字是否为键名字。
 * 键名字 = 该键连击 4 次所得的整字（如 g → 王）。
 */
export function checkKeyNameChar(char: string): boolean {
  return isKeyNameChar(char);
}

/**
 * 判定某字是否为成字字根。
 * 成字字根 = 在字根表中但非键名字的字根（如 g 键的「五」）。
 * 成字字根的编码规则：键名码 + 首笔 + 次笔 + 末笔。
 */
export function checkSelfRadical(char: string): boolean {
  return isSelfRadical(char);
}

/**
 * 推导识别码。
 *
 * 识别码 = 末笔笔画 × 字型结构。
 * 当无法判定末笔或字型时返回 null。
 *
 * @param lastStroke 末笔笔画
 * @param structure  字型结构
 * @returns 识别码信息，无法判定时返回 null
 */
export function deriveIdentificationCode(
  lastStroke: LastStroke | null,
  structure: CharStructure | null,
): IdentificationCode | null {
  if (!lastStroke || !structure) return null;

  const key = IDENTIFICATION_TABLE[lastStroke]?.[structure];
  if (!key) return null;

  return { lastStroke, structure, key };
}

/**
 * 从任意文本中提取「可打键序列」。
 *
 * 跳过无编码字符（标点、数字、生僻字等），
 * 返回可打字符列表与被跳过字符列表。
 *
 * @param text 原始文本
 * @param charMap 字编码映射
 * @returns 可打字符序列与跳过字符信息
 */
export function stripNonCodeChars(
  text: string,
  charMap: CharMap,
): {
  /** 可打字符列表（每个元素是一个汉字） */
  codeable: string[];
  /** 被跳过的字符及其位置 */
  skipped: { char: string; index: number }[];
  /** 总字符数（含跳过） */
  total: number;
} {
  const codeable: string[] = [];
  const skipped: { char: string; index: number }[] = [];
  const chars = Array.from(text); // 正确处理多字节字符

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (charMap.has(ch)) {
      codeable.push(ch);
    } else {
      skipped.push({ char: ch, index: i });
    }
  }

  return { codeable, skipped, total: chars.length };
}

/**
 * 从 chars.json 的三元组数组构建 CharMap。
 *
 * @param entries 三元组数组 [["啊","kbsk",0], ...]
 * @returns CharMap 实例
 */
export function buildCharMap(entries: [string, string, number, string?][]): CharMap {
  const map: CharMap = new Map();
  for (const [char, code, level, simplifiedCode] of entries) {
    map.set(char, {
      char,
      code,
      simplifiedLevel: level as 0 | 1 | 2 | 3,
      simplifiedCode: simplifiedCode ?? null,
    });
  }
  return map;
}

/**
 * 从 phrases.json 的二元组数组构建 PhraseMap。
 *
 * @param entries 二元组数组 [["中国","khlg"], ...]
 * @returns PhraseMap 实例
 */
export function buildPhraseMap(entries: [string, string][]): PhraseMap {
  return new Map(entries);
}

/**
 * 将 event.code（KeyboardEvent.code）映射为五笔键位字母。
 *
 * @param code KeyboardEvent.code 值（如 'KeyA'、'Space'、'Digit1'）
 * @returns 五笔键位字母（a~y），或 null（非编码键）
 */
export function mapKeyCodeToWubi(code: string): string | null {
  // 字母键：KeyA → a
  if (/^Key([A-Y])$/.test(code)) {
    return code.replace('Key', '').toLowerCase();
  }
  // Z 键不用于编码（在五笔中用于万能学习键，v1 暂不支持）
  if (code === 'KeyZ') {
    return null;
  }
  // 空格用于简码确认
  if (code === 'Space') {
    return ' '; // 用空格字符表示
  }
  return null;
}

/**
 * 判定一次按键是否为正确的下一键。
 *
 * @param expectedKey 期望的键位字母
 * @param actualKey 实际按下的键位字母
 * @param isSpaceConfirm 是否为空格确认（简码场景）
 * @returns 是否正确
 */
export function isCorrectKey(
  expectedKey: string,
  actualKey: string,
  isSpaceConfirm = false,
): boolean {
  if (isSpaceConfirm && actualKey === ' ') return true;
  return expectedKey === actualKey;
}
