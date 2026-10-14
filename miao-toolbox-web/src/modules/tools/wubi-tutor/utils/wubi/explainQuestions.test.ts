/**
 * 快捷追问生成。
 *
 * 关键约束：只从**首轮候选集**里出题。这样问的必然是真实存在的取舍，
 * 不会把用户引到「模型也不知道」的空地上，也不会问出与这个字无关的问题。
 */

import { describe, it, expect } from 'vitest';
import { MAX_QUICK_ASKS, buildQuickAsks } from './explainQuestions';
import type { WubiExplainParams } from './aiExplain';

function params(): WubiExplainParams {
  return {
    task: 'explain-split',
    char: '照',
    code: 'jvko',
    positions: [
      { index: 0, key: 'j', candidates: [{ glyph: '日', name: '日字' }, { glyph: '曰', name: '曰字' }] },
      { index: 1, key: 'v', candidates: [{ glyph: '刀', name: '刀字' }] },
      { index: 2, key: 'k', candidates: [{ glyph: '口', name: '口字' }, { glyph: '囗', name: '大口' }] },
      { index: 3, key: 'o', candidates: [{ glyph: '灬', name: '四点底' }, { glyph: '米', name: '米字' }] },
    ],
    notes: [],
  };
}

describe('buildQuickAsks', () => {
  it('只为候选 ≥ 2 且已确定字根的位置出题', () => {
    const asks = buildQuickAsks({
      params: params(),
      positions: ['日', '刀', '口', '灬'],
      asked: [],
    });
    const questions = asks.map((a) => a.question);
    expect(questions).toContain('第 1 位为什么取「日」不取「曰」？');
    // 第 2 位只有一个候选，没有取舍可问
    expect(questions.some((q) => q.includes('第 2 位'))).toBe(false);
  });

  it('超过上限时截断（先 why 后 revise）', () => {
    const asks = buildQuickAsks({ params: params(), positions: ['日', '刀', '口', '灬'], asked: [] });
    expect(asks).toHaveLength(MAX_QUICK_ASKS);
    expect(asks.filter((a) => a.kind === 'why')).toHaveLength(MAX_QUICK_ASKS - 1);
    expect(asks.at(-1)?.kind).toBe('revise');
  });

  it('补充一条「纠正」示范，用的是该位另一个候选', () => {
    const asks = buildQuickAsks({ params: params(), positions: ['日', '刀', '口', '灬'], asked: [] });
    const revise = asks.find((a) => a.kind === 'revise');
    expect(revise?.question).toBe('不对，第 1 位应该是「曰」');
  });

  it('已经问过的问题不再推荐', () => {
    const asked = ['第 1 位为什么取「日」不取「曰」？'];
    const asks = buildQuickAsks({ params: params(), positions: ['日', '刀', '口', '灬'], asked });
    expect(asks.some((a) => a.question === asked[0])).toBe(false);
  });

  it('该位字根还没确定（未通过核对）时不出题', () => {
    const asks = buildQuickAsks({ params: params(), positions: [null, '刀', '口', '灬'], asked: [] });
    expect(asks.some((a) => a.question.includes('第 1 位'))).toBe(false);
  });

  it('没有首轮上下文时不出题（不给空谈的机会）', () => {
    expect(buildQuickAsks({ params: null, positions: [], asked: [] })).toEqual([]);
  });
});
