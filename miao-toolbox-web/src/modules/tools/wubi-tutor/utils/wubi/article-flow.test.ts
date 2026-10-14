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

/** 传入段长上限的题源（长文分段用） */
function makeSegmentedSource(text: string, maxCharsPerSegment: number) {
  return createArticleSource(
    { scope: 'builtin', text, skipUncodable: true, maxCharsPerSegment },
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

/**
 * 长文分段。
 *
 * 与上面的「整篇 = 一道题」并存：分段与否只取决于 `maxCharsPerSegment`
 * 与可打字数的关系，短文在传了上限的情况下仍然 total = 1。
 */
describe('文章长文分段', () => {
  const LONG = '中国你好。'.repeat(30); // 150 token / 120 可打字

  it('短文即使传了段长上限也仍然整篇一题（向后兼容）', () => {
    const source = makeSegmentedSource('中国你好', 100);
    expect(source.init().total).toBe(1);
    expect(source.next(source.init()).segment).toBeUndefined();
  });

  it('长文超上限时 total = 段数', () => {
    const source = makeSegmentedSource(LONG, 40);
    const total = source.init().total;
    expect(total).toBeGreaterThan(1);
  });

  it('分段题目带 segment 元信息，段号从 1 起', () => {
    const source = makeSegmentedSource(LONG, 40);
    const state = source.init();
    const total = state.total as number;

    const first = source.next(state);
    expect(first.segment).toEqual({ index: 0, total });
    expect(first.charCount).toBeGreaterThan(0);
    expect(first.hint).toContain(`第 1 / ${total} 段`);

    // 递进题号拿到下一段
    state.index = 1;
    const second = source.next(state);
    expect(second.segment).toEqual({ index: 1, total });
  });

  it('各段的 tokens 拼起来等于整篇（分段不丢字）', () => {
    const source = makeSegmentedSource(LONG, 40);
    const state = source.init();
    const total = state.total as number;

    const parts: string[] = [];
    for (let i = 0; i < total; i += 1) {
      state.index = i;
      parts.push(source.next(state).tokens!.map((t) => t.char).join(''));
    }
    expect(parts.join('')).toBe(LONG);
  });

  it('打完一段只推进一段，打完最后一段才结束', () => {
    const source = makeSegmentedSource(LONG, 40);
    let state = startSession(createInitialSessionState(), source);
    const total = state.questionState!.total as number;

    const typeSegment = () => {
      const keys = state.currentQuestion!.answerKeys;
      for (const key of keys) {
        state = handleAnswerKey(state, source, 'drill', key);
      }
    };

    for (let i = 1; i < total; i += 1) {
      typeSegment();
      expect(state.completedCount, `第 ${i} 段打完应处于下一段`).toBe(i);
      expect(state.status, '还有剩余段时不应结束').toBe('running');
    }

    typeSegment();
    expect(state.status).toBe('finished');
    expect(state.completedCount).toBe(total);
  });

  it('分段后累计字数等于整篇可打字数', () => {
    const source = makeSegmentedSource(LONG, 40);
    const state = source.init();
    const total = state.total as number;

    let sum = 0;
    for (let i = 0; i < total; i += 1) {
      state.index = i;
      sum += source.next(state).charCount ?? 0;
    }
    // '中国你好。' × 30 = 120 个可打字字（句号不计）
    expect(sum).toBe(120);
  });
});
