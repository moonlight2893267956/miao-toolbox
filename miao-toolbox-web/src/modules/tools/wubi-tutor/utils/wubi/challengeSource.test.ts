import { describe, it, expect } from 'vitest';
import { buildCharMap, type CharMap, type PhraseMap } from './code';
import { createChallengeSource, DEFAULT_WARMUP_QUESTIONS } from './challengeSource';
import type { Question, QuestionSource } from './questionSource';

const CHAR_MAP: CharMap = buildCharMap([
  ['王', 'gggg', 0],
  ['的', 'rqyy', 1, 'r'],
  ['大', 'dddd', 2, 'dd'],
  ['到', 'gcfg', 2, 'gc'],
  ['一', 'ggll', 1, 'g'],
  ['地', 'fbn', 2, 'fb'],
]);

const PHRASE_MAP: PhraseMap = new Map([
  ['中国', 'khlg'],
  ['我们', 'trwu'],
  ['工作', 'alwt'],
  ['学习', 'ipnu'],
]);

const EMPTY_PHRASE_MAP: PhraseMap = new Map();

/** 按会话状态机的方式抽题：每次 next 后推进 index */
function draw(source: QuestionSource, count: number): Question[] {
  const state = source.init();
  const out: Question[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(source.next(state));
    state.index += 1;
  }
  return out;
}

describe('createChallengeSource', () => {
  it('题源不设题量上限（由时长 / 命数 / 题量规则在外部结束）', () => {
    const source = createChallengeSource({ charMap: CHAR_MAP, phraseMap: PHRASE_MAP, seed: 1 });

    expect(source.finite).toBe(false);
    expect(source.init().total).toBeNull();
  });

  it('前 N 题是单字，之后切换到词组', () => {
    const source = createChallengeSource({
      charMap: CHAR_MAP,
      phraseMap: PHRASE_MAP,
      seed: 7,
      warmupQuestionCount: 3,
    });

    const questions = draw(source, 6);

    questions.slice(0, 3).forEach((q) => {
      expect(q.mode).toBe('char-code');
      // 单字题：prompt 就是一个汉字
      expect(Array.from(q.prompt)).toHaveLength(1);
    });
    questions.slice(3).forEach((q) => {
      expect(q.mode).toBe('phrase-code');
      expect(Array.from(q.prompt)).toHaveLength(2);
    });
  });

  it('切换点读「已出题数」而不是「已答对数」：答错也不会永远停在简单阶段', () => {
    const source = createChallengeSource({
      charMap: CHAR_MAP,
      phraseMap: PHRASE_MAP,
      seed: 3,
      warmupQuestionCount: 2,
    });

    // 抽到第 3 题（index = 2）就已经进入词组阶段
    const questions = draw(source, 3);

    expect(questions[2].mode).toBe('phrase-code');
  });

  it('默认暖场题数可被默认值覆盖', () => {
    const source = createChallengeSource({ charMap: CHAR_MAP, phraseMap: PHRASE_MAP, seed: 1 });
    const questions = draw(source, DEFAULT_WARMUP_QUESTIONS + 1);

    expect(questions[DEFAULT_WARMUP_QUESTIONS - 1].mode).toBe('char-code');
    expect(questions[DEFAULT_WARMUP_QUESTIONS].mode).toBe('phrase-code');
  });

  it('词组表为空时降级为全程单字，而不是抛错', () => {
    const source = createChallengeSource({
      charMap: CHAR_MAP,
      phraseMap: EMPTY_PHRASE_MAP,
      seed: 5,
      warmupQuestionCount: 2,
    });

    const questions = draw(source, 8);

    expect(questions).toHaveLength(8);
    questions.forEach((q) => expect(q.mode).toBe('char-code'));
  });

  it('同一个种子 → 完全相同的题序（每日挑战固定题组的前提）', () => {
    const a = draw(createChallengeSource({ charMap: CHAR_MAP, phraseMap: PHRASE_MAP, seed: 42 }), 10);
    const b = draw(createChallengeSource({ charMap: CHAR_MAP, phraseMap: PHRASE_MAP, seed: 42 }), 10);

    expect(a.map((q) => q.prompt)).toEqual(b.map((q) => q.prompt));
  });

  it('重复 init() 会回到起点（重开一轮的题序与首轮一致）', () => {
    const source = createChallengeSource({ charMap: CHAR_MAP, phraseMap: PHRASE_MAP, seed: 11 });

    const first = draw(source, 6).map((q) => q.prompt);
    const second = draw(source, 6).map((q) => q.prompt);

    expect(second).toEqual(first);
  });

  it('两个阶段的题池互不干扰：词组阶段按自己的池抽满不重复', () => {
    const source = createChallengeSource({
      charMap: CHAR_MAP,
      phraseMap: PHRASE_MAP,
      seed: 9,
      warmupQuestionCount: 2,
    });

    // 前 2 题单字，其后抽满词组池（4 条）
    const questions = draw(source, 6);
    const chars = questions.slice(0, 2).map((q) => q.prompt);
    const phrases = questions.slice(2).map((q) => q.prompt);

    // 单字阶段出的是单字；词组阶段在自己的池内抽满不重复
    expect(chars.every((c) => Array.from(c).length === 1)).toBe(true);
    expect(phrases.every((p) => Array.from(p).length === 2)).toBe(true);
    expect(new Set(phrases).size).toBe(PHRASE_MAP.size);
  });
});
