/**
 * 讲解台的纯状态模型：轮次增删、会话边界、陈旧响应。
 *
 * 这些行为没法靠组件测试覆盖（前端没有 jsdom），但又最容易出问题 ——
 * 尤其是「切字之后旧响应回来了」与「会话过期后重放首轮」两条路径。
 */

import { describe, it, expect } from 'vitest';
import {
  INITIAL_EXPLAIN_CHAT_STATE,
  activeThread,
  answeredTurnCount,
  explainChatReducer,
  hasAnchorAnswer,
  isBusy,
  latestAssistantTurnId,
  preemptedChar,
  splitSentences,
  threadFor,
  type ExplainChatState,
} from './explainChat';
import type { ExplainTurnPayload, WubiExplainParams } from './aiExplain';

const PARAMS: WubiExplainParams = {
  task: 'explain-split',
  char: '照',
  code: 'jvko',
  positions: [
    { index: 0, key: 'j', candidates: [{ glyph: '日', name: '日字' }] },
  ],
  notes: [],
};

function payload(overrides: Partial<ExplainTurnPayload> = {}): ExplainTurnPayload {
  return {
    kind: 'reasoned',
    text: '第 1 位取「日」。',
    citations: ['第 1 轮 positions[0].reason'],
    newClaims: [],
    revision: null,
    positions: null,
    accepted: null,
    basedOnTurn: 1,
    fallback: false,
    answered: true,
    error: null,
    verification: 'ok',
    ...overrides,
  };
}

/** 选中一个字并让它完成首轮 */
function withAnchor(char = '照'): ExplainChatState {
  let state = explainChatReducer(INITIAL_EXPLAIN_CHAT_STATE, {
    type: 'SELECT_CHAR',
    char,
    code: 'jvko',
    params: PARAMS,
  });
  state = explainChatReducer(state, {
    type: 'ANCHOR_OK',
    char,
    text: '「照」拆成 日/刀/口/灬。',
    verification: 'ok',
    positions: ['日'],
    conversationId: 'conv_1',
    turn: 1,
  });
  return state;
}

describe('SELECT_CHAR — 会话按字锚定', () => {
  it('选中新字会新建线程', () => {
    const state = withAnchor();
    expect(threadFor(state, '照')?.char).toBe('照');
    expect(state.activeChar).toBe('照');
  });

  it('同字重选保留线程（不重复请求）', () => {
    const first = withAnchor();
    const again = explainChatReducer(first, {
      type: 'SELECT_CHAR',
      char: '照',
      code: 'jvko',
      params: PARAMS,
    });
    expect(again).toBe(first);
  });

  it('换字后线程各自独立，切回来仍在', () => {
    let state = withAnchor();
    state = explainChatReducer(state, {
      type: 'SELECT_CHAR',
      char: '牡',
      code: 'trfg',
      params: { ...PARAMS, char: '牡' },
    });
    expect(state.activeChar).toBe('牡');
    expect(threadFor(state, '照')?.turns).toHaveLength(1);
    expect(threadFor(state, '牡')?.turns).toHaveLength(0);

    state = explainChatReducer(state, {
      type: 'SELECT_CHAR',
      char: '照',
      code: 'jvko',
      params: PARAMS,
    });
    expect(state.activeChar).toBe('照');
    expect(hasAnchorAnswer(activeThread(state))).toBe(true);
  });
});

describe('陈旧响应守卫', () => {
  it('对不存在的线程派发响应不会凭空造出线程', () => {
    const state = explainChatReducer(INITIAL_EXPLAIN_CHAT_STATE, {
      type: 'ANCHOR_OK',
      char: '照',
      text: '迟到的回答',
      verification: 'ok',
      positions: [],
      conversationId: 'conv_x',
      turn: 1,
    });
    expect(state).toBe(INITIAL_EXPLAIN_CHAT_STATE);
  });

  it('对已被清空线程的字派发追问响应同样被丢弃', () => {
    const state = explainChatReducer(INITIAL_EXPLAIN_CHAT_STATE, {
      type: 'ANSWER_OK',
      char: '照',
      payload: payload(),
      turn: 2,
    });
    expect(state.threads['照']).toBeUndefined();
  });
});

describe('轮次推进', () => {
  it('首轮计入已答轮次，且 picked 被记住', () => {
    const thread = threadFor(withAnchor(), '照');
    expect(answeredTurnCount(thread)).toBe(1);
    expect(thread?.positions).toEqual(['日']);
    expect(thread?.conversationId).toBe('conv_1');
  });

  it('追问：用户轮先入队并记入 asked，状态为等待中', () => {
    let state = withAnchor();
    state = explainChatReducer(state, { type: 'ASK', char: '照', question: '第 1 位为什么取日？' });
    const thread = threadFor(state, '照');
    expect(isBusy(thread)).toBe(true);
    expect(thread?.asked).toEqual(['第 1 位为什么取日？']);
    expect(thread?.turns.at(-1)?.role).toBe('user');
  });

  it('回答到达后状态回到 ready，轮次递增', () => {
    let state = withAnchor();
    state = explainChatReducer(state, { type: 'ASK', char: '照', question: '为什么？' });
    state = explainChatReducer(state, { type: 'ANSWER_OK', char: '照', payload: payload(), turn: 2 });
    const thread = threadFor(state, '照');
    expect(isBusy(thread)).toBe(false);
    expect(answeredTurnCount(thread)).toBe(2);
    expect(thread?.turns.at(-1)?.turn).toBe(2);
    expect(thread?.turns.at(-1)?.citations).toEqual(['第 1 轮 positions[0].reason']);
  });

  it('后端没回轮次号时本地顺延，不写死 0', () => {
    let state = withAnchor();
    state = explainChatReducer(state, { type: 'ASK', char: '照', question: '为什么？' });
    state = explainChatReducer(state, { type: 'ANSWER_OK', char: '照', payload: payload(), turn: null });
    expect(threadFor(state, '照')?.turns.at(-1)?.turn).toBe(2);
  });

  it('追问失败留下可重试的提示轮', () => {
    let state = withAnchor();
    state = explainChatReducer(state, { type: 'ASK', char: '照', question: '为什么？' });
    state = explainChatReducer(state, {
      type: 'ANSWER_FAIL',
      char: '照',
      question: '为什么？',
      message: 'AI 服务不可用',
    });
    const thread = threadFor(state, '照');
    expect(isBusy(thread)).toBe(false);
    expect(thread?.turns.at(-1)?.retryQuestion).toBe('为什么？');
    expect(thread?.turns.at(-1)?.error).toBe('AI 服务不可用');
  });

  it('取消后不留在禁用态', () => {
    let state = withAnchor();
    state = explainChatReducer(state, { type: 'ASK', char: '照', question: '为什么？' });
    state = explainChatReducer(state, { type: 'CANCEL', char: '照' });
    const thread = threadFor(state, '照');
    expect(isBusy(thread)).toBe(false);
    expect(thread?.turns.at(-1)?.text).toBe('已取消本次回答。');
  });
});

describe('会话失效与重开', () => {
  it('过期时清掉会话 ID 并留提示（线程其余内容保留）', () => {
    let state = withAnchor();
    state = explainChatReducer(state, {
      type: 'CONVERSATION_EXPIRED',
      char: '照',
      text: '会话已失效，已重新开始。',
    });
    const thread = threadFor(state, '照');
    expect(thread?.conversationId).toBeNull();
    expect(hasAnchorAnswer(thread)).toBe(true);
    expect(thread?.turns.at(-1)?.role).toBe('notice');
  });

  it('新会话清空轮次、候选结论与会话 ID，并回到加载态', () => {
    let state = withAnchor();
    state = explainChatReducer(state, { type: 'ASK', char: '照', question: '为什么？' });
    state = explainChatReducer(state, { type: 'RESTART', char: '照' });
    const thread = threadFor(state, '照');
    expect(thread?.turns).toHaveLength(0);
    expect(thread?.positions).toEqual([]);
    expect(thread?.conversationId).toBeNull();
    expect(thread?.status).toBe('loading');
    // 历史已清空 → 快捷追问的去重依据也必须清，否则同一问题再也推荐不出来
    expect(thread?.asked).toEqual([]);
  });

  it('首轮重试：失败提示替换而不是堆叠，并累计尝试次数', () => {
    let state = explainChatReducer(INITIAL_EXPLAIN_CHAT_STATE, {
      type: 'SELECT_CHAR',
      char: '编',
      code: 'xyna',
      params: PARAMS,
    });
    state = explainChatReducer(state, { type: 'ANCHOR_START', char: '编' });
    state = explainChatReducer(state, { type: 'ANCHOR_FAIL', char: '编', message: '第一次：服务不可用' });
    expect(state.threads['编']?.turns).toHaveLength(1);
    expect(state.threads['编']?.turns[0].attempt).toBe(1);

    // 重试：开始请求时先收掉旧提示（避免骨架与失败提示并列）
    state = explainChatReducer(state, { type: 'ANCHOR_START', char: '编' });
    expect(state.threads['编']?.turns).toHaveLength(0);

    state = explainChatReducer(state, { type: 'ANCHOR_FAIL', char: '编', message: '第二次：候选集不符' });
    state = explainChatReducer(state, { type: 'ANCHOR_START', char: '编' });
    state = explainChatReducer(state, { type: 'ANCHOR_FAIL', char: '编', message: '第三次：候选集不符' });
    const thread = state.threads['编'];
    expect(thread?.turns).toHaveLength(1);
    expect(thread?.anchorAttempts).toBe(3);
    expect(thread?.turns[0].attempt).toBe(3);
    expect(thread?.turns[0].noticeKind).toBe('anchor-fail');

    // 成功一次即归零
    state = explainChatReducer(state, {
      type: 'ANCHOR_OK',
      char: '编',
      text: '讲清楚了',
      verification: 'ok',
      positions: ['纟'],
      conversationId: 'conv_x',
      turn: 1,
    });
    expect(state.threads['编']?.anchorAttempts).toBe(0);
  });

  it('preemptedChar：切换到别的字时必须复位原字，同一个字则不动', () => {
    expect(preemptedChar('照', '牡')).toBe('照');
    expect(preemptedChar('照', '照')).toBeNull();
    expect(preemptedChar(null, '照')).toBeNull();
    expect(preemptedChar(undefined, '照')).toBeNull();
  });
});

describe('选择器与文本切分', () => {
  it('splitSentences 按句末标点与换行切分', () => {
    expect(splitSentences('第一句。第二句！\n第三句')).toEqual(['第一句。', '第二句！', '第三句']);
  });

  it('latestAssistantTurnId 取最后一条 AI 回答（跳过用户与提示轮）', () => {
    let state = withAnchor();
    state = explainChatReducer(state, { type: 'ASK', char: '照', question: '为什么？' });
    state = explainChatReducer(state, { type: 'ANSWER_OK', char: '照', payload: payload(), turn: 2 });
    state = explainChatReducer(state, { type: 'NOTICE', char: '照', text: '提示' });
    const thread = threadFor(state, '照');
    expect(latestAssistantTurnId(thread)).toBe(thread?.turns.at(-2)?.id);
  });

  it('没有锚定字时 activeThread 为 null', () => {
    expect(activeThread(INITIAL_EXPLAIN_CHAT_STATE)).toBeNull();
  });
});
