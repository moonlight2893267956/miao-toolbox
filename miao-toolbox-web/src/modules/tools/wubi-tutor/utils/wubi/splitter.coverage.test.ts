/**
 * 全量拆字覆盖率（真实算法）。
 *
 * ── 为什么覆盖率必须在测试里算，而不是在 scripts/verify-wubi-split.mjs ──
 *
 * 那个脚本是 `.mjs`，无法 import TS 模块，于是它只校验编码格式
 * （`/^[a-y]{1,4}$/`）就把每个字一律记成 `resolved`：
 *
 * ```js
 * if (code.length === 1) resolved++;
 * else { /* 多码字需要完整逆推——此处标记为待验证 *\/ resolved++; }
 * ```
 *
 * 结果必然是 100% / 0 / 0 —— **无论真实覆盖率是多少**。
 * 这让「resolved ≥ 95%」这条验收口径变成永真条件，
 * 而界面上连「一」这种最基本的字根都显示「暂不支持」。
 *
 * 覆盖率只能由**真正调用 splitter.splitChar 的一方**来算，也就是这里。
 * 脚本侧改为调用本测试（见 scripts/verify-wubi-split.mjs）。
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { analyzeCoverage, splitChar, type SplitCoverage } from './splitter';
import { isKeyNameChar, isSelfRadical } from '../../data/radicals';
import type { CharCode } from './code';

let entries: CharCode[];

beforeAll(async () => {
  const chars = (await import('../../data/generated/chars.json')).default as unknown as {
    entries: [string, string, 0 | 1 | 2 | 3, string?][];
  };
  entries = chars.entries.map(([char, code, level, simplified]) => ({
    char,
    code,
    simplifiedLevel: level,
    simplifiedCode: simplified ?? null,
  }));
});

function report(coverage: SplitCoverage): void {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.log(
    `  [coverage] total ${coverage.total}`
    + ` · resolved ${coverage.resolved} (${pct(coverage.resolvedRate)})`
    + ` · ambiguous ${coverage.ambiguous} (${pct(coverage.ambiguousRate)})`
    + ` · unsupported ${coverage.unsupported} (${pct(coverage.unsupportedRate)})`,
  );
  if (coverage.unsupportedChars.length > 0) {
    console.log(`  [coverage] unsupported 例：${coverage.unsupportedChars.slice(0, 30).join(' ')}`);
  }
  if (coverage.ambiguousChars.length > 0) {
    console.log(`  [coverage] ambiguous 例：${coverage.ambiguousChars.slice(0, 15).join(' ')}`);
  }
}

describe('全量拆字覆盖率（真实算法）', () => {
  it('记录当前真实覆盖率（基线，不做断言门槛）', () => {
    const coverage = analyzeCoverage(entries);

    report(coverage);

    // 只保证样本量正常，避免「数据没加载到」也算通过
    expect(coverage.total).toBeGreaterThan(10000);
  });

  /*
   * ════════════════════════════════════════════════════════
   * 验收口径（已重新表述）
   *
   * 旧口径「resolved ≥ 95%」已废弃，两个原因：
   * 1. 它由 verify-wubi-split.mjs 自己算，而那脚本只校验编码格式就
   *    一律记 resolved，恒报 100% —— 是永真条件；
   * 2. 「唯一拆分」需要**字根分解表**（char → 字根序列），
   *    而码表只有 `字\t编码\t词频` 三列，没有这份数据。
   *    用「字根是否是字形的子串」去猜是不成立的：
   *    汉字是单个码位，`'的'.includes('白') === false` 恒成立。
   *
   * 新口径（对照视图，方案 B）：
   * - **unsupported = 0** —— 每一位都能给出键位与候选字根，功能可用；
   * - **规则字 100% resolved** —— 键名字 + 成字字根走取码规则，
   *   每一位都能确定（含补位位），这是唯一能真正推出拆分的部分；
   * - `ambiguous` 占比只记录、不设门槛 —— 它代表「需对照字形挑选」，
   *   是设计上的正常状态，不是缺陷。
   *
   * 若将来引入字根分解表（方案 A），再为「确定拆分占比」加门槛。
   * ════════════════════════════════════════════════════════
   */

  it('unsupported = 0：每一位都能给出键位与候选字根', () => {
    const coverage = analyzeCoverage(entries);

    expect(coverage.unsupportedChars.slice(0, 20)).toEqual([]);
    expect(coverage.unsupportedRate).toBe(0);
  });

  it('键名字与成字字根全部 resolved（取码规则可推）', () => {
    const ruleBased = entries.filter(
      (e) => isKeyNameChar(e.char) || isSelfRadical(e.char),
    );
    const unreachable = ruleBased.filter(
      (e) => splitChar(e.char, e.code).status !== 'resolved',
    );

    console.log(
      `  [coverage] 键名字 + 成字字根 ${ruleBased.length} 个，`
      + `不可拆 ${unreachable.length} 个`
      + (unreachable.length > 0
        ? `：${unreachable.slice(0, 30).map((e) => `${e.char}(${e.code})`).join(' ')}`
        : ''),
    );

    expect(ruleBased.length).toBeGreaterThan(100);
    expect(unreachable.map((e) => `${e.char}(${e.code})`)).toEqual([]);
  });

  it('规则字的补位位被标注为「补位」而不是「无法拆分」', () => {
    // 一 = GGLL：后两位的 L 是笔画不足的补位，不是字根
    const one = splitChar('一', 'ggll');
    const rows = one.segments.map((s) => `${s.key}:${s.role ?? '-'}`);

    expect(rows).toEqual(['g:键名码', 'g:首笔', 'l:补位', 'l:补位']);
    expect(one.status).toBe('resolved');
    expect(one.segments[2].candidates).toEqual([]);
  });

  it('普通字给出该键的全部候选字根（对照视图）', () => {
    const de = splitChar('的', 'rqyy');

    // 「的」= 白 + 勺 + 丶：拆不出唯一结果，但每一位都应有候选
    expect(de.status).toBe('ambiguous');
    expect(de.segments).toHaveLength(4);
    for (const seg of de.segments) {
      expect(seg.candidates.length).toBeGreaterThan(0);
    }
    // R 键的候选里应当有「白」
    expect(de.segments[0].candidates.map((c) => c.glyph)).toContain('白');
  });
});
