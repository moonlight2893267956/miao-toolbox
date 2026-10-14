/**
 * 词级讲解的纯函数层测试。
 *
 * 重点锁两件事：
 * 1. **展平结果**：每一位的键、来源字、是该字第几码 —— 讲错来源等于整段讲解讲错，
 *    所以这层必须由算法算准，不能交给模型；
 * 2. **核对纪律**：位数 / 键位 / 来源字 / 候选集四类违规各一条，且「该位无候选」
 *    时给字根也算违规（补位位不许编字根）。
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { buildCharMap, type CharMap } from './code';
import { composePhrase } from './phraseCompose';
import { splitChar } from './splitter';
import {
  buildPhraseExplainContext,
  isPhraseExplanationDisplayable,
  parseWubiPhraseExplainJson,
  phraseOriginGroups,
  phraseOriginLabel,
  validatePhraseExplainResult,
  type WubiPhraseClaim,
  type WubiPhraseExplainParams,
} from './phraseExplain';

let charMap: CharMap;

beforeAll(async () => {
  const chars = (await import('../../data/generated/chars.json')).default as unknown as {
    entries: [string, string, number, string?][];
  };
  charMap = buildCharMap(chars.entries);
});

/** 造词级参数：真实码表 + composePhrase 推导 */
function build(phrase: string, tableCode: string, map: CharMap = charMap): WubiPhraseExplainParams {
  const params = buildPhraseExplainContext(
    composePhrase(phrase, tableCode, map),
    (char, code) => splitChar(char, code),
  );
  if (!params) throw new Error(`构造失败：${phrase}`);
  return params;
}

describe('buildPhraseExplainContext', () => {
  it('二字词「编码」xydc：每位都对得上「编 2 码 + 码 2 码」', () => {
    const params = build('编码', 'xydc');

    expect(params.task).toBe('explain-phrase');
    expect(params.char).toBe('编码');
    expect(params.ruleLabel).toBe('二字词 · 每字取前 2 码');
    expect(params.positions.map((p) => p.key)).toEqual(['x', 'y', 'd', 'c']);
    expect(params.positions.map((p) => p.fromChar)).toEqual(['编', '编', '码', '码']);
    expect(params.positions.map((p) => p.charIndex)).toEqual([0, 0, 1, 1]);
    expect(params.positions.map((p) => p.charCodeIndex)).toEqual([0, 1, 0, 1]);
    // 每一位都带候选，模型才有得挑
    expect(params.positions.every((p) => p.candidates.length > 0)).toBe(true);
    expect(params.matchesTable).toBe(true);
    expect(params.skippedChars).toEqual([]);
    expect(params.notes).toEqual([]);
  });

  it('三字词「中国人」klww：前两字各取首码，末字取前 2 码', () => {
    const params = build('中国人', 'klww');

    expect(params.ruleLabel).toBe('三字词 · 前两字首码 + 末字前 2 码');
    expect(params.positions.map((p) => p.key)).toEqual(['k', 'l', 'w', 'w']);
    expect(params.positions.map((p) => p.fromChar)).toEqual(['中', '国', '人', '人']);
    expect(params.positions.map((p) => p.charIndex)).toEqual([0, 1, 2, 2]);
    expect(params.positions.map((p) => p.charCodeIndex)).toEqual([0, 0, 0, 1]);
  });

  it('多字词「中华人民共和国」kwwl：中间字不取码，如实点名', () => {
    const params = build('中华人民共和国', 'kwwl');

    expect(params.ruleLabel).toBe('多字词 · 前三字首码 + 末字首码');
    expect(params.positions.map((p) => p.fromChar)).toEqual(['中', '华', '人', '国']);
    expect(params.skippedChars).toEqual(['民', '共', '和']);
    expect(params.notes.some((n) => n.type === 'phraseSkipped')).toBe(true);
  });

  it('词表码与推导码不一致时如实带上两个码（不把例外说成规则）', () => {
    const params = build('编码', 'xydx');

    expect(params.code).toBe('xydx');
    expect(params.derivedCode).toBe('xydc');
    expect(params.matchesTable).toBe(false);
    expect(params.notes.some((n) => n.type === 'phraseTableMismatch')).toBe(true);
    // 取码位仍按事实展平（键以事实为准，与词表码写法无关）
    expect(params.positions.map((p) => p.key)).toEqual(['x', 'y', 'd', 'c']);
  });

  it('来源字未收录时不编造该位的候选，只保留能给的位并说明', () => {
    const partial = buildCharMap([['编', 'xyna', 0]]);
    const params = build('编码', 'xydc', partial);

    expect(params.positions.map((p) => p.key)).toEqual(['x', 'y']);
    expect(params.derivedCode).toBeNull();
    expect(params.notes.some((n) => n.type === 'phraseMissing')).toBe(true);
    // 推导不出来时不报「表码不符」（无从比对）
    expect(params.notes.some((n) => n.type === 'phraseTableMismatch')).toBe(false);
  });

  it('全码短于规则位数时只给存在的位，并标注', () => {
    const short = buildCharMap([['编', 'xyna', 0], ['码', 'd', 0]]);
    const params = build('编码', 'xydc', short);

    expect(params.positions.map((p) => p.key)).toEqual(['x', 'y', 'd']);
    expect(params.notes.some((n) => n.type === 'phraseShort')).toBe(true);
  });

  it('一位都给不出时返回 null（调用方据此退回确定性视图）', () => {
    const empty = buildCharMap([['中', 'khk', 0]]);
    expect(buildPhraseExplainContext(
      composePhrase('编码', 'xydc', empty),
      (char, code) => splitChar(char, code),
    )).toBeNull();
  });

  it('展示用来源标注：按字分组', () => {
    const params = build('编码', 'xydc');

    expect(phraseOriginLabel(params, 2)).toBe('第 3 位（「码」第 1 码）');
    expect(phraseOriginGroups(params)).toEqual([
      { char: '编', code: 'xy', charIndex: 0, startIndex: 0 },
      { char: '码', code: 'dc', charIndex: 1, startIndex: 2 },
    ]);
  });
});

describe('validatePhraseExplainResult', () => {
  /** 按事实造一份「正确」的断言 */
  function correctClaims(params: WubiPhraseExplainParams): WubiPhraseClaim[] {
    return params.positions.map((p) => ({
      key: p.key,
      radical: p.candidates[0].glyph,
      fromChar: p.fromChar,
    }));
  }

  it('正确断言通过', () => {
    const params = build('编码', 'xydc');
    expect(validatePhraseExplainResult(correctClaims(params), params)).toEqual({ ok: true, violations: [] });
  });

  it('位数不符', () => {
    const params = build('编码', 'xydc');
    const claims = correctClaims(params).slice(0, 3);
    const result = validatePhraseExplainResult(claims, params);
    expect(result?.ok).toBe(false);
    expect(result?.violations[0]).toContain('位数不符');
  });

  it('键位不符', () => {
    const params = build('编码', 'xydc');
    const claims = correctClaims(params);
    claims[1] = { ...claims[1], key: 'a' };
    const result = validatePhraseExplainResult(claims, params);
    expect(result?.ok).toBe(false);
    expect(result?.violations[0]).toContain('第 2 位键位不符');
  });

  it('来源字不符（把「从哪个字取的」讲错）', () => {
    const params = build('编码', 'xydc');
    const claims = correctClaims(params);
    claims[2] = { ...claims[2], fromChar: '编' };
    const result = validatePhraseExplainResult(claims, params);
    expect(result?.ok).toBe(false);
    expect(result?.violations[0]).toContain('来源字不符');
  });

  it('字根不在该位候选里', () => {
    const params = build('编码', 'xydc');
    const claims = correctClaims(params);
    claims[2] = { ...claims[2], radical: '龘' };
    const result = validatePhraseExplainResult(claims, params);
    expect(result?.ok).toBe(false);
    expect(result?.violations[0]).toContain('不在');
    // 违规文案要说清是哪一位、取自哪个字
    expect(result?.violations[0]).toContain('「码」第 1 码');
  });

  it('该位无候选时给字根也判违规，留空则通过', () => {
    const params = build('编码', 'xydc');
    // 先用完整候选造断言，再把该位的候选拿掉（模拟补位位：键上没有任何字根）
    const claims = correctClaims(params);
    params.positions[0] = { ...params.positions[0], candidates: [] };

    const bad = validatePhraseExplainResult(claims, params);
    expect(bad?.ok).toBe(false);
    expect(bad?.violations[0]).toContain('没有可选字根');

    claims[0] = { key: claims[0].key, radical: null, fromChar: claims[0].fromChar };
    expect(validatePhraseExplainResult(claims, params)?.ok).toBe(true);
  });

  it('模型没给来源字时不判违规（来源由 UI 按事实渲染）', () => {
    const params = build('编码', 'xydc');
    const claims = params.positions.map((p) => ({ key: p.key, radical: p.candidates[0].glyph }));
    expect(validatePhraseExplainResult(claims, params)?.ok).toBe(true);
  });

  it('没有结构化断言时返回 null（无从校验等于不可展示）', () => {
    const params = build('编码', 'xydc');
    expect(validatePhraseExplainResult(null, params)).toBeNull();
    expect(validatePhraseExplainResult([], params)).toBeNull();
  });
});

describe('parseWubiPhraseExplainJson', () => {
  it('解析带 output 包装的输出，并完成核对', () => {
    const params = build('编码', 'xydc');
    const json = JSON.stringify({
      output: {
        explanation: '「编」取前两码 xy，「码」取前两码 dc。',
        positions: params.positions.map((p) => ({
          key: p.key,
          radical: p.candidates[0].glyph,
          from_char: p.fromChar,
        })),
        model: 'test-model',
        self_check: { ok: true, attempts: 1, violations: [] },
      },
      trace_id: 'trace-1',
    });

    const result = parseWubiPhraseExplainJson(json, params);

    expect(result.explanation).toContain('编');
    expect(result.model).toBe('test-model');
    expect(result.traceId).toBe('trace-1');
    expect(result.validation?.ok).toBe(true);
    expect(isPhraseExplanationDisplayable(result)).toBe(true);
  });

  it('识别码位的 radical 允许为 null，不因此整轮判为不可展示', () => {
    const params = build('编码', 'xydc');
    params.positions[0] = { ...params.positions[0], candidates: [] };

    const json = JSON.stringify({
      explanation: '这一位没有可选字根。',
      positions: params.positions.map((p) => ({
        key: p.key,
        radical: p.candidates[0]?.glyph ?? null,
      })),
    });

    expect(isPhraseExplanationDisplayable(parseWubiPhraseExplainJson(json, params))).toBe(true);
  });

  it('核对不过时不展示，并给出可读原因', () => {
    const params = build('编码', 'xydc');
    const json = JSON.stringify({
      explanation: '随便说说。',
      positions: params.positions.map((p) => ({ key: p.key, radical: '龘' })),
    });

    const result = parseWubiPhraseExplainJson(json, params);

    expect(isPhraseExplanationDisplayable(result)).toBe(false);
    expect(result.validation?.ok).toBe(false);
    expect(result.validation?.violations.length).toBeGreaterThan(0);
  });

  it('不是 JSON 时不抛异常，且判为不可展示（无从校验）', () => {
    const params = build('编码', 'xydc');
    const result = parseWubiPhraseExplainJson('就是一段没有 JSON 的话', params);

    // 纯散文取不出结构化断言：既不展示，也不该混进半截结果
    expect(result.explanation).toBeNull();
    expect(result.positions).toBeNull();
    expect(result.validation).toBeNull();
    expect(isPhraseExplanationDisplayable(result)).toBe(false);
  });
});
