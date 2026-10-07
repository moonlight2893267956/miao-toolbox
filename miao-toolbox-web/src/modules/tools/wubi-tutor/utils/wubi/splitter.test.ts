/**
 * 拆字逆推算法单测
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  splitChar,
  describeSplit,
  analyzeCoverage,
  clearSplitCache,
} from './splitter';
import { type CharCode } from './code';

// 测试用码表
const TEST_CHARS: [string, string, number][] = [
  ['啊', 'kbsk', 0],
  ['一', 'g', 1],
  ['的', 'r', 1],
  ['中', 'k', 1],
  ['国', 'l', 1],
  ['人', 'w', 1],
  ['王', 'gggg', 0],   // 键名字
  ['五', 'gg', 2],     // 成字字根
  ['日', 'jjjj', 0],   // 键名字
  ['口', 'kkkk', 0],   // 键名字
  ['大', 'dd', 2],
  ['到', 'gc', 2],
  ['会', 'wfc', 3],
  ['学', 'ipb', 3],
  ['你', 'wq', 2],
  ['好', 'vb', 2],
  ['是', 'j', 1],
  ['不', 'i', 1],
  ['他', 'wb', 2],
  ['为', 'o', 1],
  ['这', 'p', 1],
  ['主', 'y', 1],
  ['以', 'c', 1],
  ['经', 'x', 1],
  ['地', 'f', 1],
  ['在', 'd', 1],
  ['要', 's', 1],
  ['工', 'a', 1],
  ['上', 'h', 1],
  ['同', 'm', 1],
  ['和', 't', 1],
  ['有', 'e', 1],
  ['我', 'q', 1],
  ['产', 'u', 1],
  ['民', 'n', 1],
  ['了', 'b', 1],
  ['发', 'v', 1],
];

const TEST_ENTRIES: CharCode[] = TEST_CHARS.map(([char, code, level]) => ({
  char,
  code,
  simplifiedLevel: level as 0 | 1 | 2 | 3,
  simplifiedCode: null,
}));

describe('splitChar', () => {
  beforeEach(() => {
    clearSplitCache();
  });

  it('键名字拆分为 4 个相同键位', () => {
    const result = splitChar('王', 'gggg');
    expect(result.status).toBe('resolved');
    expect(result.segments).toHaveLength(4);
    expect(result.segments[0].key).toBe('g');
    // 键名字的候选应包含「王」
    expect(result.segments[0].candidates.some((r) => r.glyph === '王')).toBe(true);
  });

  it('标注键名字 note', () => {
    const result = splitChar('王', 'gggg');
    expect(result.notes.some((n) => n.type === 'keyName')).toBe(true);
  });

  it('成字字根标注 selfRadical note', () => {
    const result = splitChar('五', 'gg');
    expect(result.notes.some((n) => n.type === 'selfRadical')).toBe(true);
  });

  it('简码字标注 simplified note', () => {
    const result = splitChar('的', 'r');
    expect(result.notes.some((n) => n.type === 'simplified')).toBe(true);
    expect(result.notes.find((n) => n.type === 'simplified')!.message).toContain('一级');
  });

  it('二级简码标注正确等级', () => {
    const result = splitChar('大', 'dd');
    expect(result.notes.some((n) => n.type === 'simplified' && n.message.includes('二级'))).toBe(true);
  });

  it('三级简码标注正确等级', () => {
    const result = splitChar('学', 'ipb');
    expect(result.notes.some((n) => n.type === 'simplified' && n.message.includes('三级'))).toBe(true);
  });

  it('全码字不标注 simplified', () => {
    const result = splitChar('啊', 'kbsk');
    expect(result.notes.some((n) => n.type === 'simplified')).toBe(false);
  });

  it('一级简码字的拆分结果段数等于编码长度', () => {
    const result = splitChar('的', 'r');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].key).toBe('r');
  });

  it('多码字拆分结果段数等于编码长度', () => {
    const result = splitChar('啊', 'kbsk');
    expect(result.segments).toHaveLength(4);
    expect(result.segments.map((s) => s.key).join('')).toBe('kbsk');
  });

  it('LRU 缓存：同一字第二次调用返回缓存对象', () => {
    const r1 = splitChar('王', 'gggg');
    const r2 = splitChar('王', 'gggg');
    expect(r1).toBe(r2); // 引用相同（缓存命中）
  });

  it('不同编码产生不同结果', () => {
    const r1 = splitChar('五', 'gg');
    const r2 = splitChar('王', 'gggg');
    expect(r1).not.toBe(r2);
    expect(r1.char).toBe('五');
    expect(r2.char).toBe('王');
  });
});

describe('describeSplit', () => {
  it('resolved 结果有可读描述', () => {
    const result = splitChar('王', 'gggg');
    const desc = describeSplit(result);
    expect(desc).toContain('王');
    expect(desc).toContain('gggg');
  });

  it('unsupported 结果有降级提示（编码位不是有效键位时）', () => {
    /*
     * unsupported 的语义已收窄为「某一位在该键上找不到字根」——
     * 正常码表里不该出现，只有编码含非法键位（如学习键 Z）才会触发。
     *
     * 旧实现会在「猜不出唯一字根」时也报 unsupported，
     * 导致 12452 个字里 99.8% 都落在这一态（见 splitter.coverage.test.ts）。
     */
    const result = splitChar('龘', 'zzzz');
    const desc = describeSplit(result);

    expect(result.status).toBe('unsupported');
    expect(desc).toContain('找不到字根');
  });
});

describe('analyzeCoverage', () => {
  it('正确统计覆盖率', () => {
    const coverage = analyzeCoverage(TEST_ENTRIES);

    expect(coverage.total).toBe(TEST_ENTRIES.length);
    expect(coverage.resolved + coverage.ambiguous + coverage.unsupported).toBe(coverage.total);
    expect(coverage.resolvedRate).toBeGreaterThan(0);

    // resolvedRate 应在 0~1 之间
    expect(coverage.resolvedRate).toBeGreaterThanOrEqual(0);
    expect(coverage.resolvedRate).toBeLessThanOrEqual(1);
  });

  it('键名字应被 resolved', () => {
    const keyNameEntries: CharCode[] = [
      { char: '王', code: 'gggg', simplifiedLevel: 0, simplifiedCode: null },
      { char: '日', code: 'jjjj', simplifiedLevel: 0, simplifiedCode: null },
      { char: '口', code: 'kkkk', simplifiedLevel: 0, simplifiedCode: null },
    ];
    const coverage = analyzeCoverage(keyNameEntries);
    expect(coverage.resolved).toBe(3);
    expect(coverage.resolvedRate).toBe(1);
  });

  it('空列表返回零值', () => {
    const coverage = analyzeCoverage([]);
    expect(coverage.total).toBe(0);
    expect(coverage.resolvedRate).toBe(0);
  });

  it('unsupportedChars 列表非空时包含不支持的字', () => {
    const entries: CharCode[] = [
      { char: '王', code: 'gggg', simplifiedLevel: 0, simplifiedCode: null },
      { char: '龘', code: 'aaaa', simplifiedLevel: 0, simplifiedCode: null },
    ];
    const coverage = analyzeCoverage(entries);
    if (coverage.unsupported > 0) {
      expect(coverage.unsupportedChars).toContain('龘');
    }
  });
});
