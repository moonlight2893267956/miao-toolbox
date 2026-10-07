/**
 * 输入延迟验收（Story 5.3 · NFR-1）
 *
 * 目标：`keydown` → 视觉反馈 ≤ 50ms。
 *
 * 同步 CPU 成本的主体是会话状态机（`handleAnswerKey` + 题源推进），
 * 这里直接量它；React 渲染与 DOM 提交另计（实测通常 1~3ms）。
 * 只要本项远低于 50ms，整体预算就有充足余量。
 *
 * 阈值取 5ms/键（预算的 1/10）：只拦截**数量级**回归，避免 CI 抖动误报。
 *
 * 三个容易写出假数据的坑，这里都规避了：
 * 1. 题量必须远大于按键数 —— 否则会话提前 finished，后续按键走
 *    `status !== running` 的早退分支，测出来是 1µs 的假快。
 * 2. 必须先预热 —— 首次调用包含 JIT 编译与题源首次构建，会把均值拉高一个量级。
 * 3. **各场景的每键成本不可直接互比**：答错的键不推进题源，因此
 *    「含错误按键」的数字天然低于「全部答对」。以**全部答对**为准
 *    （它是上界），这也是下面把该场景放在首位的原因。
 *
 * 另外 QUESTION_POOL 取 5000，远大于应用实际的 ROUND_SIZE=20 ——
 * 题源候选池越大推进越慢，因此这里的数字是生产环境的保守上界。
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { buildCharMap, type CharMap } from './code';
import { createCharCodeSource, createPhraseCodeSource, type QuestionSource } from './questionSource';
import {
  createInitialSessionState,
  startSession,
  handleAnswerKey,
  type SessionState,
} from './session';

const KEY_BUDGET_MS = 5;
const SAMPLE_KEYS = 400;
/** 题量上限：远大于按键数，保证测量期间会话不会结束 */
const QUESTION_POOL = 5000;

let charMap: CharMap;

beforeAll(async () => {
  const chars = (await import('../../data/generated/chars.json')).default as unknown as {
    entries: [string, string, number, string?][];
  };
  charMap = buildCharMap(chars.entries);
});

interface KeyPressResult {
  perKeyMs: number;
  /** 真正被状态机处理的按键数（用于识别早退导致的假数据） */
  processed: number;
}

/**
 * 按给定位选择器跑一串按键，返回平均每键耗时。
 *
 * @param pickKey 依期望键与序号决定实际按下的键（返回相同值即答对）
 */
function runKeys(
  source: QuestionSource,
  pickKey: (expected: string, index: number) => string,
): KeyPressResult {
  let state: SessionState = startSession(createInitialSessionState(), source);
  let processed = 0;

  const started = performance.now();
  while (processed < SAMPLE_KEYS) {
    const question = state.currentQuestion;
    if (!question) break;

    const expected = question.answerKeys[state.inputKeys.length];
    if (expected == null) break;

    state = handleAnswerKey(state, source, 'drill', pickKey(expected, processed));
    processed += 1;
  }
  const elapsed = performance.now() - started;

  /*
   * 自检：会话若在测量期间结束，后续按键会走
   * `status !== running/feedback` 的早退分支，测出来异常快（假通过）。
   * 宁可让测试报错，也不要记录一个漂亮但无意义的数字。
   */
  if (state.status === 'finished') {
    throw new Error(
      `测量期间会话已结束（已处理 ${processed} 键），数据不可信 —— 请增大 QUESTION_POOL`,
    );
  }

  return { perKeyMs: elapsed / Math.max(1, processed), processed };
}

/** 预热一次（JIT + 题源首次构建），结果丢弃 */
function warmup(source: QuestionSource): void {
  runKeys(source, (expected) => expected);
}

describe('NFR-1 输入延迟', () => {
  it('单字练习：每键同步成本远低于 50ms', () => {
    warmup(createCharCodeSource({ count: QUESTION_POOL }, charMap));

    const result = runKeys(
      createCharCodeSource({ count: QUESTION_POOL }, charMap),
      (expected) => expected,
    );

    console.log(`  [perf] 单字模式 每键 ${(result.perKeyMs * 1000).toFixed(0)} µs（处理 ${result.processed} 键）`);
    // 若会话提前结束，测出来会异常快，这条断言防止「假通过」
    expect(result.processed).toBe(SAMPLE_KEYS);
    expect(result.perKeyMs).toBeLessThan(KEY_BUDGET_MS);
  });

  it('混合答错场景同样不超标（错误态分支更重）', () => {
    const makeSource = () => createCharCodeSource({ count: QUESTION_POOL }, charMap);
    warmup(makeSource());

    // 每 3 键故意错 1 次：覆盖错误态、连击重置与题源推进三条分支
    const result = runKeys(makeSource(), (expected, index) =>
      index % 3 === 0 ? (expected === 'a' ? 'b' : 'a') : expected);

    console.log(`  [perf] 含错按键 每键 ${(result.perKeyMs * 1000).toFixed(0)} µs（处理 ${result.processed} 键）`);
    expect(result.processed).toBe(SAMPLE_KEYS);
    expect(result.perKeyMs).toBeLessThan(KEY_BUDGET_MS);
  });

  it('词组模式不因题源切分而变慢', async () => {
    const phrases = (await import('../../data/generated/phrases-2.json')).default as unknown as {
      entries: [string, string][];
    };
    const phraseMap = new Map(phrases.entries);
    const makeSource = () => createPhraseCodeSource({ length: 2, count: QUESTION_POOL }, phraseMap);
    warmup(makeSource());

    const result = runKeys(makeSource(), (expected) => expected);

    console.log(`  [perf] 词组模式 每键 ${(result.perKeyMs * 1000).toFixed(0)} µs（处理 ${result.processed} 键）`);
    expect(result.processed).toBe(SAMPLE_KEYS);
    expect(result.perKeyMs).toBeLessThan(KEY_BUDGET_MS);
  });

  it('会话状态构造是纯函数（不修改入参，便于 React 快速比较）', () => {
    const source = createCharCodeSource({ count: 20 }, charMap);
    const state = startSession(createInitialSessionState(), source);
    const before = JSON.stringify(state);

    const question = state.currentQuestion!;
    handleAnswerKey(state, source, 'drill', question.answerKeys[0]);

    expect(JSON.stringify(state)).toBe(before);
  });
});
