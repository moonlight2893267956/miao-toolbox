/**
 * 文章练习端到端流程测试
 *
 * 回归保护：整篇文章 = 一道题（total 必须为 1），
 * 否则打完后会无限重开同一篇，表现为「按键没反应」。
 */

import { describe, it, expect } from 'vitest';
import { createArticleSource } from './questionSource';
import {
  createInitialSessionState,
  startSession,
  handleAnswerKey,
  retryCurrentQuestion,
} from './session';
import { buildCharMap, type CharMap } from './code';

const CHAR_MAP: CharMap = buildCharMap([
  ['中', 'khk', 0],
  ['国', 'lgyi', 1, 'l'],
  ['你', 'wqiy', 2, 'wq'],
  ['好', 'vbg', 2, 'vb'],
]);

function makeSource(text: string) {
  return createArticleSource(
    { scope: 'builtin', text, skipUncodable: true },
    CHAR_MAP,
  );
}

describe('文章练习流程', () => {
  it('题源产出的题目带 tokens', () => {
    const source = makeSource('中国你好');
    const question = source.next(source.init());

    expect(question.mode).toBe('article');
    expect(question.answerKeys.length).toBeGreaterThan(0);
    expect(question.tokens).toHaveLength(4);
  });

  it('整篇文章是一道题（total = 1）', () => {
    const source = makeSource('中国你好');
    const qState = source.init();

    // total 必须是 1，不是字数——否则打完不结束
    expect(qState.total).toBe(1);
  });

  it('会话能从 idle 启动为 running', () => {
    const source = makeSource('中国你好');
    const state = startSession(createInitialSessionState(), source);

    expect(state.status).toBe('running');
    expect(state.currentQuestion).not.toBeNull();
    expect(state.currentQuestion!.tokens).toBeDefined();
  });

  it('按对键推进 inputKeys', () => {
    const source = makeSource('中国');
    let state = startSession(createInitialSessionState(), source);

    const firstKey = state.currentQuestion!.answerKeys[0];
    state = handleAnswerKey(state, source, 'drill', firstKey);

    expect(state.inputKeys).toEqual([firstKey]);
    expect(state.totalKeystrokes).toBe(1);
  });

  it('按错键进入错误态（不推进）', () => {
    const source = makeSource('中国');
    let state = startSession(createInitialSessionState(), source);

    const firstKey = state.currentQuestion!.answerKeys[0];
    const wrongKey = firstKey === 'a' ? 'b' : 'a';
    state = handleAnswerKey(state, source, 'drill', wrongKey);

    expect(state.inErrorState).toBe(true);
    expect(state.inputKeys).toHaveLength(0);
    expect(state.errorKeystrokes).toBe(1);
  });

  it('打完全部键后会话结束（不再重开同一篇）', () => {
    const source = makeSource('中国');
    let state = startSession(createInitialSessionState(), source);

    const keys = state.currentQuestion!.answerKeys;
    for (const key of keys) {
      state = handleAnswerKey(state, source, 'drill', key);
    }

    expect(state.status).toBe('finished');
    expect(state.completedCount).toBe(1);
    // 关键回归点：结束后不应重置 inputKeys 重开
    expect(state.inputKeys).toHaveLength(keys.length);
  });

  /*
   * 文章模式：按错不丢已打对的前缀。
   *
   * 重试语义已从「回退到当前字符起点」改为「原地重试」（见 retryCurrentQuestion）。
   * 断言的行为没变，但原因变了：旧实现靠 `inputKeys.slice()` 截断到字符起点，
   * 新实现里**错误的键本来就不会入队**，因此前缀天然保留。
   */
  it('文章模式按错不丢已打对的前缀', () => {
    const source = makeSource('中国');
    let state = startSession(createInitialSessionState(), source);
    const keys = state.currentQuestion!.answerKeys;

    // 正确输入「中」的 3 键
    for (let i = 0; i < 3; i++) {
      state = handleAnswerKey(state, source, 'drill', keys[i]);
    }
    expect(state.inputKeys).toHaveLength(3);

    // 「国」第一键按错
    const wrongKey = keys[3] === 'a' ? 'b' : 'a';
    state = handleAnswerKey(state, source, 'drill', wrongKey);
    expect(state.inErrorState).toBe(true);

    // 重试后应保留「中」的 3 键，只重打「国」
    const retried = retryCurrentQuestion(state);
    expect(retried.inputKeys).toHaveLength(3);
    expect(retried.inputKeys).toEqual(keys.slice(0, 3));
    expect(retried.inErrorState).toBe(false);
    expect(retried.status).toBe('running');
  });

  it('文章模式错误后继续作答能打完', () => {
    const source = makeSource('中国');
    let state = startSession(createInitialSessionState(), source);
    const keys = state.currentQuestion!.answerKeys;

    // 先打「中」
    for (let i = 0; i < 3; i++) {
      state = handleAnswerKey(state, source, 'drill', keys[i]);
    }
    // 「国」第一键按错
    const wrongKey = keys[3] === 'a' ? 'b' : 'a';
    state = handleAnswerKey(state, source, 'drill', wrongKey);
    expect(state.inErrorState).toBe(true);

    // 继续按正确序列（错误态下第一键会触发重试并判定）
    for (let i = 3; i < keys.length; i++) {
      state = handleAnswerKey(state, source, 'drill', keys[i]);
    }

    expect(state.status).toBe('finished');
  });

  it('标点被跳过，不计入答案序列', () => {
    const source = makeSource('中国，你好！');
    let state = startSession(createInitialSessionState(), source);

    // 只有「中国你好」4 字参与，标点不计
    const keys = state.currentQuestion!.answerKeys;
    const tokens = state.currentQuestion!.tokens!;
    const codableCount = tokens.filter((t) => t.isCodable).length;

    for (const key of keys) {
      state = handleAnswerKey(state, source, 'drill', key);
    }

    expect(codableCount).toBe(4);
    expect(state.status).toBe('finished');
  });
});
