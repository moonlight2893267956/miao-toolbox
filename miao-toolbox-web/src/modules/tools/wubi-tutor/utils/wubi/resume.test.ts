/**
 * 中断恢复的算术验证。
 *
 * 这是整个机制唯一容易算错的地方：空转次数 = 已完成题数 + 1
 * （最后一次抽出来的才是「当前题」）。差一次就会恢复到相邻的题目上 ——
 * 界面看起来完全正常，只是题不对，属于最难发现的错法。
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialSessionState,
  startSession,
  handleAnswerKey,
  resumeSession,
  type SessionCounters,
  type SessionState,
} from './session';
import {
  createKeyDrillSource,
  createArticleSource,
  type QuestionSource,
} from './questionSource';
import { buildCharMap } from './code';

const SEED = 1234;
const makeSource = (): QuestionSource =>
  createKeyDrillSource({ scope: 'all', count: 20, seed: SEED });

/** 答对当前题（键位题答案就是一个字母） */
function completeCurrent(state: SessionState, source: QuestionSource): SessionState {
  return state.currentQuestion!.answerKeys.reduce(
    (acc, key) => handleAnswerKey(acc, source, 'drill', key),
    state,
  );
}

const countersOf = (s: SessionState): SessionCounters => ({
  completedCount: s.completedCount,
  totalKeystrokes: s.totalKeystrokes,
  errorKeystrokes: s.errorKeystrokes,
  wrongChars: s.wrongChars,
  attemptedChars: s.attemptedChars,
  correctCharCount: s.correctCharCount,
  wrongQuestionCount: s.wrongQuestionCount,
  wrongKeys: s.wrongKeys,
  keyErrors: s.keyErrors,
  maxCombo: s.maxCombo,
});

/*
 * !! 这条是线上「刷新后题变了」的根因形态 !!
 *
 * 题源内部的 `used` 集合由 init() 重建，但随机序号若跨 init() 累积，
 * 同一个题源被 start 两次就会从第 2 个随机数开始 —— **整个题序位移一格**。
 * 线上表现：刷新前是「主」，继续后是「晝」，而界面、指标、进度全部正常。
 *
 * 修法是让 init() 把发生器重置回种子起点（见 rng.ts 的约定说明）。
 */
describe('题源被重复 start 不位移题序', () => {
  it('同一个题源对象 start 两次，两次都从第 1 题开始', () => {
    const source = makeSource();

    const first = startSession(createInitialSessionState(), source).currentQuestion!.prompt;
    const again = startSession(createInitialSessionState(), source).currentQuestion!.prompt;

    expect(again).toBe(first);
  });

  it('重置后「实时逐题推进」与「恢复空转」严格等价', () => {
    const live = makeSource();
    let state = startSession(createInitialSessionState(), live);
    const seq = [state.currentQuestion!.prompt];
    for (let i = 0; i < 3; i++) {
      state = completeCurrent(state, live);
      seq.push(state.currentQuestion!.prompt);
    }

    // 恢复路径：新题源 + 空转 3 题
    const restored = resumeSession(
      createInitialSessionState(),
      makeSource(),
      3,
      countersOf(state),
    )!;

    expect(restored.currentQuestion!.prompt).toBe(seq[3]);
  });
});

describe('resumeSession', () => {
  it('恢复到中断时的那一题（不是前一题、也不是后一题）', () => {
    const source = makeSource();
    let state = startSession(createInitialSessionState(), source);
    const q1 = state.currentQuestion!.prompt;

    state = completeCurrent(state, source);
    const q2 = state.currentQuestion!.prompt;

    state = completeCurrent(state, source);
    const q3 = state.currentQuestion!.prompt;

    expect(state.completedCount).toBe(2);
    // 三题互不相同，否则这个测试本身就是假的
    expect(new Set([q1, q2, q3]).size).toBe(3);

    // 同种子重建题源 + 空转，必须落回 q3
    const resumed = resumeSession(
      createInitialSessionState(),
      makeSource(),
      2,
      countersOf(state),
    );

    expect(resumed).not.toBeNull();
    expect(resumed!.currentQuestion!.prompt).toBe(q3);
    expect(resumed!.completedCount).toBe(2);
  });

  it('completed = 0 时等价于开新一轮（取第 1 题）', () => {
    const source = makeSource();
    const fresh = startSession(createInitialSessionState(), makeSource());
    const first = fresh.currentQuestion!.prompt;

    const resumed = resumeSession(createInitialSessionState(), source, 0, {
      ...countersOf(fresh),
    });

    expect(resumed!.currentQuestion!.prompt).toBe(first);
  });

  it('题量已打满时拒绝恢复（返回 null，而不是恢复出一轮已结束的练习）', () => {
    const source = makeSource();
    const state = startSession(createInitialSessionState(), source);

    expect(resumeSession(createInitialSessionState(), makeSource(), 20, countersOf(state)))
      .toBeNull();
    expect(resumeSession(createInitialSessionState(), makeSource(), 999, countersOf(state)))
      .toBeNull();
  });

  it('已完成数越界（负数 / 非整数）时拒绝', () => {
    const state = createInitialSessionState();
    expect(resumeSession(state, makeSource(), -1, countersOf(state))).toBeNull();
    expect(resumeSession(state, makeSource(), 1.5, countersOf(state))).toBeNull();
  });

  it('文章模式的进度经恢复后接着打（回归：曾经从头开始）', () => {
    /*
     * 文章题源把**整篇作为一道题**（`total: 1`），逐字推进的位置完全由
     * `inputKeys` 承载（见 articleCursor.ts：`totalTyped = inputKeys.length`）。
     * 所以 completed 恒为 0，「空转到第 N 题」对文章毫无作用 ——
     * 进度只能靠 inputKeys 还原。
     *
     * 曾经 resumeSession 一律清空 inputKeys，结果是文章打了一半刷新、
     * 继续后从第一个字重新开始（用户实际反馈的问题）。
     */
    const charMap = buildCharMap([
      ['一', 'ggll', 1, 'g'], ['地', 'fbn', 1, 'f'], ['在', 'dhfd', 1, 'd'],
    ]);
    const text = '一地在';
    const makeArticle = () => createArticleSource(
      { scope: 'builtin', text, skipUncodable: true }, charMap,
    );

    const source = makeArticle();
    let state = startSession(createInitialSessionState(), source);
    const typed = ['g', 'g', 'l', 'l', 'f'];
    for (const key of typed) {
      state = handleAnswerKey(state, source, 'drill', key);
    }
    expect(state.inputKeys).toEqual(typed);

    const resumed = resumeSession(
      createInitialSessionState(),
      makeArticle(),
      0,
      countersOf(state),
      state.inputKeys,
    )!;

    // 修复前这里是 [] —— 也就是「从头开始」
    expect(resumed.inputKeys).toEqual(typed);

    // 而且能接着往下打：「地」的第二个键 b
    const continued = handleAnswerKey(resumed, makeArticle(), 'drill', 'b');
    expect(continued.inputKeys).toEqual([...typed, 'b']);
  });

  it('半截输入不是当前题的合法前缀时按空处理（不恢复出打不通的状态）', () => {
    const source = makeSource();
    const state = startSession(createInitialSessionState(), source);
    const correct = state.currentQuestion!.answerKeys[0];

    // 键位题答案只有 1 个键，给一串对不上的输入
    const resumed = resumeSession(
      createInitialSessionState(),
      makeSource(),
      0,
      countersOf(state),
      [correct, correct, correct],
    )!;

    expect(resumed.inputKeys).toEqual([]);
  });

  it('累计量原样搬运，但连击归零、错误态清空', () => {
    const source = makeSource();
    let state = startSession(createInitialSessionState(), source);
    state = handleAnswerKey(state, source, 'drill', 'z'); // 无效键：不会变
    state = completeCurrent(state, source);
    state = handleAnswerKey(state, source, 'drill', 'q');
    const typedWrong = state.currentQuestion!.answerKeys[0] === 'q'
      ? handleAnswerKey(state, source, 'drill', 'w') // 万一 q 恰好正确
      : state;

    const resumed = resumeSession(
      createInitialSessionState(),
      makeSource(),
      1,
      countersOf(typedWrong),
    )!;

    expect(resumed.completedCount).toBe(1);
    expect(resumed.totalKeystrokes).toBe(typedWrong.totalKeystrokes);
    expect(resumed.maxCombo).toBe(typedWrong.maxCombo);
    // 刷新确实断了连击，假装没断是自欺
    expect(resumed.combo).toBe(0);
    expect(resumed.inErrorState).toBe(false);
    expect(resumed.inputKeys).toEqual([]);
  });
});
