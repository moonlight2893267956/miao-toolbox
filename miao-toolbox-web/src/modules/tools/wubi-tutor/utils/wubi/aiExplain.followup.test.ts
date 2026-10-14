/**
 * 追问轮解析与可信度判定。
 *
 * 这一层是「多轮对话能信多少」的分水岭：agent 的追问返回里有引用（citations）、
 * 未核验断言（new_claims）与位次修正（accepted/glyph）。前端必须自己再核一遍，
 * 而不是照单全收 —— 判定表见 aiExplain.ts 的 verifyTurn 注释。
 */

import { describe, it, expect } from 'vitest';
import {
  candidatesFor,
  parseFollowupTurn,
  verifyTurn,
  type WubiExplainParams,
} from './aiExplain';

/** 首轮上下文：两位，第二位有两个候选（供修正类断言核对） */
const PARAMS: WubiExplainParams = {
  task: 'explain-split',
  char: '照',
  code: 'jv',
  positions: [
    { index: 0, key: 'j', candidates: [{ glyph: '日', name: '日字' }, { glyph: '曰', name: '曰字' }] },
    { index: 1, key: 'v', candidates: [{ glyph: '刀', name: '刀字' }, { glyph: '九', name: '九字' }] },
  ],
  notes: [],
};

/** 一次追问轮的 agent 输出：可以按需覆盖字段 */
function raw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    char: '照',
    explanation: '第 1 位取「日」，因为……',
    citations: ['第 1 轮 positions[0].reason'],
    new_claims: [],
    followup: { kind: 'reasoned', answered: true, based_on_turn: 1, llm_used: true },
    ...overrides,
  };
}

describe('candidatesFor', () => {
  it('取该位的候选字根', () => {
    expect(candidatesFor(PARAMS, 0)).toEqual(['日', '曰']);
  });

  it('位序越界返回空数组（不抛）', () => {
    expect(candidatesFor(PARAMS, 9)).toEqual([]);
  });
});

describe('parseFollowupTurn — 正文与结构', () => {
  it('解析正文、引用、新增断言与轮次', () => {
    const turn = parseFollowupTurn(
      raw({ new_claims: ['「曰」在 J 键上'] }),
      PARAMS,
    );
    expect(turn.text).toContain('第 1 位取「日」');
    expect(turn.citations).toEqual(['第 1 轮 positions[0].reason']);
    expect(turn.newClaims).toEqual(['「曰」在 J 键上']);
    expect(turn.kind).toBe('reasoned');
    expect(turn.answered).toBe(true);
    expect(turn.basedOnTurn).toBe(1);
    expect(turn.verification).toBe('ok');
  });

  it('payload 被包在 output 层里时也能解析', () => {
    const turn = parseFollowupTurn({ output: raw() }, PARAMS);
    expect(turn.text).toContain('第 1 位');
  });

  it('形状不对时给出一轮空结果，而不是抛错', () => {
    const turn = parseFollowupTurn(null, PARAMS);
    expect(turn.text).toBe('');
    expect(turn.citations).toEqual([]);
    expect(turn.verification).toBe('unverified');
  });

  it('agent 说没回答（answered=false）→ 需澄清，不算通过', () => {
    const turn = parseFollowupTurn(
      raw({
        explanation: '没能把「土」对应到具体某一位。',
        followup: { kind: 'unknown', answered: false, based_on_turn: 1 },
      }),
      PARAMS,
    );
    expect(turn.kind).toBe('unknown');
    expect(turn.answered).toBe(false);
    expect(turn.verification).toBe('unverified');
  });

  it('确定性降级回答（fallback）判定为可展示', () => {
    const turn = parseFollowupTurn(
      raw({
        citations: [],
        followup: { kind: 'why', answered: true, based_on_turn: 1, llm_used: false, fallback: true },
      }),
      PARAMS,
    );
    expect(turn.fallback).toBe(true);
    expect(turn.verification).toBe('ok');
  });
});

describe('parseFollowupTurn — 位次修正', () => {
  it('采纳的修正：带上 before/after 与该位候选集', () => {
    const turn = parseFollowupTurn(
      raw({
        followup: {
          kind: 'revise',
          answered: true,
          accepted: true,
          index: 1,
          glyph: '九',
          previous_radical: '刀',
          based_on_turn: 1,
        },
      }),
      PARAMS,
    );
    expect(turn.revision).toEqual({
      index: 1,
      key: 'v',
      from: '刀',
      to: '九',
      candidates: ['刀', '九'],
    });
    expect(turn.verification).toBe('ok');
  });

  it('采纳的字根不在该位候选集里 → 核对不通过', () => {
    const turn = parseFollowupTurn(
      raw({
        followup: {
          kind: 'revise',
          answered: true,
          accepted: true,
          index: 1,
          glyph: '土',
          previous_radical: '刀',
          based_on_turn: 1,
        },
      }),
      PARAMS,
    );
    expect(turn.revision?.to).toBe('土');
    expect(turn.verification).toBe('failed');
  });

  it('被拒的修正算核对通过（拒绝迁就是正确行为）', () => {
    const turn = parseFollowupTurn(
      raw({
        explanation: '第 2 位不能按「土」修正：它不在键 V 的候选字根里。',
        followup: {
          kind: 'revise',
          answered: true,
          accepted: false,
          index: 1,
          glyph: '土',
          previous_radical: '刀',
          based_on_turn: 1,
        },
      }),
      PARAMS,
    );
    expect(turn.accepted).toBe(false);
    expect(turn.verification).toBe('ok');
  });

  it('缺少位序或字根时不构造修正项', () => {
    const turn = parseFollowupTurn(
      raw({ followup: { kind: 'revise', answered: true, based_on_turn: 1 } }),
      PARAMS,
    );
    expect(turn.revision).toBeNull();
  });
});

describe('verifyTurn — 判定表', () => {
  const base = {
    kind: 'reasoned' as const,
    text: '有正文',
    citations: [] as string[],
    accepted: null,
    revision: null,
    answered: true,
    fallback: false,
  };

  it('正文为空 → 不可展示', () => {
    expect(verifyTurn({ ...base, text: '' })).toBe('unverified');
  });

  it('模型回答没有任何引用 → 未经核对', () => {
    expect(verifyTurn(base)).toBe('unverified');
  });

  it('模型回答带引用 → 通过', () => {
    expect(verifyTurn({ ...base, citations: ['第 1 轮 code'] })).toBe('ok');
  });

  it('「为什么」类回答直接来自已核实事实 → 通过', () => {
    expect(verifyTurn({ ...base, kind: 'why' })).toBe('ok');
  });

  it('改位后的字根不在候选集里 → 核对不通过（不论谁提的）', () => {
    expect(
      verifyTurn({
        ...base,
        citations: ['第 1 轮 positions[0].reason'],
        revision: { index: 1, key: 'v', from: '刀', to: '土', candidates: ['刀', '九'] },
      }),
    ).toBe('failed');
  });

  it('被拒的修正不算不通过（拒绝迁就是正确行为）', () => {
    expect(
      verifyTurn({
        ...base,
        kind: 'revise',
        accepted: false,
        revision: { index: 1, key: 'v', from: '刀', to: '土', candidates: ['刀', '九'] },
      }),
    ).toBe('ok');
  });
});

/**
 * 模型路径的改位。
 *
 * agent 在走模型（answer.reason）时，followup 里只有 kind=reasoned，
 * **不带 accepted / glyph** —— 改没改位只能靠 positions 的差异比出来。
 * 这几条就是那段逻辑的护栏：漏了它，用户在「不对，应该是曰」之后
 * 看不到任何「日 → 曰」的对照，只能自己去正文里找。
 */
describe('parseFollowupTurn — 从 positions 差异推出改位（模型路径）', () => {
  const modelFollowup = (positions: unknown[]) =>
    raw({
      followup: { kind: 'reasoned', answered: true, based_on_turn: 1, llm_used: true },
      positions,
    });

  it('第 1 位从「日」改成「曰」→ 推出改位并带上候选集', () => {
    const turn = parseFollowupTurn(
      modelFollowup([
        { key: 'j', radical: '曰', reason: '按调用方主张取「曰」' },
        { key: 'v', radical: null, recognition: true },
      ]),
      PARAMS,
      ['日', null],
    );
    expect(turn.revision).toEqual({
      index: 0,
      key: 'j',
      from: '日',
      to: '曰',
      candidates: ['日', '曰'],
    });
    expect(turn.verification).toBe('ok');
  });

  it('改成候选集外的字根 → 判定为核对不通过', () => {
    const turn = parseFollowupTurn(
      modelFollowup([
        { key: 'j', radical: '水' },
        { key: 'v', radical: null },
      ]),
      PARAMS,
      ['日', null],
    );
    expect(turn.revision?.to).toBe('水');
    expect(turn.verification).toBe('failed');
  });

  it('positions 与上一轮一致 → 不产生改位（普通说明轮）', () => {
    const turn = parseFollowupTurn(
      modelFollowup([
        { key: 'j', radical: '日' },
        { key: 'v', radical: null },
      ]),
      PARAMS,
      ['日', null],
    );
    expect(turn.revision).toBeNull();
  });

  it('positions 位数与编码不符 → 不构造基准（宁可不比，也不要错位）', () => {
    const turn = parseFollowupTurn(modelFollowup([{ key: 'j', radical: '曰' }]), PARAMS, ['日']);
    expect(turn.positions).toBeNull();
    expect(turn.revision).toBeNull();
  });

  it('positions 会被带出来，供下一轮继续对比', () => {
    const turn = parseFollowupTurn(
      modelFollowup([
        { key: 'j', radical: '日' },
        { key: 'v', radical: '刀' },
      ]),
      PARAMS,
      ['日', null],
    );
    expect(turn.positions).toEqual(['日', '刀']);
  });
});
