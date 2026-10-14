/**
 * AI 解释的上下文打包与后校验。
 *
 * 这两件事是「用不用得上 AI」的分水岭：
 * 上下文决定了模型的发挥空间（只能是候选集），后校验决定了能不能展示。
 * 校验門一旦松了，用户看到的就不再是「解释」，而是一段流利但可能错的话 ——
 * 而这个模块的既有纪律正是反对拿流畅冒充正确。
 */

import { describe, it, expect } from 'vitest';
import {
  buildExplainContext,
  parseWubiExplainResult,
  validateExplainResult,
  isExplanationDisplayable,
  type WubiExplainParams,
} from './aiExplain';
import type { SplitResult } from './splitter';

/** 手搓一个拆字结果：测试要精确控制候选集，不依赖真实数据 */
const SPLIT: SplitResult = {
  char: '照',
  code: 'jvko',
  status: 'ambiguous',
  segments: [
    {
      key: 'j',
      candidates: [
        { glyph: '日', name: '日字' } as never,
        { glyph: '曰', name: '曰字' } as never,
      ],
      certain: null,
    },
    {
      key: 'v',
      candidates: [
        { glyph: '刀', name: '刀字' } as never,
        { glyph: '九', name: '九字' } as never,
      ],
      certain: null,
    },
    {
      key: 'k',
      candidates: [
        { glyph: '口', name: '口字' } as never,
        { glyph: '川', name: '川字' } as never,
      ],
      certain: null,
    },
    {
      key: 'o',
      candidates: [
        { glyph: '灬', name: '四点底' } as never,
        { glyph: '米', name: '米字' } as never,
      ],
      certain: null,
    },
  ],
  notes: [{ type: 'simplified', message: '此字有三级简码：jvk' }],
};

/**
 * 「礼」= pynn：末位 n 是末笔折的**识别码**，不是字根。
 *
 * 这份 fixture 对应线上真实翻车点：agent 如实回 `radical: null` + `recognition: true`，
 * 而解析层若要求 radical 必须是字符串，整份断言会被丢掉，用户看到一句
 * 没有原因的通用失败（「解释未通过与字根表的核对」）。
 */
const REC_SPLIT: SplitResult = {
  char: '礼',
  code: 'pynn',
  status: 'ambiguous',
  segments: [
    { key: 'p', candidates: [{ glyph: '礻', name: '示字旁' } as never], certain: null },
    { key: 'y', candidates: [{ glyph: '丶', name: '点' } as never], certain: null },
    { key: 'n', candidates: [{ glyph: '乙', name: '折笔' } as never], certain: null },
    {
      key: 'n',
      candidates: [
        { glyph: '乙', name: '折笔' } as never,
        { glyph: '已', name: '已字' } as never,
      ],
      certain: null,
    },
  ],
  notes: [{ type: 'identificationCode', message: '末位「n」可能为识别码（末笔 + 字型结构推导）' }],
};

/** 礼的正确断言：前三位是字根，末位是识别码（radical 为 null） */
const REC_POSITIONS = [
  { key: 'p', radical: '礻' },
  { key: 'y', radical: '丶' },
  { key: 'n', radical: '乙' },
  { key: 'n', radical: null, recognition: true },
];

describe('buildExplainContext', () => {
  it('把编码、逐位键位、候选字根与标注都带上', () => {
    const ctx = buildExplainContext(SPLIT);

    expect(ctx.char).toBe('照');
    expect(ctx.code).toBe('jvko');
    expect(ctx.positions.map((p) => p.key)).toEqual(['j', 'v', 'k', 'o']);
    expect(ctx.notes).toHaveLength(1);
  });

  it('候选字根**原样全带**，不做预筛', () => {
    // 预筛会把「模型的判断力」换成「我们的判断力」，
    // 而挑字根本来就是算法做不到的那一步
    const ctx = buildExplainContext(SPLIT);
    expect(ctx.positions[0].candidates.map((c) => c.glyph)).toEqual(['日', '曰']);
    expect(ctx.positions[3].candidates.map((c) => c.glyph)).toEqual(['灬', '米']);
  });

  it('带上用户的实际错误（用于点名易混字根）', () => {
    const ctx = buildExplainContext(SPLIT, { expected: 'j', actual: 'h' });
    expect(ctx.error).toEqual({ expected: 'j', actual: 'h' });
  });
});

describe('validateExplainResult — 落不到候选集就不许展示', () => {
  const ctx: WubiExplainParams = buildExplainContext(SPLIT);

  /** 合法的一份完整断言（4 码 4 位） */
  const VALID = [
    { key: 'j', radical: '日' },
    { key: 'v', radical: '刀' },
    { key: 'k', radical: '口' },
    { key: 'o', radical: '灬' },
  ];

  /** 只改第 1 位，其余保持合法 —— 让违规项在断言里可定位 */
  const withFirst = (pos: { key: string; radical: string }) => [pos, ...VALID.slice(1)];

  it('键位与字根都对 → 通过', () => {
    expect(validateExplainResult(VALID, ctx)).toEqual({ ok: true, violations: [] });
  });

  it('同键的另一个字根也算通过（都合法，选哪个是模型要解释的）', () => {
    const v = validateExplainResult(withFirst({ key: 'j', radical: '曰' }), ctx);
    expect(v!.ok).toBe(true);
  });

  it('键位被改写 → 不通过', () => {
    const v = validateExplainResult(withFirst({ key: 'h', radical: '日' }), ctx);
    expect(v!.ok).toBe(false);
    expect(v!.violations.some((x) => x.includes('键位不符'))).toBe(true);
  });

  it('字根不在该键的候选里 → 不通过（幻觉的主要形态）', () => {
    // 「王」在 G 键，不在 J 键 —— 模型凭空造一个字根出来
    const v = validateExplainResult(withFirst({ key: 'j', radical: '王' }), ctx);
    expect(v!.ok).toBe(false);
    expect(v!.violations.some((x) => x.includes('不在'))).toBe(true);
  });

  it('补位位不许给字根（该键不代表任何字根）', () => {
    const paddingCtx = buildExplainContext({
      ...SPLIT,
      code: 'jvkll',
      segments: [...SPLIT.segments, { key: 'l', candidates: [], certain: null }],
    });
    const v = validateExplainResult(
      [...VALID, { key: 'l', radical: '田' }, { key: 'l', radical: '田' }],
      paddingCtx,
    );
    expect(v!.ok).toBe(false);
    expect(v!.violations.some((x) => x.includes('补位'))).toBe(true);
  });

  /*
   * !! 只给部分位不算通过 !!
   *
   * 允许缺位就等于允许模型「只答有把握的那几位」—— 而「回避不确定位置」
   * 恰恰是这里最该检出的失败模式。要求给全，才有「整份拆分都落在候选集内」
   * 这个完整保证；给不全就退回确定性视图。
   */
  it('只给部分位 → 不通过（不允许靠缺位回避）', () => {
    const v = validateExplainResult([VALID[0]], ctx);
    expect(v!.ok).toBe(false);
    expect(v!.violations.some((x) => x.includes('位数不符'))).toBe(true);
  });

  it('模型没给结构化断言时返回 null（无从校验 ≠ 通过）', () => {
    expect(validateExplainResult(null, ctx)).toBeNull();
    expect(validateExplainResult([], ctx)).toBeNull();
  });

  // ── 识别码位：末位没有字根是对的，不是「没给断言」 ──
  describe('末笔识别码位', () => {
    const recCtx: WubiExplainParams = buildExplainContext(REC_SPLIT);

    it('末位声明识别码（radical 为 null）→ 通过', () => {
      expect(validateExplainResult(REC_POSITIONS, recCtx)).toEqual({ ok: true, violations: [] });
    });

    it('末位不给字根却没声明识别码 → 不通过（沉默不算答案）', () => {
      const v = validateExplainResult([...REC_POSITIONS.slice(0, 3), { key: 'n', radical: null }], recCtx);
      expect(v!.ok).toBe(false);
      expect(v!.violations.some((x) => x.includes('没有给出字根'))).toBe(true);
    });

    it('非末位声明识别码 → 不通过（识别码只可能出现在末位）', () => {
      const v = validateExplainResult(
        [
          { key: 'p', radical: '礻' },
          { key: 'y', radical: null, recognition: true },
          ...REC_POSITIONS.slice(2),
        ],
        recCtx,
      );
      expect(v!.ok).toBe(false);
      expect(v!.violations.some((x) => x.includes('没有给出字根'))).toBe(true);
    });

    it('末位声明识别码，但该键不在识别码的 15 个键里 → 不通过', () => {
      // o 不在识别码键里（g/f/d、h/j/k、t/r/e、y/u/i、n/b/v）
      const v = validateExplainResult(
        [...VALID.slice(0, 3), { key: 'o', radical: null, recognition: true }],
        ctx,
      );
      expect(v!.ok).toBe(false);
      expect(v!.violations.some((x) => x.includes('识别码的 15 个键'))).toBe(true);
    });
  });
});

describe('parseWubiExplainResult', () => {
  const ctx = buildExplainContext(SPLIT);

  it('解析完整 JSON，并顺手做校验', () => {
    const positions = [
      { key: 'j', radical: '日' },
      { key: 'v', radical: '刀' },
      { key: 'k', radical: '口' },
      { key: 'o', radical: '灬' },
    ];
    const raw = JSON.stringify({
      explanation: '「照」拆成 日 + 刀 + 口 + 灬，四点底是最后一码。',
      positions,
      suggestions: ['注意「曰」与「日」的区别'],
    });

    const parsed = parseWubiExplainResult(raw, ctx);

    expect(parsed.explanation).toContain('照');
    // 归一化后每一位都带 recognition 标记（没有声明就是 false）
    expect(parsed.positions).toEqual(positions.map((p) => ({ ...p, recognition: false })));
    expect(parsed.suggestions).toEqual(['注意「曰」与「日」的区别']);
    expect(parsed.validation).toEqual({ ok: true, violations: [] });
  });

  /*
   * 平台把 agent 的返回值放进 SSE 的 output 事件，而 useSignedAiStream 收到
   * output 事件时会把**整个 payload** 序列化进累积文本。
   * 只认一种形状的话，解释会永远解析不出来 —— 而且失败得很安静
   * （不报错，只是判定为不可展示，看起来像「模型没给结构化断言」）。
   */
  it('payload 包在 output 层里时也能解析', () => {
    const raw = JSON.stringify({
      output: {
        explanation: '「照」拆成 日 + 刀 + 口 + 灬，四点底是最后一码。',
        positions: [
          { key: 'j', radical: '日' },
          { key: 'v', radical: '刀' },
          { key: 'k', radical: '口' },
          { key: 'o', radical: '灬' },
        ],
      },
      trace_id: 'abc123',
    });

    const parsed = parseWubiExplainResult(raw, ctx);

    expect(parsed.explanation).toContain('照');
    expect(parsed.validation?.ok).toBe(true);
  });

  it('positions 形状不对时返回 null，而不是塞进半个对象', () => {
    const raw = JSON.stringify({
      explanation: '随便说说',
      positions: [{ key: 'j' }],
    });
    const parsed = parseWubiExplainResult(raw, ctx);
    expect(parsed.positions).toBeNull();
    expect(parsed.validation).toBeNull();
  });

  /*
   * !! 线上翻车点（礼 pynn）!!
   *
   * 末位是末笔识别码时，agent 的 positions 末项是 `radical: null` + `recognition: true`
   * ——那是**正确**的返回。此处若只认字符串，整份断言被判废，validation 变成 null，
   * 于是 UI 只剩「解释未通过与字根表的核对」这一句无从下手的话，而重试永远无效。
   */
  it('识别码位的 radical 为 null 时不再整份判废', () => {
    const raw = JSON.stringify({
      explanation: '「礼」的五笔编码是 pynn：礻 + 丶 + 乙，末位是末笔折的识别码。',
      positions: [
        { index: 0, key: 'p', radical: '礻', recognition: false },
        { index: 1, key: 'y', radical: '丶', recognition: false },
        { index: 2, key: 'n', radical: '乙', recognition: false },
        { index: 3, key: 'n', radical: null, recognition: true, recognition_stroke: '折' },
      ],
      error: null,
      self_check: { ok: true, attempts: 2, violations: [] },
    });

    const parsed = parseWubiExplainResult(raw, buildExplainContext(REC_SPLIT));

    expect(parsed.positions?.map((p) => p.radical)).toEqual(['礻', '丶', '乙', null]);
    expect(parsed.validation).toEqual({ ok: true, violations: [] });
    expect(isExplanationDisplayable(parsed)).toBe(true);
  });

  it('缺 positions 时解释仍然可读，但判定为不可展示', () => {
    const raw = JSON.stringify({ explanation: '「照」上面是日下面是灬。' });
    const parsed = parseWubiExplainResult(raw, ctx);

    expect(parsed.explanation).not.toBeNull();
    expect(parsed.positions).toBeNull();
    expect(isExplanationDisplayable(parsed)).toBe(false);
  });
});

describe('isExplanationDisplayable', () => {
  it('有解释且校验通过才可展示', () => {
    expect(isExplanationDisplayable(null)).toBe(false);

    expect(isExplanationDisplayable({
      explanation: '好',
      positions: null,
      suggestions: null,
      model: null,
      traceId: null,
      validation: null,
    })).toBe(false);

    expect(isExplanationDisplayable({
      explanation: '好',
      positions: [{ key: 'j', radical: '日' }],
      suggestions: null,
      model: null,
      traceId: null,
      validation: { ok: false, violations: ['x'] },
    })).toBe(false);

    expect(isExplanationDisplayable({
      explanation: '好',
      positions: [{ key: 'j', radical: '日' }],
      suggestions: null,
      model: null,
      traceId: null,
      validation: { ok: true, violations: [] },
    })).toBe(true);
  });
});
