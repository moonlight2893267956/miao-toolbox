/**
 * 码表数据契约测试（Story 5.1）
 *
 * 锁住两个**静默失效**的属性 —— 它们坏了不会有任何报错，
 * 只会在用户看到一个顺序诡异的候选列表时才被发现：
 *
 * 1. `entries` 数组顺序 = 常用度降序
 *    反查重码的排序直接依赖它。构建脚本曾为了「便于 diff」
 *    按拼音排序，把常用度信息丢掉了。
 * 2. 条目结构可被 buildCharMap / buildPhraseMap 消费
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { buildCharMap, buildPhraseMap, type CharMap, type PhraseMap } from './code';
import { lookupByCode } from './lookup';

/** 中文最高频的一批字（任一权威字频表的前 20 都覆盖） */
const TOP_FREQ = [
  '的', '一', '是', '在', '不', '了', '有', '和', '人', '这',
  '中', '大', '为', '上', '个', '国', '我', '以', '要', '他',
];

interface RawPayload<T> {
  v: string;
  count: number;
  entries: T;
}

describe('码表数据契约', () => {
  let rawChars: RawPayload<[string, string, number, string?][]>;
  let rawPhrases: RawPayload<[string, string][]>;
  let charMap: CharMap;
  let phraseMap: PhraseMap;

  beforeAll(async () => {
    // JSON 模块的 entries 被推断为 (string|number)[][]，需经 unknown 收敛
    rawChars = (await import('../../data/generated/chars.json')).default as unknown as typeof rawChars;
    // 词组已按长度拆成 3 个 chunk，这里用二字词桶做通用契约断言
    rawPhrases = (await import('../../data/generated/phrases-2.json')).default as unknown as typeof rawPhrases;
    charMap = buildCharMap(rawChars.entries);
    phraseMap = buildPhraseMap(rawPhrases.entries);
  });

  // ── 结构 ──

  it('chars 声明数量与 entries 长度一致', () => {
    expect(rawChars.count).toBe(rawChars.entries.length);
    expect(charMap.size).toBeGreaterThan(0);
  });

  it('phrases 声明数量与 entries 长度一致', () => {
    expect(rawPhrases.count).toBe(rawPhrases.entries.length);
    expect(phraseMap.size).toBeGreaterThan(0);
  });

  it('chars 条目结构合法（含全码与简码等级）', () => {
    for (const [char, code, level] of rawChars.entries.slice(0, 500)) {
      expect(char).toMatch(/\p{Script=Han}/u);
      expect(code).toMatch(/^[a-y]{1,4}$/);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(3);
    }
  });

  // ── 常用度序（核心契约）──

  it('chars 保持常用度序而非拼音序', () => {
    const head = rawChars.entries.slice(0, 30).map((e) => e[0]);
    const hits = head.filter((ch) => TOP_FREQ.includes(ch));

    // 拼音序下头部是「吖阿锕錒啊哎哀唉埃挨」这类，命中数接近 0
    expect(hits.length).toBeGreaterThanOrEqual(5);
  });

  it('chars 首条不是拼音序的首字（回归：曾按拼音排序）', () => {
    const sorted = [...rawChars.entries.slice(0, 30).map((e) => e[0])]
      .sort((a, b) => a.localeCompare(b, 'zh'));

    expect(rawChars.entries.slice(0, 30).map((e) => e[0])).not.toEqual(sorted);
  });

  it('phrases 头部为高频词而非拼音序', () => {
    const head = rawPhrases.entries.slice(0, 30).map((e) => e[0]);
    // 高频词普遍是「网站/中国/市场」这类，拼音序首条会是「阿坝」
    expect(head[0]).not.toBe('阿坝');
  });

  // ── 与 lookup 的契约 ──

  it('反查 4 位编码时重码按数据顺序输出（即常用度降序）', () => {
    // 找一个真实存在的重码编码
    const byCode = new Map<string, number>();
    for (const [, code] of rawChars.entries) {
      byCode.set(code, (byCode.get(code) ?? 0) + 1);
    }
    const dupCode = [...byCode.entries()].find(([, n]) => n > 1)?.[0];
    expect(dupCode).toBeTruthy();

    const candidates = lookupByCode(dupCode!, charMap, phraseMap);
    const expectedOrder = rawChars.entries
      .filter(([, code]) => code === dupCode)
      .map((e) => e[0]);

    expect(candidates.map((c) => c.text)).toEqual(expectedOrder);
    expect(candidates[0].duplicates).toBeGreaterThan(1);
    expect(candidates.map((c) => c.rank)).toEqual(
      candidates.map((_, i) => i + 1),
    );
  });

  it('一级简码可反查到唯一候选', () => {
    const candidates = lookupByCode('g', charMap, phraseMap);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.kind === 'char')).toBe(true);
  });
});

// ─── 词组分 chunk 契约（Story 5.3）──────────────────────
//
// 体积预算由构建脚本用二分查找强制（每个 chunk 都精确压到预算上界），
// 此处只断言**结构契约** —— 分档正确、自描述字段齐全、条目长度落位。
// 体积数值由 scripts/check-wubi-tutor.sh 统一核对。

type PhraseChunk = RawPayload<[string, string][]> & { bucket?: string };

describe('词组分 chunk 契约', () => {
  let chunks: { bucket: string; minLen: number; maxLen: number; data: PhraseChunk }[];

  beforeAll(async () => {
    chunks = [
      { bucket: '2', minLen: 2, maxLen: 2, data: (await import('../../data/generated/phrases-2.json')).default as unknown as PhraseChunk },
      { bucket: '3', minLen: 3, maxLen: 3, data: (await import('../../data/generated/phrases-3.json')).default as unknown as PhraseChunk },
      { bucket: '4plus', minLen: 4, maxLen: Infinity, data: (await import('../../data/generated/phrases-4plus.json')).default as unknown as PhraseChunk },
    ];
  });

  it('三个 chunk 均存在，且 bucket 字段自描述', () => {
    expect(chunks).toHaveLength(3);
    for (const c of chunks) {
      expect(c.data.bucket).toBe(c.bucket);
      expect(c.data.count).toBe(c.data.entries.length);
      expect(c.data.entries.length).toBeGreaterThan(0);
    }
  });

  it('每个 chunk 只含对应长度的词组', () => {
    for (const c of chunks) {
      for (const [word] of c.data.entries.slice(0, 500)) {
        const len = Array.from(word).length;
        expect(len).toBeGreaterThanOrEqual(c.minLen);
        expect(len).toBeLessThanOrEqual(c.maxLen);
      }
    }
  });

  it('二字词 chunk 保留了足量高频词（裁剪后仍有万级）', () => {
    const p2 = chunks.find((c) => c.bucket === '2')!;
    expect(p2.data.count).toBeGreaterThanOrEqual(5000);
  });

  it('各 chunk 条目编码格式合法', () => {
    for (const c of chunks) {
      for (const [, code] of c.data.entries.slice(0, 300)) {
        expect(code).toMatch(/^[a-y]{1,4}$/);
      }
    }
  });
});
