/**
 * 键位字根表完整性单测
 *
 * G-1 验收：本表是拆字逆推算法的字典，准确性是整个模块的基石。
 * 这些测试在每次提交时运行，确保：
 * - 25 键齐全、顺序正确
 * - 每键必有键名字与口诀
 * - 字形无跨键重复
 * - 指法枚举合法
 */

import { describe, it, expect } from 'vitest';
import {
  WUBI_KEYS,
  RADICAL_INDEX,
  ZONE_LABELS,
  getKeyMeta,
  getKeysByZone,
  isKeyNameChar,
  isSelfRadical,
  findRadicalKey,
  radicalsLabel,
  type WubiKey,
  type WubiZone,
  type WubiFinger,
} from './radicals';

// 25 键的物理排列顺序
const EXPECTED_KEY_ORDER: WubiKey[] = [
  'g', 'f', 'd', 's', 'a',
  'h', 'j', 'k', 'l', 'm',
  't', 'r', 'e', 'w', 'q',
  'y', 'u', 'i', 'o', 'p',
  'n', 'b', 'v', 'c', 'x',
];

// 5 区各包含 5 键
const ZONE_KEYS: Record<WubiZone, WubiKey[]> = {
  heng: ['g', 'f', 'd', 's', 'a'],
  shu:  ['h', 'j', 'k', 'l', 'm'],
  pie:  ['t', 'r', 'e', 'w', 'q'],
  na:   ['y', 'u', 'i', 'o', 'p'],
  zhe:  ['n', 'b', 'v', 'c', 'x'],
};

// 合法指法枚举
const VALID_FINGERS: WubiFinger[] = [
  'l-pinky', 'l-ring', 'l-middle', 'l-index',
  'r-index', 'r-middle', 'r-ring', 'r-pinky',
];

describe('WUBI_KEYS 完整性', () => {
  it('应有 25 个键', () => {
    expect(WUBI_KEYS).toHaveLength(25);
  });

  it('键位顺序应为键盘物理排列 GFDSA/HJKLM/TREWQ/YUIOP/NBVCX', () => {
    const actualOrder = WUBI_KEYS.map((m) => m.key);
    expect(actualOrder).toEqual(EXPECTED_KEY_ORDER);
  });

  it('每键的 zone 归属正确（5 区各 5 键）', () => {
    for (const zone of Object.keys(ZONE_KEYS) as WubiZone[]) {
      const zoneKeys = getKeysByZone(zone);
      expect(zoneKeys).toHaveLength(5);
      expect(zoneKeys.map((m) => m.key).sort()).toEqual([...ZONE_KEYS[zone]].sort());
    }
  });

  it('每键必有键名字且唯一', () => {
    const keyNameChars = WUBI_KEYS.map((m) => m.keyNameChar);
    expect(new Set(keyNameChars).size).toBe(25); // 25 个全不重复
    for (const meta of WUBI_KEYS) {
      expect(meta.keyNameChar).toBeTruthy();
      expect(meta.keyNameChar.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('每键必有助记口诀', () => {
    for (const meta of WUBI_KEYS) {
      expect(meta.mnemonic).toBeTruthy();
      expect(meta.mnemonic.length).toBeGreaterThan(0);
    }
  });

  it('每键的 finger 为合法枚举值', () => {
    for (const meta of WUBI_KEYS) {
      expect(VALID_FINGERS).toContain(meta.finger);
    }
  });

  it('每键至少有 2 个字根（含键名字）', () => {
    for (const meta of WUBI_KEYS) {
      expect(meta.radicals.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('每键的 radicals 中必有且仅有一个 keyName: true 的字根', () => {
    for (const meta of WUBI_KEYS) {
      const keyNameRadicals = meta.radicals.filter((r) => r.keyName);
      expect(keyNameRadicals).toHaveLength(1);
      // 键名字根的 glyph 应与 keyNameChar 一致
      expect(keyNameRadicals[0].glyph).toBe(meta.keyNameChar);
    }
  });

  it('每条 radical 的 glyph 非空且 name 非空', () => {
    for (const meta of WUBI_KEYS) {
      for (const r of meta.radicals) {
        expect(r.glyph.length).toBeGreaterThan(0);
        expect(r.name.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('RADICAL_INDEX 完整性', () => {
  it('字形不得跨键重复（同一字形出现在两个键位时应该报错）', () => {
    // RADICAL_INDEX 构建时跳过了重复项，这里检测是否有重复
    const glyphCount = new Map<string, number>();
    for (const meta of WUBI_KEYS) {
      for (const r of meta.radicals) {
        glyphCount.set(r.glyph, (glyphCount.get(r.glyph) ?? 0) + 1);
      }
    }

    const duplicates: string[] = [];
    for (const [glyph, count] of glyphCount) {
      if (count > 1) {
        duplicates.push(`${glyph} (出现 ${count} 次)`);
      }
    }

    // 允许少数已知重复（如 '乃' 同时在 E 和 B 键——86 版字根表的已知情况）
    // 但必须显式记录在此
    const KNOWN_DUPLICATES = ['乃', '匚'];

    const unexpected = duplicates.filter((d) => {
      const glyph = d.split(' ')[0];
      return !KNOWN_DUPLICATES.includes(glyph);
    });

    if (unexpected.length > 0) {
      expect.fail(`发现非预期跨键重复字形: ${unexpected.join(', ')}`);
    }
  });

  /*
   * 字根表完整性（对照标准 86 字根表）。
   *
   * 回归背景：本表曾漏收 12 个常用字根 ——
   *   辶 廴 冖（P）· 阝（B）· 母（X）· 具（H）· 乙（N）· 几（M）
   *   弋（A）· 丬（U）· 丿 攵（T）
   * 其中「具 / 母 / 攵 / 乙」是**本表自己的口诀点了名却没收录**。
   *
   * 漏收的后果不是「少显示一个字」，而是**拆字演示给出错的答案**：
   *   splitter 把「该键的全部字根」当作候选，辶 不在 P 的字根里，
   *   于是「这」的 P 段只显示「之/宀/礻/衤」——正确字根根本不存在，
   *   用户会以为算法坏了。
   *
   * 注意：这类缺口**现有的覆盖率口径测不出来**。coverage 只统计
   * 「码位对应的键有没有候选」（keys 都有 ≥2 个字根，故恒为 100%），
   * 不检查「正确的那一个字根在不在候选里」。
   */
  const REQUIRED_RADICALS: [WubiKey, string][] = [
    ['p', '辶'], ['p', '廴'], ['p', '冖'],
    ['b', '阝'], ['x', '母'], ['h', '具'], ['n', '乙'], ['m', '几'],
    ['a', '弋'], ['u', '丬'], ['t', '丿'], ['t', '攵'],
  ];

  it('标准表里的常用字根一个都不缺，且落在正确的键上', () => {
    const wrong = REQUIRED_RADICALS
      .filter(([key, glyph]) => RADICAL_INDEX.get(glyph) !== key)
      .map(([key, glyph]) =>
        `${glyph} 应在 ${key.toUpperCase()} 键（实际：${RADICAL_INDEX.get(glyph) ?? '缺失'}）`);

    expect(wrong).toEqual([]);
  });

  it('RADICAL_INDEX 能反查每个字根所在键位', () => {
    // 取一个已知字根验证
    expect(RADICAL_INDEX.get('王')).toBe('g');
    expect(RADICAL_INDEX.get('日')).toBe('j');
    expect(RADICAL_INDEX.get('口')).toBe('k');
    expect(RADICAL_INDEX.get('金')).toBe('q');
    expect(RADICAL_INDEX.get('之')).toBe('p');
  });
});

describe('便捷查询函数', () => {
  it('getKeyMeta 返回正确元数据', () => {
    const g = getKeyMeta('g');
    expect(g).toBeDefined();
    expect(g!.keyNameChar).toBe('王');
    expect(g!.zone).toBe('heng');
  });

  it('getKeyMeta 对无效键返回 undefined', () => {
    expect(getKeyMeta('z' as WubiKey)).toBeUndefined();
  });

  it('getKeysByZone 返回正确的区', () => {
    const heng = getKeysByZone('heng');
    expect(heng).toHaveLength(5);
    expect(heng.map((m) => m.key)).toEqual(['g', 'f', 'd', 's', 'a']);
  });

  it('isKeyNameChar 正确识别键名字', () => {
    expect(isKeyNameChar('王')).toBe(true);
    expect(isKeyNameChar('日')).toBe(true);
    expect(isKeyNameChar('口')).toBe(true);
    expect(isKeyNameChar('啊')).toBe(false);
    expect(isKeyNameChar('')).toBe(false);
  });

  it('isSelfRadical 正确识别成字字根', () => {
    // '五' 是 G 键的成字字根（非键名字）
    expect(isSelfRadical('五')).toBe(true);
    // '王' 是键名字，不算成字字根
    expect(isSelfRadical('王')).toBe(false);
    // '啊' 不是字根
    expect(isSelfRadical('啊')).toBe(false);
  });

  it('findRadicalKey 返回字根所在键', () => {
    expect(findRadicalKey('王')).toBe('g');
    expect(findRadicalKey('五')).toBe('g');
    expect(findRadicalKey('日')).toBe('j');
    expect(findRadicalKey('口')).toBe('k');
    expect(findRadicalKey('啊')).toBeUndefined();
  });

  it('ZONE_LABELS 5 区标签齐全', () => {
    expect(Object.keys(ZONE_LABELS)).toHaveLength(5);
    expect(ZONE_LABELS.heng).toContain('横');
    expect(ZONE_LABELS.shu).toContain('竖');
    expect(ZONE_LABELS.pie).toContain('撇');
    expect(ZONE_LABELS.na).toContain('捺');
    expect(ZONE_LABELS.zhe).toContain('折');
  });
});

/*
 * 字根展示的完整性。
 *
 * 回归背景：键盘图曾用 `radicals.slice(0, 6)` 硬截断（再叠加 CSS 的
 * `white-space: nowrap` + `text-overflow: ellipsis`），F 键第 7 个字根
 * 「雨」根本显示不出来 —— 用户反馈「这种展示形式没法看到全部的字根」。
 */
describe('radicalsLabel — 字根展示不得截断', () => {
  it('包含该键的全部字根', () => {
    const missing: string[] = [];

    for (const meta of WUBI_KEYS) {
      const label = radicalsLabel(meta.radicals);
      for (const r of meta.radicals) {
        if (!label.includes(r.glyph)) missing.push(`${meta.key}/${r.glyph}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('不出现省略号（截断的标志）', () => {
    for (const meta of WUBI_KEYS) {
      expect(radicalsLabel(meta.radicals)).not.toContain('…');
    }
  });

  it('F 键的 7 个字根全部可见（回归：曾被截掉「雨」）', () => {
    const f = WUBI_KEYS.find((m) => m.key === 'f')!;
    const label = radicalsLabel(f.radicals);

    expect(f.radicals).toHaveLength(7);
    expect(label).toContain('雨');
  });

  it('每键字根数不超过格子能容纳的行数（当前上限 8 个 = 2 行）', () => {
    /*
     * 键盘格子的字根串是**换行**显示的（不截断），所以真正的约束是「行数」：
     *   58px 宽 / 9px 字号（练习页键盘）→ 每行约 4 个 → 8 个 = 2 行
     *   84px 宽 / 10px 字号（字根图）  → 每行约 6 个 → 8 个 = 2 行
     * 即 8 个与 7 个的格子高度相同。超过 8 个就必须先复查
     * `.wt-vkeyboard__key` / `.wt-radical-chart__key` 的 min-height
     * 能否容纳第 3 行，再上调这个上限。
     */
    for (const meta of WUBI_KEYS) {
      expect(meta.radicals.length, `${meta.key} 字根过少`).toBeGreaterThanOrEqual(2);
      expect(meta.radicals.length, `${meta.key} 字根过多，需复查格子高度`).toBeLessThanOrEqual(8);
    }
  });
});
