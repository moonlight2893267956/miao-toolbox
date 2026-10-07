import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  classifyInput,
  describeInvalidInput,
  lookupText,
  lookupByCode,
  lookup,
  MAX_PHRASE_LEN,
  formatAllForClipboard,
  formatForClipboard,
} from './lookup';
import { buildCharMap, buildPhraseMap, type CharMap, type PhraseMap } from './code';

/** 测试码表：条目顺序即常用度序 */
const charMap: CharMap = buildCharMap([
  ['一', 'ggll', 1, 'g'],
  ['地', 'fbn', 1, 'f'],
  ['王', 'gggg', 0],
  ['土', 'ffff', 0],
  ['工', 'aaaa', 0],
  ['好', 'vbg', 2, 'vb'],
  ['的', 'rqyy', 1, 'r'],
  ['中', 'khk', 0],
  ['国', 'lgyi', 0],
]);

const phraseMap: PhraseMap = buildPhraseMap([
  ['中国', 'khlg'],
  ['中国人', 'khlw'],
  ['工人', 'aaww'],
]);

// ─── 输入归类 ────────────────────────────────────────────

describe('classifyInput', () => {
  it('空串 / 空白', () => {
    expect(classifyInput('')).toBe('empty');
    expect(classifyInput('   ')).toBe('empty');
  });

  it('合法编码', () => {
    expect(classifyInput('g')).toBe('code');
    expect(classifyInput('ggll')).toBe('code');
    expect(classifyInput(' khlg ')).toBe('code');
  });

  it('超过 4 位或含 z 的编码非法', () => {
    expect(classifyInput('ggllg')).toBe('invalid');
    expect(classifyInput('z')).toBe('invalid');
    expect(classifyInput('gz')).toBe('invalid');
  });

  it('汉字判为文本', () => {
    expect(classifyInput('好')).toBe('text');
    expect(classifyInput('中国人')).toBe('text');
  });

  it('汉字混字母判为非法', () => {
    expect(classifyInput('好a')).toBe('invalid');
  });

  // 回归：粘贴来的编码常是大写，曾被判为「非法」并提示「只用 a~y」
  it('大写编码视为合法（大小写不敏感）', () => {
    expect(classifyInput('VBG')).toBe('code');
    expect(classifyInput('G')).toBe('code');
    expect(classifyInput(' KHLG ')).toBe('code');
  });

  it('含 z 的大写编码仍非法', () => {
    expect(classifyInput('ZZ')).toBe('invalid');
    expect(classifyInput('GZ')).toBe('invalid');
  });
});

describe('describeInvalidInput', () => {
  it('纯字母给出编码规则提示', () => {
    expect(describeInvalidInput('zzz')).toContain('a~y');
  });

  it('混合输入给出通用提示', () => {
    expect(describeInvalidInput('好a')).toContain('既不是汉字');
  });

  it('空串返回空', () => {
    expect(describeInvalidInput('  ')).toBe('');
  });
});

// ─── 正查 ────────────────────────────────────────────────

describe('lookupText', () => {
  it('单字返回全码与简码', () => {
    const { entries } = lookupText('好', charMap, null);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      text: '好', kind: 'char', code: 'vbg',
      simplifiedLevel: 2, simplifiedCode: 'vb',
    });
  });

  it('无简码的字 level 为 0', () => {
    const { entries } = lookupText('王', charMap, null);
    expect(entries[0].simplifiedLevel).toBe(0);
    expect(entries[0].simplifiedCode).toBeNull();
  });

  it('多字逐字返回', () => {
    const { entries } = lookupText('好工', charMap, null);
    expect(entries.map((e) => e.text)).toEqual(['好', '工']);
  });

  it('词组优先于逐字', () => {
    const { entries } = lookupText('中国人', charMap, phraseMap);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ text: '中国人', kind: 'phrase', code: 'khlw' });
  });

  it('长词优先（3 字优先于 2 字）', () => {
    const { entries } = lookupText('中国人', charMap, phraseMap);
    expect(entries[0].text).toBe('中国人');
  });

  it('无词组表时退化为逐字', () => {
    const { entries } = lookupText('中国', charMap, null);
    expect(entries.map((e) => e.text)).toEqual(['中', '国']);
  });

  it('未收录字进 missing，不产生空条目', () => {
    const { entries, missing } = lookupText('好龘', charMap, null);
    expect(entries.map((e) => e.text)).toEqual(['好']);
    expect(missing).toEqual(['龘']);
  });

  it('标点与空白被跳过且不报未收录', () => {
    const { entries, missing } = lookupText('好， 工', charMap, null);
    expect(entries.map((e) => e.text)).toEqual(['好', '工']);
    expect(missing).toEqual([]);
  });

  it('全部未收录', () => {
    const { entries, missing } = lookupText('龘龖', charMap, null);
    expect(entries).toEqual([]);
    expect(missing).toHaveLength(2);
  });
});

// ─── 反查 ────────────────────────────────────────────────

describe('lookupByCode', () => {
  it('按全码反查', () => {
    const candidates = lookupByCode('gggg', charMap, null);
    expect(candidates.map((c) => c.text)).toEqual(['王']);
  });

  it('按简码反查命中该字', () => {
    const candidates = lookupByCode('vb', charMap, null);
    expect(candidates.map((c) => c.text)).toContain('好');
  });

  it('重码按常用度排序并标注总数与序号', () => {
    // g 同时是「一」的简码；再补两个全码为 g 的字，构造重码
    const dupMap = buildCharMap([
      ['一', 'ggll', 1, 'g'],
      ['乙', 'g', 0],
      ['丙', 'g', 0],
    ]);

    const candidates = lookupByCode('g', dupMap, null);
    expect(candidates.map((c) => c.text)).toEqual(['一', '乙', '丙']);
    expect(candidates[0].duplicates).toBe(3);
    expect(candidates.map((c) => c.rank)).toEqual([1, 2, 3]);
  });

  it('唯一命中时 duplicates 为 1', () => {
    expect(lookupByCode('gggg', charMap, null)[0].duplicates).toBe(1);
  });

  it('词组也能反查', () => {
    const candidates = lookupByCode('khlg', charMap, phraseMap);
    expect(candidates[0]).toMatchObject({ text: '中国', kind: 'phrase' });
  });

  it('无命中返回空数组', () => {
    expect(lookupByCode('yyy', charMap, null)).toEqual([]);
  });

  it('非法编码返回空数组', () => {
    expect(lookupByCode('z', charMap, null)).toEqual([]);
    expect(lookupByCode('ggllg', charMap, null)).toEqual([]);
    expect(lookupByCode('', charMap, null)).toEqual([]);
  });

  it('大写编码能反查（大小写不敏感）', () => {
    expect(lookupByCode('VB', charMap, null).map((c) => c.text)).toEqual(['好']);
    expect(lookupByCode('GGGG', charMap, null).map((c) => c.text)).toEqual(['王']);
  });

  it('命中简码时仍返回该字的全码', () => {
    // vb 是「好」的简码，返回的 code 应为全码 vbg
    expect(lookupByCode('vb', charMap, null)[0].code).toBe('vbg');
  });

  it('limit 生效', () => {
    const dupMap = buildCharMap([
      ['一', 'g', 0], ['二', 'g', 0], ['三', 'g', 0], ['四', 'g', 0],
    ]);
    expect(lookupByCode('g', dupMap, null, 2)).toHaveLength(2);
  });
});

// ─── 统一入口 ────────────────────────────────────────────

describe('lookup', () => {
  it('空输入', () => {
    const r = lookup('', charMap, phraseMap);
    expect(r.kind).toBe('empty');
    expect(r.entries).toEqual([]);
    expect(r.candidates).toEqual([]);
  });

  it('非法编码给出 error 且不返回结果', () => {
    const r = lookup('zz', charMap, phraseMap);
    expect(r.kind).toBe('invalid');
    expect(r.error).toBeTruthy();
    expect(r.candidates).toEqual([]);
  });

  it('编码走反查', () => {
    const r = lookup('vb', charMap, phraseMap);
    expect(r.kind).toBe('code');
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.entries).toEqual([]);
  });

  it('汉字走正查', () => {
    const r = lookup('好', charMap, phraseMap);
    expect(r.kind).toBe('text');
    expect(r.entries[0].code).toBe('vbg');
    expect(r.candidates).toEqual([]);
  });

  it('未收录时 missing 非空（供 UI 显示明确提示）', () => {
    const r = lookup('龘', charMap, phraseMap);
    expect(r.entries).toEqual([]);
    expect(r.missing).toEqual(['龘']);
  });
});

describe('formatForClipboard', () => {
  it('返回全码', () => {
    expect(formatForClipboard({
      text: '好', kind: 'char', code: 'vbg',
      simplifiedLevel: 2, simplifiedCode: 'vb',
    })).toBe('vbg');
  });
});

/**
 * 反查候选的命中方式。
 *
 * 回归点：输入 `g` 会出现「一」，但「一」的全码是 ggll ——
 * 此前界面不说明它是靠**简码**命中的，学员会以为「一」的编码就是 g。
 */
describe('反查候选的命中方式', () => {
  it('全码命中标注 full，且不带简码等级', () => {
    const hit = lookupByCode('gggg', charMap, null)[0];
    expect(hit).toMatchObject({ text: '王', match: 'full' });
    expect(hit.simplifiedLevel).toBeUndefined();
  });

  it('简码命中标注 simplified 并带出等级，同时仍返回全码', () => {
    expect(lookupByCode('g', charMap, null)[0]).toMatchObject({
      text: '一', code: 'ggll', match: 'simplified', simplifiedLevel: 1,
    });
  });

  it('同一编码下混合命中时各自标注正确', () => {
    const dupMap = buildCharMap([
      ['一', 'ggll', 1, 'g'],   // 靠一级简码 g 命中
      ['乙', 'g', 0],            // 全码就是 g
    ]);
    const candidates = lookupByCode('g', dupMap, null);

    expect(candidates.map((c) => [c.text, c.match])).toEqual([
      ['一', 'simplified'],
      ['乙', 'full'],
    ]);
  });

  it('词组表只收全码，故词组命中恒为 full', () => {
    expect(lookupByCode('khlg', charMap, phraseMap)[0]).toMatchObject({ match: 'full' });
  });
});

/**
 * 整段编码的复制文本。
 *
 * 用途是「查完照着打一遍」，所以不插分隔符 ——
 * 字母之间任何符号都会变成必须手工删掉的多余字符。
 */
describe('整段编码格式化', () => {
  it('按切分顺序拼接编码，不加分隔符', () => {
    const { entries } = lookupText('中国的', charMap, phraseMap);
    // 长词优先：中国（词组 khlg）+ 的（rqyy）
    expect(entries.map((e) => e.text)).toEqual(['中国', '的']);
    expect(formatAllForClipboard(entries)).toBe('khlgrqyy');
  });

  it('与逐条 formatForClipboard 的拼接结果一致', () => {
    const { entries } = lookupText('中国的', charMap, phraseMap);
    expect(formatAllForClipboard(entries))
      .toBe(entries.map((e) => formatForClipboard(e)).join(''));
  });

  it('空数组返回空串', () => {
    expect(formatAllForClipboard([])).toBe('');
  });
});

/**
 * 上限与词表数据的一致性守卫。
 *
 * 回归点：`maxPhraseLen` 曾写死 4，而 4plus 桶里含 5~8 字词 —— 那些词在
 * 正查里**永远命中不了**（「中华人民共和国」被切成「中华 + 人民 + 共和国」）。
 *
 * 上限已提到 8，但词表是**生成出来的**：哪天生成出更长的词，上限又会不够，
 * 而症状是静默的「查不到」——所以这里直接读词表数据，把两者钉在一起。
 */
describe('词组匹配上限与词表数据对齐', () => {
  const readEntries = (bucket: string): [string, string][] => {
    const raw = readFileSync(
      fileURLToPath(new URL(`../../data/generated/phrases-${bucket}.json`, import.meta.url)),
      'utf8',
    );
    return (JSON.parse(raw) as { entries: [string, string][] }).entries;
  };

  it('各桶最长的词都不超过 MAX_PHRASE_LEN', () => {
    for (const bucket of ['2', '3', '4plus']) {
      const longest = readEntries(bucket)
        .reduce((max, [word]) => Math.max(max, Array.from(word).length), 0);

      expect(
        longest,
        `phrases-${bucket} 里有 ${longest} 字词，超过 MAX_PHRASE_LEN=${MAX_PHRASE_LEN}，正查将查不到它`,
      ).toBeLessThanOrEqual(MAX_PHRASE_LEN);
    }
  });

  it('确实存在 5 字以上的词（否则上一条断言是空转）', () => {
    const longWords = readEntries('4plus')
      .filter(([word]) => Array.from(word).length >= 5);

    // 这些正是曾经「永远查不到」的那批词
    expect(longWords.length).toBeGreaterThan(0);
  });
});

/**
 * 词组匹配上限（回归）。
 *
 * `maxPhraseLen` 曾经写死为 4，而 phrases-4plus 桶里除四字词外还含
 * 5~8 字词共 67 条 —— 那些词在正查里**永远命中不了**：
 * 「中华人民共和国」会被切成「中华 + 人民 + 共和国」，
 * 用户看到的是一串巧合切分，而不是词表里真正收录的那个词。
 */
describe('词组匹配上限', () => {
  const longPhraseMap: PhraseMap = buildPhraseMap([
    ['中华', 'khwx'],
    ['人民', 'wwna'],
    ['共和国', 'atlg'],
    ['中华人民共和国', 'kwwl'],
  ]);

  it('7 字词整词命中（旧上限 4 时会被切成三段）', () => {
    const { entries } = lookupText('中华人民共和国', charMap, longPhraseMap);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      text: '中华人民共和国', kind: 'phrase', code: 'kwwl',
    });
  });

  it('5 字词同样整词命中', () => {
    const map = buildPhraseMap([['社会主义', 'pwyy'], ['社会', 'pwf']]);
    const { entries } = lookupText('社会主义', charMap, map);

    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('社会主义');
  });

  it('显式传 4 时回到旧行为（说明这个上限确实在起作用）', () => {
    const { entries } = lookupText('中华人民共和国', charMap, longPhraseMap, 4);

    // 只按 ≤4 字匹配 → 退化成逐段切分，首段是二字词
    expect(entries[0].text).toBe('中华');
    expect(entries.length).toBeGreaterThan(1);
  });
});
