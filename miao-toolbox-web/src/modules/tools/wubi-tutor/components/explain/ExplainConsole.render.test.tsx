/**
 * 讲解台的结构级渲染快照（服务端渲染，不依赖 jsdom）。
 *
 * 本仓库的 vitest 是 node 环境、没有 React Testing Library，所以「组件长什么样」
 * 一直缺一层自动化保护。这里用 `react-dom/server` 把组件渲染成 HTML 字符串再断言
 * —— 覆盖不到交互，但足以锁住最容易回归的东西：
 * 徽标是否出现、未核验断言是否单独成块、修正前后是否都渲染、输入框与提示是否就位。
 *
 * 交互（点击、IME、分段切换）由 `scripts/headless-check-wt-5-5-ai-explain-chat.py`
 * 在真实浏览器里覆盖。
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ExplainConsole from './ExplainConsole';
import type { UseWubiExplainChatResult } from '../../utils/wubi/useWubiAI';
import type { ExplainChatState, ExplainThread } from '../../utils/wubi/explainChat';
import type { WubiExplainParams } from '../../utils/wubi/aiExplain';
import type { WubiPhraseExplainParams } from '../../utils/wubi/phraseExplain';

const PARAMS: WubiExplainParams = {
  task: 'explain-split',
  char: '照',
  code: 'jvko',
  positions: [
    { index: 0, key: 'j', candidates: [{ glyph: '日', name: '日字' }, { glyph: '曰', name: '曰字' }] },
    { index: 1, key: 'v', candidates: [{ glyph: '刀', name: '刀字' }] },
  ],
  notes: [],
};

/** 词组锚点的首轮参数：「编码」逐位取自「编」与「码」 */
const PHRASE_PARAMS: WubiPhraseExplainParams = {
  task: 'explain-phrase',
  char: '编码',
  phrase: '编码',
  code: 'xydc',
  ruleLabel: '二字词 · 每字取前 2 码',
  derivedCode: 'xydc',
  matchesTable: true,
  positions: [
    {
      index: 0, key: 'x', fromChar: '编', charIndex: 0, charCodeIndex: 0,
      candidates: [{ glyph: '纟', name: '绞丝旁' }],
    },
    {
      index: 1, key: 'y', fromChar: '编', charIndex: 0, charCodeIndex: 1,
      candidates: [{ glyph: '丶', name: '点' }, { glyph: '亠', name: '点横头' }],
    },
    {
      index: 2, key: 'd', fromChar: '码', charIndex: 1, charCodeIndex: 0,
      candidates: [{ glyph: '石', name: '石字旁' }],
    },
    {
      index: 3, key: 'c', fromChar: '码', charIndex: 1, charCodeIndex: 1,
      candidates: [{ glyph: '马', name: '马字' }],
    },
  ],
  skippedChars: [],
  notes: [],
};

function thread(overrides: Partial<ExplainThread> = {}): ExplainThread {
  return {
    char: '照',
    code: 'jvko',
    kind: 'char',
    ruleLabel: null,
    params: PARAMS,
    positions: ['日', '刀'],
    conversationId: 'conv_1',
    historyTruncated: false,
    status: 'ready',
    error: null,
    turns: [],
    asked: [],
    anchorAttempts: 0,
    ...overrides,
  };
}

/** 词组锚点的线程 */
function phraseThread(overrides: Partial<ExplainThread> = {}): ExplainThread {
  return thread({
    char: '编码',
    code: 'xydc',
    kind: 'phrase',
    ruleLabel: PHRASE_PARAMS.ruleLabel,
    params: PHRASE_PARAMS,
    positions: ['纟', '丶', '石', '马'],
    ...overrides,
  });
}

/** 造一个最小可用 chat 对象；未用到的字段给保守值 */
function chat(t: ExplainThread | null, overrides: Partial<UseWubiExplainChatResult> = {}): UseWubiExplainChatResult {
  const state: ExplainChatState = {
    activeChar: t?.char ?? null,
    threads: t ? { [t.char]: t } : {},
  };
  return {
    state,
    thread: t,
    activeChar: t?.char ?? null,
    aiUnavailable: null,
    notice: null,
    dismissNotice: () => {},
    selectChar: () => {},
    selectPhrase: () => {},
    startExplain: () => {},
    ask: () => {},
    restart: () => {},
    cancel: () => {},
    busy: t?.status === 'loading' || t?.status === 'asking',
    hasAnswer: Boolean(t?.turns.some((x) => x.kind === 'anchor')),
    turnCount: t?.turns.filter((x) => x.role === 'assistant').length ?? 0,
    followupEnabled: Boolean(t?.conversationId),
    ...overrides,
  };
}

const render = (c: UseWubiExplainChatResult) =>
  renderToStaticMarkup(
    React.createElement(ExplainConsole, {
      chat: c,
      autoExplain: true,
      onToggleAutoExplain: () => {},
      onOpenSplitDemo: () => {},
    }),
  );

describe('ExplainConsole — 空态', () => {
  it('未选锚点时说明用途，并给出「选中即讲解」开关', () => {
    const html = render(chat(null));
    expect(html).toContain('选一个汉字或词组，讲解会在这里开始');
    expect(html).toContain('选中后自动开始讲解');
  });
});

describe('ExplainConsole — 首轮讲解', () => {
  const anchor = thread({
    turns: [
      {
        id: 'a1',
        turn: 1,
        role: 'assistant',
        text: '「照」拆成日、刀、口、灬。',
        kind: 'anchor',
        citations: [],
        newClaims: [],
        verification: 'ok',
      },
    ],
  });

  it('渲染锚点字、全码、轮次数与「新会话」', () => {
    const html = render(chat(anchor));
    expect(html).toContain('wt-chat__anchor');
    expect(html).toContain('jvko');
    expect(html).toContain('已完成 1 轮');
    expect(html).toContain('新会话');
    expect(html).toContain('首轮讲解');
  });

  it('有首轮讲解时输入框可用，并带无障碍标签', () => {
    const html = render(chat(anchor));
    expect(html).toContain('aria-label="继续追问"');
    expect(html).toContain('Enter 发送');
    expect(html).not.toContain('开始讲解「照」');
  });

  it('快捷追问按候选集生成，且「纠正」项排在最后', () => {
    const html = render(chat(anchor));
    expect(html).toContain('第 1 位为何取「日」');
    expect(html).toContain('第 1 位应该是「曰」');
  });
});

describe('ExplainConsole — 词组锚点', () => {
  const phraseTurn = {
    id: 'p1',
    turn: 1,
    role: 'assistant' as const,
    text: '「编码」的五笔编码是 xydc（二字词 · 每字取前 2 码：编 xy + 码 dc）。',
    kind: 'anchor' as const,
    citations: [],
    newClaims: [],
    verification: 'ok' as const,
  };

  it('锚点栏显示词组原文、「词组」标记、取码规则与词表码', () => {
    const html = render(chat(phraseThread({ turns: [phraseTurn] })));
    expect(html).toContain('wt-chat__anchor--phrase');
    expect(html).toContain('词组');
    expect(html).toContain('二字词 · 每字取前 2 码');
    expect(html).toContain('xydc');
    expect(html).toContain('已完成 1 轮');
  });

  it('逐位来源以「第 N 位（字 X 第 j 码）」标注在正文之前', () => {
    const html = render(chat(phraseThread({ turns: [phraseTurn] })));
    expect(html).toContain('wt-chat__origins');
    expect(html).toContain('第 1 位（「编」第 1 码）');
    expect(html).toContain('第 3 位（「码」第 1 码）');
  });

  it('词组没有「拆分」入口（不是靠字根拼出来的），但保留「新会话」', () => {
    const html = render(chat(phraseThread({ turns: [phraseTurn] })));
    expect(html).not.toContain('打开拆分演示');
    expect(html).toContain('新会话');
  });

  it('词组核对不通过：退回确定性视图，只留最新一条失败提示', () => {
    const t = phraseThread({
      status: 'error',
      turns: [
        {
          id: 'n1',
          turn: 0,
          role: 'notice',
          text: '这次没能生成讲解：第 2 位字根「扁」不在「编」第 2 码（y 键）的候选里（丶/亠）',
          kind: 'notice',
          noticeKind: 'anchor-fail',
          attempt: 1,
          failReason: 'validation',
          citations: [],
          newClaims: [],
          error: '第 2 位字根不符',
        },
      ],
    });
    const html = render(chat(t));
    expect(html).toContain('重试讲解');
    expect(html).toContain('第 2 位字根「扁」不在');
    expect(html).toContain('这不是网络问题');
    expect(html.match(/这次没能生成讲解/g)?.length).toBe(1);
    expect(html).toMatch(/<textarea[^>]*disabled/);
    // 词组没有拆分演示：失败后的下一步不能指向它，而要指向左侧的取码推导行
    expect(html).toContain('可看左侧的取码推导行');
    expect(html).not.toContain('右上「拆分」');
  });

  it('单字链路不受影响：不渲染词组事实行', () => {
    const html = render(chat(thread({ turns: [phraseTurn] })));
    expect(html).not.toContain('wt-chat__origins');
    expect(html).toContain('打开拆分演示');
  });
});

describe('ExplainConsole — 追问轮的可信度分层', () => {
  it('修正被采纳：田字格 before→after 都要渲染', () => {
    const t = thread({
      turns: [
        {
          id: 'a1',
          turn: 1,
          role: 'assistant',
          text: '首轮',
          kind: 'anchor',
          citations: [],
          newClaims: [],
          verification: 'ok',
        },
        {
          id: 'a2',
          turn: 2,
          role: 'assistant',
          text: '已按你的主张修正这一位。',
          kind: 'revise',
          accepted: true,
          revision: { index: 1, key: 'v', from: '刀', to: '九', candidates: ['刀', '九'] },
          citations: [],
          newClaims: [],
          verification: 'ok',
          basedOnTurn: 1,
        },
      ],
    });
    const html = render(chat(t));
    expect(html).toContain('位次修正');
    expect(html).toContain('基于第 1 轮');
    expect(html).toContain('wt-chat__delta-from');
    expect(html).toContain('刀');
    expect(html).toContain('九');
  });

  it('引用与「未经交叉核验」分区呈现，且未核验块有明确文案', () => {
    const t = thread({
      turns: [
        {
          id: 'a1',
          turn: 2,
          role: 'assistant',
          text: '因为字形上是「日」。',
          kind: 'reasoned',
          citations: ['第 1 轮 positions[0].reason'],
          newClaims: ['「曰」在 J 键上'],
          verification: 'ok',
        },
      ],
    });
    const html = render(chat(t));
    expect(html).toContain('依据');
    expect(html).toContain('第 1 轮 positions[0].reason');
    expect(html).toContain('未经交叉核验');
    expect(html).toContain('「曰」在 J 键上');
  });

  it('模型没有引用时标「未附依据」，核对不通过时标「未通过核对」', () => {
    const strong = render(
      chat(
        thread({
          turns: [
            {
              id: 'a1',
              turn: 2,
              role: 'assistant',
              text: '这是一段没有出处的说明。',
              kind: 'reasoned',
              citations: [],
              newClaims: [],
              verification: 'unverified',
            },
          ],
        }),
      ),
    );
    expect(strong).toContain('未附依据');

    const failed = render(
      chat(
        thread({
          turns: [
            {
              id: 'a1',
              turn: 2,
              role: 'assistant',
              text: '第 2 位改为「土」。',
              kind: 'revise',
              accepted: true,
              revision: { index: 1, key: 'v', from: '刀', to: '土', candidates: ['刀', '九'] },
              citations: [],
              newClaims: [],
              verification: 'failed',
            },
          ],
        }),
      ),
    );
    expect(failed).toContain('未通过核对');
    expect(failed).toContain('候选：刀/九');
  });

  it('降级回答标「离线回答」；用户提问带「问」标记', () => {
    const t = thread({
      turns: [
        {
          id: 'u1',
          turn: 0,
          role: 'user',
          question: '第 1 位为什么取日？',
          text: '第 1 位为什么取日？',
          kind: 'notice',
          citations: [],
          newClaims: [],
        },
        {
          id: 'a1',
          turn: 2,
          role: 'assistant',
          text: '本次未能调用模型，以下为基于上一轮历史的确定性回答。',
          kind: 'why',
          citations: [],
          newClaims: [],
          fallback: true,
          verification: 'ok',
        },
      ],
    });
    const html = render(chat(t));
    expect(html).toContain('wt-chat__turn--ask');
    expect(html).toContain('离线回答');
  });
});

describe('ExplainConsole — 失败与降级', () => {
  it('首轮失败：给出重试入口，输入框不可用（没有可追问的上下文）', () => {
    const t = thread({
      status: 'error',
      turns: [
        {
          id: 'n1',
          turn: 0,
          role: 'notice',
          text: '这次没能生成讲解：AI 服务不可用',
          kind: 'notice',
          citations: [],
          newClaims: [],
          error: 'AI 服务不可用',
        },
      ],
    });
    const html = render(chat(t));
    expect(html).toContain('重试讲解');
    // 收窄断言：不是「页面里出现 disabled」，而是**输入框与发送键**确实被禁用
    expect(html).toMatch(/<textarea[^>]*class="wt-chat__input"[^>]*disabled/);
    expect(html).toMatch(/<button type="submit"[^>]*disabled/);
  });

  it('重试失败只留最新一条提示，并标出第几次尝试（不堆成一堵失败墙）', () => {
    const t = thread({
      status: 'error',
      anchorAttempts: 2,
      turns: [
        {
          id: 'n1',
          turn: 0,
          role: 'notice',
          text: '这次没能生成讲解：第 2 位字根「扁」不在 y 键的候选里（言/讠/文/方/广/亠/丶）',
          kind: 'notice',
          noticeKind: 'anchor-fail',
          attempt: 2,
          citations: [],
          newClaims: [],
          error: '第 2 位字根「扁」不在 y 键的候选里',
        },
      ],
    });
    const html = render(chat(t));
    expect(html).toContain('第 2 次尝试');
    expect(html).toContain('重试讲解');
    // 只有一条失败提示（不是每轮一条）
    expect(html.match(/这次没能生成讲解/g)?.length).toBe(1);
  });

  it('单字核对不通过：仍指向「拆分」这一确定性视图', () => {
    const t = thread({
      status: 'error',
      turns: [
        {
          id: 'n1',
          turn: 0,
          role: 'notice',
          text: '这次没能生成讲解：第 2 位字根「扁」不在 v 键的候选里',
          kind: 'notice',
          noticeKind: 'anchor-fail',
          attempt: 1,
          failReason: 'validation',
          citations: [],
          newClaims: [],
          error: '第 2 位字根不符',
        },
      ],
    });
    const html = render(chat(t));
    expect(html).toContain('这不是网络问题');
    expect(html).toContain('可先点右上「拆分」看确定性拆分');
  });

  it('AI 配置不可用：明确说明且不影响查码（提示里点出这一点）', () => {
    const html = render(
      chat(thread({ status: 'error' }), { aiUnavailable: 'Agent 未配置' }),
    );
    expect(html).toContain('AI 讲解当前不可用');
    expect(html).toContain('查码、拆分演示与练习不受影响');
  });

  it('多轮未启用时提示条可见', () => {
    const html = render(chat(thread({ status: 'error' }), { notice: '当前会话未启用多轮追问' }));
    expect(html).toContain('当前会话未启用多轮追问');
  });

  it('等待中显示「正在结合上文回答…」与取消入口', () => {
    const t = thread({
      status: 'asking',
      turns: [
        {
          id: 'a1',
          turn: 1,
          role: 'assistant',
          text: '首轮',
          kind: 'anchor',
          citations: [],
          newClaims: [],
          verification: 'ok',
        },
      ],
    });
    const html = render(chat(t));
    expect(html).toContain('正在结合上文回答');
    expect(html).toContain('取消');
  });

  it('关闭自动讲解且未开始时，给出「开始讲解」按钮', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExplainConsole, {
        chat: chat(thread()),
        autoExplain: false,
        onToggleAutoExplain: () => {},
        onOpenSplitDemo: () => {},
      }),
    );
    expect(html).toContain('开始讲解「照」');
    // 开关常驻输入区（关着 → 不出现 checked）
    expect(html).toContain('选中即讲解');
    expect(html).not.toContain('checked=""');
  });

  it('会话已开始时开关仍可达（不会因为开讲就消失）', () => {
    const t = thread({
      turns: [
        {
          id: 'a1',
          turn: 1,
          role: 'assistant',
          text: '首轮讲解正文',
          kind: 'anchor',
          citations: [],
          newClaims: [],
          verification: 'ok',
        },
      ],
    });
    const html = render(chat(t));
    expect(html).toContain('选中即讲解');
    expect(html).toContain('checked=""');
  });
});
