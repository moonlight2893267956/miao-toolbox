/**
 * 内置文章数据的不变量测试。
 *
 * ── 为什么需要它 ──
 *
 * 文章的**难度档位是人工判断**的（`difficulty` 字段），但人工判断会随时间漂移：
 * 半年后有人贴一篇全是生僻字的「入门」文章，谁也不会立刻发现。
 * 这里用码表做客观校验，把「越界」变成测试失败而不是用户投诉。
 *
 * ── 阈值怎么来的 ──
 *
 * 全部来自 `articleAnalysis.ts` 对当前 18 篇的实测基线（不是拍脑袋）：
 *
 *   档      常用度分位均值/最大   生僻字均值/最大   可打字数   缺码
 *   入门6.9% / 9.3%          3.5 / 5         20~71     0
 *   进阶        8.6% / 11.8%         7.0 / 10        57~109    0
 *   挑战        10.6% / 14.7%        8.5 / 10        56~112    0~2
 *
 * 阈值在实测最大值上留了余量，但**不是宽到没有意义**：
 * 比如入门档生僻字上限 7 个，超过就说明这篇文章并不「入门」。
 *
 * 注意：常用度分位**在档位之间有重叠**（进阶 art-14 的 6.6% 低于入门 art-7 的 9.3%），
 * 所以它是越界检查、不是分类器 —— 分档仍然靠人判断，这里只挡明显越界的情况。
 */

import { describe, it, expect } from 'vitest';
import chars from './generated/chars.json';
import {
  ARTICLES,
  DIFFICULTY_ORDER,
  STYLE_LABELS,
  groupArticlesByDifficulty,
  type ArticleDifficulty,
} from './articles';
import { buildCharMap } from '../utils/wubi/code';
import { analyzeArticle } from '../utils/wubi/articleAnalysis';

const charMap = buildCharMap(chars.entries as [string, string, number, string?][]);

/** 每档至少要有这么多篇，否则「选择文章」界面某一档只有一两个选项 */
const MIN_PER_DIFFICULTY = 4;

/**
 * 各档阈值。数值依据见文件头实测表。
 *
 * `uncodable`：缺码字会在练习中渲染成「跳过」态，破坏打字节奏，
 * 所以入门/进阶要求为 0；挑战允许少量（art-5 因用了「——」正好 2 个）。
 */
const LIMITS: Record<
  ArticleDifficulty,
  { maxPercentile: number; maxRare: number; maxUncodable: number }
> = {
  beginner: { maxPercentile: 0.12, maxRare: 7, maxUncodable: 0 },
  intermediate: { maxPercentile: 0.15, maxRare: 12, maxUncodable: 0 },
  challenge: { maxPercentile: 0.2, maxRare: 16, maxUncodable: 3 },
};

/** 全局边界：防误贴一整本书进来，也防贴一句只有几个字的话 */
const GLOBAL_LIMITS = {
  minTotalChars: 15,
  maxTotalChars: 400,
  minCodableChars: 10,
  maxAvgCodeLen: 4.0,
};

describe('内置文章数据', () => {
  it('id 唯一且命名规范 art-N', () => {
    const ids = ARTICLES.map((a) => a.id);
    expect(new Set(ids).size, '存在重复 id').toBe(ids.length);
    for (const id of ids) {
      expect(id, `id 不符合 art-N 规范：${id}`).toMatch(/^art-\d+$/);
    }
  });

  it('每档至少 4 篇，且分组函数按 入门→进阶→挑战 固定顺序返回', () => {
    const groups = groupArticlesByDifficulty();
    expect(groups.map((g) => g.difficulty)).toEqual(
      DIFFICULTY_ORDER.filter((d) => ARTICLES.some((a) => a.difficulty === d))
    );
    for (const g of groups) {
      expect(
        g.items.length,
        `${g.label}档只有 ${g.items.length} 篇，少于 ${MIN_PER_DIFFICULTY}`,
      ).toBeGreaterThanOrEqual(MIN_PER_DIFFICULTY);
    }
  });

  it('每档都覆盖到全部四种风格', () => {
    const styles = Object.keys(STYLE_LABELS);
    for (const g of groupArticlesByDifficulty()) {
      for (const style of styles) {
        expect(
          g.items.some((a) => a.style === style),
          `${g.label}档缺少「${STYLE_LABELS[style as keyof typeof STYLE_LABELS]}」风格的文章`,
        ).toBe(true);
      }
    }
  });

  it('classic（经典）篇目必须写明 author —— 版权兜底', () => {
    for (const a of ARTICLES) {
      if (a.style !== 'classic') continue;
      expect(a.author, `经典篇目《${a.title}》缺 author，无法核对版权`).toBeTruthy();
    }
  });

  it('每篇都能打出字来（codableChars > 0），否则 createArticleSource 会抛 Empty article', () => {
    for (const a of ARTICLES) {
      const r = analyzeArticle(a.text, charMap);
      expect(r.codableChars, `《${a.title}》没有一个字有编码`).toBeGreaterThan(0);
    }
  });

  it('字数落在合理区间（防误贴长文 / 过短文本）', () => {
    for (const a of ARTICLES) {
      const r = analyzeArticle(a.text, charMap);
      expect(
        r.totalChars,
        `《${a.title}》总字数 ${r.totalChars} 越界（${GLOBAL_LIMITS.minTotalChars}~${GLOBAL_LIMITS.maxTotalChars}）`,
      ).toBeGreaterThanOrEqual(GLOBAL_LIMITS.minTotalChars);
      expect(
        r.totalChars,
        `《${a.title}》总字数 ${r.totalChars} 越界（${GLOBAL_LIMITS.minTotalChars}~${GLOBAL_LIMITS.maxTotalChars}）`,
      ).toBeLessThanOrEqual(GLOBAL_LIMITS.maxTotalChars);
      expect(
        r.codableChars,
        `《${a.title}》可打字数 ${r.codableChars} 太少`,
      ).toBeGreaterThanOrEqual(GLOBAL_LIMITS.minCodableChars);
    }
  });

  it('平均码长不越界（防误贴全 4 键长文）', () => {
    for (const a of ARTICLES) {
      const r = analyzeArticle(a.text, charMap);
      expect(
        r.avgCodeLen,
        `《${a.title}》平均码长 ${r.avgCodeLen} 越界`,
      ).toBeLessThanOrEqual(GLOBAL_LIMITS.maxAvgCodeLen);
    }
  });

  it('各档难度指标不越界：缺码字数 / 生僻字数 / 常用度分位', () => {
    for (const a of ARTICLES) {
      const limit = LIMITS[a.difficulty];
      const r = analyzeArticle(a.text, charMap);

      expect(
        r.uncodableChars,
        `《${a.title}》是${a.difficulty}档，却有 ${r.uncodableChars} 个缺码字（${r.uncodableCharList.join('')}）；` +
          '注意「——」「……」会被判成缺码',
      ).toBeLessThanOrEqual(limit.maxUncodable);

      expect(
        r.rareCharCount,
        `《${a.title}》是${a.difficulty}档，却有 ${r.rareCharCount} 个生僻字（上限 ${limit.maxRare}）`,
      ).toBeLessThanOrEqual(limit.maxRare);

      expect(
        r.meanRankPercentile,
        `《${a.title}》是${a.difficulty}档，常用度分位 ${r.meanRankPercentile} 越界（上限 ${limit.maxPercentile}）`,
      ).toBeLessThanOrEqual(limit.maxPercentile);
    }
  });
});

describe('analyzeArticle 指标口径', () => {
  it('统计与 tokenizer 同口径：缺码字不会被算进可打字数', () => {
    const r = analyzeArticle('中国——好', charMap);
    expect(r.codableChars).toBe(3);
    // 两个「——」都落在 General Punctuation 区，会被判成缺码
    expect(r.uncodableChars).toBe(2);
    expect(r.uncodableCharList).toEqual(['—']);
    expect(r.totalChars).toBe(5);
  });

  it('空文本返回全零而不是 NaN', () => {
    const r = analyzeArticle('', charMap);
    expect(r.totalChars).toBe(0);
    expect(r.avgCodeLen).toBe(0);
    expect(r.meanRankPercentile).toBe(0);
  });

  it('常用度分位能区分文章用字的生熟（用真实文章互校）', () => {
    // 「汉字之美」实测分位 14.7%（全库最高之一），「静夜思」8.8%
    const byTitle = (t: string) => {
      const a = ARTICLES.find((x) => x.title === t);
      expect(a, `找不到文章《${t}》`).toBeDefined();
      return analyzeArticle(a!.text, charMap).meanRankPercentile;
    };
    expect(byTitle('汉字之美')).toBeGreaterThan(byTitle('静夜思'));
  });
});