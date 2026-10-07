/**
 * 会话状态机单测
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialSessionState,
  startSession,
  isCorrectKey,
  handleAnswerKey,
  retryCurrentQuestion,
  skipCurrentQuestion,
  computeSessionResult,
  toReviewChar,
  confirmShortAnswer,
  getExpectedKey,
} from './session';
import {
  createKeyDrillSource,
  createCharCodeSource,
  type QuestionSource,
  type Question,
} from './questionSource';
import { buildCharMap, type CharMap } from './code';

// 辅助：构造一个可控的题源（按顺序出题）
function createMockSource(questions: Question[]): QuestionSource {
  const idx = 0;
  return {
    id: 'mock',
    mode: 'char-code',
    finite: true,
    init: () => ({ index: 0, total: questions.length, internal: { idx } }),
    next: (state) => {
      const internal = state.internal as { idx: number };
      const q = questions[internal.idx % questions.length];
      internal.idx++;
      return { ...q, id: `${q.id}-${state.index}` };
    },
  };
}

const TEST_CHARS: [string, string, number, string?][] = [
  ['王', 'gggg', 0],
  ['的', 'rqyy', 1, 'r'],
  ['大', 'dddd', 2, 'dd'],
  ['到', 'gcfg', 2, 'gc'],
];

const CHAR_MAP: CharMap = buildCharMap(TEST_CHARS);

describe('createInitialSessionState', () => {
  it('初始状态为 idle', () => {
    const state = createInitialSessionState();
    expect(state.status).toBe('idle');
    expect(state.currentQuestion).toBeNull();
    expect(state.inputKeys).toHaveLength(0);
    expect(state.totalKeystrokes).toBe(0);
  });
});

describe('startSession', () => {
  it('从 idle 转为 running', () => {
    const source = createKeyDrillSource({ scope: 'all', count: 10 });
    const state = startSession(createInitialSessionState(), source);

    expect(state.status).toBe('running');
    expect(state.currentQuestion).not.toBeNull();
    expect(state.currentQuestion!.mode).toBe('key-drill');
    expect(state.inputKeys).toHaveLength(0);
  });

  it('重置统计计数', () => {
    const source = createKeyDrillSource({ scope: 'all', count: 10 });
    const dirty = { ...createInitialSessionState(), totalKeystrokes: 100, completedCount: 5 };
    const state = startSession(dirty, source);

    expect(state.totalKeystrokes).toBe(0);
    expect(state.completedCount).toBe(0);
  });
});

describe('isCorrectKey', () => {
  it('正确键返回 true', () => {
    const question: Question = {
      id: 'q1', mode: 'char-code', prompt: '王',
      answerKeys: ['g', 'g', 'g', 'g'],
    };
    expect(isCorrectKey(question, [], 'g')).toBe(true);
  });

  it('错误键返回 false', () => {
    const question: Question = {
      id: 'q1', mode: 'char-code', prompt: '王',
      answerKeys: ['g', 'g', 'g', 'g'],
    };
    expect(isCorrectKey(question, [], 'f')).toBe(false);
  });

  it('检查正确位置', () => {
    const question: Question = {
      id: 'q1', mode: 'char-code', prompt: '到',
      answerKeys: ['g', 'c'],
    };
    expect(isCorrectKey(question, ['g'], 'c')).toBe(true);  // 第二位 c
    expect(isCorrectKey(question, ['g'], 'g')).toBe(false);  // 第二位不是 g
  });

  it('备选答案（简码）判对', () => {
    const question: Question = {
      id: 'q1', mode: 'char-code', prompt: '的',
      answerKeys: ['r', 'q', 'y', 'y'],  // 全码
      altAnswers: [['r']],               // 一级简码
    };
    expect(isCorrectKey(question, [], 'r')).toBe(true);
  });
});

describe('handleAnswerKey — drill 模式', () => {
  it('正确键追加到 inputKeys', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
    ];
    const source = createMockSource(questions);
    const state = startSession(createInitialSessionState(), source);

    const newState = handleAnswerKey(state, source, 'drill', 'g');
    expect(newState.inputKeys).toEqual(['g']);
    expect(newState.totalKeystrokes).toBe(1);
    expect(newState.combo).toBe(1);
    expect(newState.status).toBe('running');
  });

  it('错误键进入 errorState（drill 模式）', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
    ];
    const source = createMockSource(questions);
    const state = startSession(createInitialSessionState(), source);

    const newState = handleAnswerKey(state, source, 'drill', 'f');
    expect(newState.inErrorState).toBe(true);
    expect(newState.status).toBe('feedback');
    expect(newState.errorKeystrokes).toBe(1);
    expect(newState.combo).toBe(0);
    expect(newState.wrongKeys).toContain('f');
  });

  it('错误态下再按键可重新作答（不会死锁）', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
    ];
    const source = createMockSource(questions);
    const state = startSession(createInitialSessionState(), source);

    // 第一次按错
    const errorState = handleAnswerKey(state, source, 'drill', 'f');
    expect(errorState.inErrorState).toBe(true);
    expect(errorState.status).toBe('feedback');

    // 再次按键：应清空错误态并接受这一键（第 1 位本来就是空的）
    const retried = handleAnswerKey(errorState, source, 'drill', 'g');
    expect(retried.inErrorState).toBe(false);
    expect(retried.status).toBe('running');
    expect(retried.inputKeys).toEqual(['g']);
  });

  it('错误态下再次按错仍可继续重试', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
    ];
    const source = createMockSource(questions);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 'f'); // 错
    state = handleAnswerKey(state, source, 'drill', 'a'); // 又错
    state = handleAnswerKey(state, source, 'drill', 'g'); // 对

    expect(state.inputKeys).toEqual(['g']);
    expect(state.errorKeystrokes).toBe(2);
    expect(state.inErrorState).toBe(false);
  });

  it('错误后完整作答仍能推进到下一题', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
      { id: 'q2', mode: 'char-code', prompt: '大', answerKeys: ['d', 'd'] },
    ];
    const source = createMockSource(questions);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 'f'); // 错
    state = handleAnswerKey(state, source, 'drill', 'g'); // 重来：对
    state = handleAnswerKey(state, source, 'drill', 'c'); // 对 → 完成本题

    expect(state.completedCount).toBe(1);
    expect(state.currentQuestion!.prompt).toBe('大');
  });

  it('完成后进入下一题', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
      { id: 'q2', mode: 'char-code', prompt: '大', answerKeys: ['d', 'd'] },
    ];
    const source = createMockSource(questions);
    const state = startSession(createInitialSessionState(), source);

    let s = handleAnswerKey(state, source, 'drill', 'g');
    s = handleAnswerKey(s, source, 'drill', 'c');

    expect(s.completedCount).toBe(1);
    expect(s.currentQuestion!.prompt).toBe('大');
    expect(s.inputKeys).toHaveLength(0);
    expect(s.combo).toBe(2);
  });

  it('全部完成后进入 finished', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
    ];
    const source = createMockSource(questions);
    const state = startSession(createInitialSessionState(), source);

    let s = handleAnswerKey(state, source, 'drill', 'g');
    s = handleAnswerKey(s, source, 'drill', 'c');

    expect(s.status).toBe('finished');
    expect(s.completedCount).toBe(1);
  });

  /*
   * ── 错字入队（用户反馈回归）──
   *
   * 现象：练了一大堆错字，复习页却一直是空的。
   * 根因：给 wrongChars 赋值的地方只在 lenient 分支与 skipCurrentQuestion，
   * drill 的上屏路径（advanceAfterCorrect）整个漏了 —— 而练习与复习**都**跑
   * drill，于是按错键永远进不了错题本，只有「跳过」才入队。
   */
  it('错过的题在上屏时进入错题本（回归：drill 曾完全不入队）', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
      { id: 'q2', mode: 'char-code', prompt: '大', answerKeys: ['d', 'd'] },
    ];
    const source = createMockSource(questions);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 'f'); // 错
    state = handleAnswerKey(state, source, 'drill', 'g'); // 重来：对
    state = handleAnswerKey(state, source, 'drill', 'c'); // 对 → 本题上屏

    expect(state.wrongChars).toEqual(['到']);
    // 只错了一次也照收，且「练过的字」同时记录（两者语义不同，都要有）
    expect(state.attemptedChars).toContain('到');
  });

  it('一次答对的题不进错题本', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
    ];
    const source = createMockSource(questions);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 'g');
    state = handleAnswerKey(state, source, 'drill', 'c');

    expect(state.wrongChars).toEqual([]);
  });

  it('最后一题错过但答对 → finished 时已入队（整轮落盘依赖这条）', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
    ];
    const source = createMockSource(questions);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 'f'); // 错
    state = handleAnswerKey(state, source, 'drill', 'g');
    state = handleAnswerKey(state, source, 'drill', 'c');

    expect(state.status).toBe('finished');
    // 会话结束才写盘（recordSession），所以 finished 这条路径必须带上错字
    expect(state.wrongChars).toEqual(['到']);
  });

  it('同一题错多次只入队一次（去重）', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
    ];
    const source = createMockSource(questions);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 'f'); // 错
    state = handleAnswerKey(state, source, 'drill', 'f'); // 再错
    state = handleAnswerKey(state, source, 'drill', 'g');
    state = handleAnswerKey(state, source, 'drill', 'c');

    expect(state.wrongChars).toEqual(['到']);
    // 但「出错的题数」按次数无关地只算 1 题
    expect(state.wrongQuestionCount).toBe(1);
  });

  it('非单字题（键位 / 字根类）即使出错也不进错题本', () => {
    const questions: Question[] = [
      { id: 'k1', mode: 'key-drill', prompt: 'G', answerKeys: ['g'] },
    ];
    const source = createMockSource(questions);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 'h'); // 错
    state = handleAnswerKey(state, source, 'drill', 'g'); // 对 → 上屏

    // 错题本是「汉字」本：题面不是单字就无处可放（见 toReviewChar）
    expect(toReviewChar(questions[0])).toBeNull();
    expect(state.wrongChars).toEqual([]);
  });

  it('同一个字在 drill 与 lenient 下得到相同的错题结果（本文件的核心约定）', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
      { id: 'q2', mode: 'char-code', prompt: '大', answerKeys: ['d', 'd'] },
    ];

    // 重试与上屏必须用同一个题源实例（题源内部有游标）
    const drillSource = createMockSource(questions);
    let drill = startSession(createInitialSessionState(), drillSource);
    drill = handleAnswerKey(drill, drillSource, 'drill', 'f');
    drill = handleAnswerKey(drill, drillSource, 'drill', 'g');
    drill = handleAnswerKey(drill, drillSource, 'drill', 'c');

    const lenientSource = createMockSource(questions);
    let lenient = startSession(createInitialSessionState(), lenientSource);
    lenient = handleAnswerKey(lenient, lenientSource, 'lenient', 'f');

    // 提交方式不同（重打 vs 直接跳题），但入队结果必须一致
    expect(drill.wrongChars).toEqual(lenient.wrongChars);
  });
});

describe('handleAnswerKey — lenient 模式', () => {
  it('错误键跳过并记录', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
      { id: 'q2', mode: 'char-code', prompt: '大', answerKeys: ['d', 'd'] },
    ];
    const source = createMockSource(questions);
    const state = startSession(createInitialSessionState(), source);

    const newState = handleAnswerKey(state, source, 'lenient', 'f');

    expect(newState.inErrorState).toBe(false);
    expect(newState.wrongChars).toContain('到');
    expect(newState.completedCount).toBe(1);
    expect(newState.currentQuestion!.prompt).toBe('大');
  });
});

describe('retryCurrentQuestion', () => {
  /*
   * 回归：重试**不得**清空已打对的编码。
   *
   * 这里曾经把 inputKeys 截断回退（单字模式回退到 0，即整题重打），
   * 与错误提示条给出的「出错那一位的正确键」互相矛盾 —— 用户照着提示
   * 按下去，那一键会被拿去和第 1 位比较，于是立刻再判一次错、
   * 字符再次标红，并且已打对的前缀也被清掉。
   */
  it('清除 errorState，但保留已打对的编码', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
    ];
    const source = createMockSource(questions);
    const state = startSession(createInitialSessionState(), source);
    const typedFirst = handleAnswerKey(state, source, 'drill', 'g'); // 第 1 位正确
    const errorState = handleAnswerKey(typedFirst, source, 'drill', 'f'); // 第 2 位错误

    expect(errorState.inErrorState).toBe(true);
    expect(errorState.inputKeys).toEqual(['g']); // 错误键不入队

    const retried = retryCurrentQuestion(errorState);
    expect(retried.inErrorState).toBe(false);
    expect(retried.status).toBe('running');
    // 关键：第 1 位仍然保留，位置不后退
    expect(retried.inputKeys).toEqual(['g']);
  });

  it('照着错误提示给出的键按下去应当被接受（用户反馈回归）', () => {
    /*
     * 完整复现反馈路径：
     * 打对第 1 位 → 第 2 位按错 → 提示给出**该位**的正确键 → 按它
     * → 必须继续前进，而不是再判一次错。
     */
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '筒', answerKeys: ['t', 'm', 'g', 'k'] },
    ];
    const source = createMockSource(questions);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 't'); // 第 1 位正确
    expect(state.inputKeys).toEqual(['t']);

    state = handleAnswerKey(state, source, 'drill', 'q'); // 第 2 位按错
    expect(state.inErrorState).toBe(true);
    // 提示条展示的就是这一位
    const hinted = getExpectedKey(state.currentQuestion!, state.inputKeys.length);
    expect(hinted).toBe('m');

    state = handleAnswerKey(state, source, 'drill', hinted); // 照提示按

    expect(state.inErrorState).toBe(false);
    expect(state.inputKeys).toEqual(['t', 'm']); // 前缀保留 + 位置前进
  });

  it('按空格重试同样保留前缀（confirmShortAnswer 路径）', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '筒', answerKeys: ['t', 'm', 'g', 'k'] },
    ];
    const source = createMockSource(questions);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 't');
    state = handleAnswerKey(state, source, 'drill', 'q'); // 错误
    state = confirmShortAnswer(state, source); // 空格

    expect(state.inErrorState).toBe(false);
    expect(state.inputKeys).toEqual(['t']);
  });
});

describe('skipCurrentQuestion', () => {
  it('跳过当前题并记录到错题', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
      { id: 'q2', mode: 'char-code', prompt: '大', answerKeys: ['d', 'd'] },
    ];
    const source = createMockSource(questions);
    const state = startSession(createInitialSessionState(), source);

    const newState = skipCurrentQuestion(state, source);

    expect(newState.wrongChars).toContain('到');
    expect(newState.completedCount).toBe(1);
    expect(newState.currentQuestion!.prompt).toBe('大');
    expect(newState.status).toBe('running');
  });

  it('最后一题跳过后进入 finished', () => {
    const questions: Question[] = [
      { id: 'q1', mode: 'char-code', prompt: '到', answerKeys: ['g', 'c'] },
    ];
    const source = createMockSource(questions);
    const state = startSession(createInitialSessionState(), source);

    const newState = skipCurrentQuestion(state, source);

    expect(newState.status).toBe('finished');
  });
});

describe('computeSessionResult', () => {
  it('正确计算指标', () => {
    const state = {
      ...createInitialSessionState(),
      completedCount: 10,
      totalKeystrokes: 50,
      errorKeystrokes: 5,
      wrongChars: ['啊', '的'],
      // 错题数与错字集必须分开提供：准确率按「题」算，不按「去重单字」算
      wrongQuestionCount: 2,
      wrongKeys: ['k', 'r'],
      maxCombo: 8,
    };

    const result = computeSessionResult(state, 120); // 2 分钟

    expect(result.totalQuestions).toBe(10);
    expect(result.correctQuestions).toBe(8);
    expect(result.wrongQuestions).toBe(2);
    expect(result.accuracy).toBe(0.8);
    expect(result.speedPerMinute).toBe(4); // 8 字 / 2 分钟
    expect(result.maxCombo).toBe(8);
    expect(result.validKeystrokeRate).toBe(0.9); // 45 / 50
  });

  it('错题数按「题」算，不按「去重单字」算（回归）', () => {
    /*
     * 回归点：同一个字在两道题里各错一次时，去重集合只有 1 个元素。
     * 旧实现拿 wrongChars.length 当错题数 → 只算 1 题错、准确率虚高。
     * 正确语义是 2 题错。
     */
    const state = {
      ...createInitialSessionState(),
      completedCount: 10,
      wrongChars: ['啊'], // 去重后只剩 1 个字
      wrongQuestionCount: 3, // 但实际有 3 题出过错
    };

    const result = computeSessionResult(state, 60);

    expect(result.wrongQuestions).toBe(3);
    expect(result.correctQuestions).toBe(7);
    expect(result.accuracy).toBeCloseTo(0.7, 5);
  });

  it('错题数异常时不产生负数（钳位）', () => {
    const state = {
      ...createInitialSessionState(),
      completedCount: 1,
      wrongQuestionCount: 5, // 异常：错题数 > 完成题数
    };

    const result = computeSessionResult(state, 60);

    expect(result.correctQuestions).toBe(0);
    expect(result.accuracy).toBe(0);
    expect(result.speedPerMinute).toBe(0);
  });

  it('零击键不崩溃', () => {
    const state = createInitialSessionState();
    const result = computeSessionResult(state, 0);

    expect(result.accuracy).toBe(0);
    expect(result.speedPerMinute).toBe(0);
    expect(result.validKeystrokeRate).toBe(0);
  });
});

describe('createKeyDrillSource', () => {
  it('出题包含键位字母', () => {
    const source = createKeyDrillSource({ scope: 'all', count: 5 });
    const qState = source.init();
    const question = source.next(qState);

    expect(question.mode).toBe('key-drill');
    expect(question.answerKeys).toHaveLength(1);
    expect(question.answerKeys[0]).toMatch(/^[a-y]$/);
    expect(question.prompt).toMatch(/^[A-Y]$/);
  });

  it('限定分区只出该区键位', () => {
    const source = createKeyDrillSource({ scope: 'zone', zone: 'heng', count: 10 });
    const qState = source.init();
    const hengKeys = ['g', 'f', 'd', 's', 'a'];

    for (let i = 0; i < 10; i++) {
      const question = source.next(qState);
      expect(hengKeys).toContain(question.answerKeys[0]);
      qState.index++;
    }
  });
});

describe('createCharCodeSource', () => {
  it('出题包含汉字和编码', () => {
    const source = createCharCodeSource({ count: 5 }, CHAR_MAP);
    const qState = source.init();
    const question = source.next(qState);

    expect(question.mode).toBe('char-code');
    expect(question.prompt).toBeTruthy();
    expect(question.answerKeys.length).toBeGreaterThan(0);
  });

  it('简码字有 altAnswers', () => {
    const source = createCharCodeSource({ count: 10, chars: ['的'] }, CHAR_MAP);
    const qState = source.init();
    const question = source.next(qState);

    expect(question.prompt).toBe('的');
    expect(question.altAnswers).toBeDefined();
    expect(question.altAnswers![0]).toEqual(['r']);
    expect(question.hint).toContain('简码');
  });
});

/*
 * 以下两组是「错题本被污染」的回归测试。
 *
 * 背景：错题本条目 (`ReviewItem.char`) 是**单字**，复习时用
 * createCharCodeSource 去码表里查。若把词组 / 键名 / 文章摘要写进去，
 * 复习时查不到 → 该条目永远无法被清掉，「待复习 N」只增不减。
 */
describe('toReviewChar — 错题本条目过滤', () => {
  const mk = (prompt: string): Question => ({
    id: 'q', mode: 'char-code', prompt, answerKeys: ['a'],
  });

  it('单字通过（含字根）', () => {
    expect(toReviewChar(mk('啊'))).toBe('啊');
    // 字根认知模式的 prompt 是字根 glyph，多为单字，应当保留
    expect(toReviewChar(mk('王'))).toBe('王');
  });

  it('词组 / 键名 / 多字根 / 文章摘要一律过滤', () => {
    expect(toReviewChar(mk('中国'))).toBeNull(); // 词组
    expect(toReviewChar(mk('G'))).toBeNull(); // 键名（大写字母）
    expect(toReviewChar(mk('王 土'))).toBeNull(); // 多字根拼接
    expect(toReviewChar(mk('春天的花开满了山坡上…'))).toBeNull(); // 文章摘要
    expect(toReviewChar(mk(''))).toBeNull();
  });
});

describe('错题本不接收非单字题目（回归）', () => {
  const runLenient = (question: Question) => {
    const source = createMockSource([question]);
    const state = startSession(createInitialSessionState(), source);
    // lenient（文章模式）答错即跳题
    return handleAnswerKey(state, source, 'lenient', 'z');
  };

  it('词组模式答错：统计到错题数，但不写入错题队列', () => {
    const after = runLenient({
      id: 'q1', mode: 'phrase-code', prompt: '中国', answerKeys: ['k', 'h'],
    });

    expect(after.completedCount).toBe(1);
    expect(after.wrongQuestionCount).toBe(1);
    // 关键：不能让「中国」进入错题本
    expect(after.wrongChars).toEqual([]);
    expect(after.attemptedChars).toEqual([]);
  });

  it('键位模式答错（prompt 是键名 "G"）同样不写入', () => {
    const after = runLenient({
      id: 'q1', mode: 'key-drill', prompt: 'G', answerKeys: ['g'],
    });

    expect(after.wrongChars).toEqual([]);
    expect(after.wrongQuestionCount).toBe(1);
  });

  it('单字模式答错照常写入', () => {
    const after = runLenient({
      id: 'q1', mode: 'char-code', prompt: '啊', answerKeys: ['k'],
    });

    expect(after.wrongChars).toEqual(['啊']);
    expect(after.attemptedChars).toEqual(['啊']);
    expect(after.wrongQuestionCount).toBe(1);
  });

  it('drill 模式同一题错多次，错题数只记 1', () => {
    const source = createMockSource([
      { id: 'q1', mode: 'char-code', prompt: '啊', answerKeys: ['k', 'k'] },
    ]);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 'z');
    state = handleAnswerKey(state, source, 'drill', 'z');
    state = handleAnswerKey(state, source, 'drill', 'z');

    expect(state.currentQuestionErrors).toBe(3);
    expect(state.wrongQuestionCount).toBe(1);
  });

  it('跳过的题计入错题数，非单字仍不入队', () => {
    const source = createMockSource([
      { id: 'q1', mode: 'phrase-code', prompt: '中国', answerKeys: ['k', 'h'] },
      { id: 'q2', mode: 'phrase-code', prompt: '地方', answerKeys: ['f', 'y'] },
    ]);
    const state = startSession(createInitialSessionState(), source);

    const after = skipCurrentQuestion(state, source);

    expect(after.wrongQuestionCount).toBe(1);
    expect(after.wrongChars).toEqual([]);
  });

  it('答对完成单字题时计入 attemptedChars', () => {
    const source = createMockSource([
      { id: 'q1', mode: 'char-code', prompt: '啊', answerKeys: ['k'] },
    ]);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 'k');

    expect(state.status).toBe('finished');
    expect(state.attemptedChars).toEqual(['啊']);
    expect(state.wrongChars).toEqual([]);
    expect(state.wrongQuestionCount).toBe(0);
  });
});

/*
 * 「以字为单位」的统计口径。
 *
 * 背景：统计层此前拿 completedCount（题数）当字数，
 * 于是词组少算 2~6 倍、键位/字根练习则虚增（一个字没打却"累计几百字"）。
 */
describe('正确字数统计（按字而非按题）', () => {
  /** 依次按完 answerKeys，返回结束状态 */
  const finish = (question: Question, mode: 'drill' | 'lenient' = 'drill') => {
    const source = createMockSource([question]);
    let state = startSession(createInitialSessionState(), source);
    for (const k of question.answerKeys) {
      state = handleAnswerKey(state, source, mode, k);
    }
    return state;
  };

  it('单字题完成 → 累计 1 字', () => {
    const state = finish({
      id: 'q', mode: 'char-code', prompt: '啊', answerKeys: ['k'], charCount: 1,
    });
    expect(state.correctCharCount).toBe(1);
  });

  it('词组题完成 → 按词组长度累计', () => {
    const state = finish({
      id: 'q', mode: 'phrase-code', prompt: '中国', answerKeys: ['k', 'h'], charCount: 2,
    });
    expect(state.correctCharCount).toBe(2);
  });

  it('键位题完成 → 不累计（不涉及汉字）', () => {
    const state = finish({
      id: 'q', mode: 'key-drill', prompt: 'G', answerKeys: ['g'], charCount: 0,
    });
    expect(state.correctCharCount).toBe(0);
  });

  it('未声明 charCount 时按 0 处理，不崩溃', () => {
    const state = finish({
      id: 'q', mode: 'char-code', prompt: '啊', answerKeys: ['k'],
    });
    expect(state.correctCharCount).toBe(0);
  });

  it('lenient 答错跳题 → 不计入正确字数', () => {
    const source = createMockSource([
      { id: 'q1', mode: 'char-code', prompt: '啊', answerKeys: ['k'], charCount: 1 },
      { id: 'q2', mode: 'char-code', prompt: '的', answerKeys: ['r'], charCount: 1 },
    ]);
    const state = startSession(createInitialSessionState(), source);

    const after = handleAnswerKey(state, source, 'lenient', 'z');

    expect(after.correctCharCount).toBe(0);
    expect(after.wrongQuestionCount).toBe(1);
  });

  it('drill 答错后修正 → 仍计入正确字数（完成即打对）', () => {
    const source = createMockSource([
      { id: 'q1', mode: 'char-code', prompt: '啊', answerKeys: ['k'], charCount: 1 },
    ]);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 'z'); // 错
    state = handleAnswerKey(state, source, 'drill', 'k'); // 修正完成

    expect(state.correctCharCount).toBe(1);
    expect(state.wrongQuestionCount).toBe(1);
  });

  it('速度按字数算：2 字 / 60 秒 = 2 字/分', () => {
    const source = createMockSource([
      { id: 'q1', mode: 'char-code', prompt: '啊', answerKeys: ['k'], charCount: 1 },
      { id: 'q2', mode: 'char-code', prompt: '的', answerKeys: ['r'], charCount: 1 },
    ]);
    let state = startSession(createInitialSessionState(), source);
    state = handleAnswerKey(state, source, 'drill', 'k');
    state = handleAnswerKey(state, source, 'drill', 'r');

    const result = computeSessionResult(state, 60);

    expect(result.correctChars).toBe(2);
    expect(result.speedPerMinute).toBe(2);
  });

  it('键位模式速度回退到「题/分钟」（否则永远显示 0）', () => {
    const source = createMockSource([
      { id: 'q1', mode: 'key-drill', prompt: 'G', answerKeys: ['g'], charCount: 0 },
      { id: 'q2', mode: 'key-drill', prompt: 'F', answerKeys: ['f'], charCount: 0 },
    ]);
    let state = startSession(createInitialSessionState(), source);
    state = handleAnswerKey(state, source, 'drill', 'g');
    state = handleAnswerKey(state, source, 'drill', 'f');

    const result = computeSessionResult(state, 60);

    expect(result.correctChars).toBe(0);
    expect(result.speedPerMinute).toBe(2); // 2 题 / 60 秒
  });
});

/*
 * 「简码 + 空格出字」的回归。
 *
 * 原始缺陷：`altAnswers` 只做「逐位备选」，**短答案在结构上无法提交**。
 * 完成判定是 `inputKeys.length >= answerKeys.length`（必须打满全码），
 * 于是界面提示「有二级简码 gg」、用户打完 gg 后却被要求继续打第 3 位
 * H 并判为「按错了」—— 提示与实现互相矛盾。
 */
describe('confirmShortAnswer — 简码 + 空格出字', () => {
  /** 五 = gghg，二级简码 gg */
  const WU: Question = {
    id: 'q1',
    mode: 'char-code',
    prompt: '五',
    answerKeys: ['g', 'g', 'h', 'g'],
    altAnswers: [['g', 'g']],
    charCount: 1,
  };

  const freshWu = () => {
    const source = createMockSource([WU]);
    return { source, state: startSession(createInitialSessionState(), source) };
  };

  it('打完简码后按空格即完成（此前会被要求继续打第 3 位 H）', () => {
    const { source } = freshWu();
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 'g');
    state = handleAnswerKey(state, source, 'drill', 'g');
    // 简码已打完，但状态机仍在等第 3 位
    expect(state.status).toBe('running');

    state = confirmShortAnswer(state, source);

    expect(state.status).toBe('finished');
    expect(state.correctCharCount).toBe(1);
    expect(state.attemptedChars).toEqual(['五']);
    expect(state.wrongQuestionCount).toBe(0);
  });

  it('一级简码（1 位）同样可用空格提交', () => {
    const source = createMockSource([{
      id: 'q1', mode: 'char-code', prompt: '一',
      answerKeys: ['g', 'g', 'l', 'l'], altAnswers: [['g']], charCount: 1,
    }]);
    let state = startSession(createInitialSessionState(), source);

    state = handleAnswerKey(state, source, 'drill', 'g');
    state = confirmShortAnswer(state, source);

    expect(state.status).toBe('finished');
    expect(state.correctCharCount).toBe(1);
  });

  it('输入不匹配任何简码时，空格无副作用（原样返回）', () => {
    const source = createMockSource([{
      id: 'q1', mode: 'char-code', prompt: '啊',
      answerKeys: ['k', 'b', 's', 'k'], charCount: 1,
    }]);
    let state = startSession(createInitialSessionState(), source);
    state = handleAnswerKey(state, source, 'drill', 'k');

    const after = confirmShortAnswer(state, source);

    expect(after).toBe(state);
    expect(after.status).toBe('running');
  });

  it('已打满全码时不受空格影响', () => {
    const { source } = freshWu();
    let state = startSession(createInitialSessionState(), source);
    for (const k of ['g', 'g', 'h', 'g']) state = handleAnswerKey(state, source, 'drill', k);

    const after = confirmShortAnswer(state, source);

    expect(after).toBe(state);
    expect(after.status).toBe('finished');
  });

  it('空格不计入击键数（准确率衡量的是编码字母）', () => {
    const { source } = freshWu();
    let state = startSession(createInitialSessionState(), source);
    state = handleAnswerKey(state, source, 'drill', 'g');
    state = handleAnswerKey(state, source, 'drill', 'g');

    const before = state.totalKeystrokes;
    state = confirmShortAnswer(state, source);

    expect(state.totalKeystrokes).toBe(before);
  });

  it('简码提交与全码提交的统计完全一致', () => {
    const viaShort = (() => {
      const { source } = freshWu();
      let s = startSession(createInitialSessionState(), source);
      s = handleAnswerKey(s, source, 'drill', 'g');
      s = handleAnswerKey(s, source, 'drill', 'g');
      return computeSessionResult(confirmShortAnswer(s, source), 60);
    })();

    const viaFull = (() => {
      const { source } = freshWu();
      let s = startSession(createInitialSessionState(), source);
      for (const k of ['g', 'g', 'h', 'g']) s = handleAnswerKey(s, source, 'drill', k);
      return computeSessionResult(s, 60);
    })();

    expect(viaShort.correctChars).toBe(viaFull.correctChars);
    expect(viaShort.totalQuestions).toBe(viaFull.totalQuestions);
    expect(viaShort.wrongQuestions).toBe(viaFull.wrongQuestions);
    expect(viaShort.accuracy).toBe(viaFull.accuracy);
  });

  it('错误态下空格等同「任意键」→ 只清错误态，不推进输入', () => {
    const { source } = freshWu();
    let state = startSession(createInitialSessionState(), source);
    state = handleAnswerKey(state, source, 'drill', 'z'); // 错
    expect(state.inErrorState).toBe(true);

    const after = confirmShortAnswer(state, source);

    expect(after.inErrorState).toBe(false);
    expect(after.status).toBe('running');
    // 没有误判为完成
    expect(after.completedCount).toBe(0);
  });

  it('空输入时空格无副作用', () => {
    const { source, state } = freshWu();

    expect(confirmShortAnswer(state, source)).toBe(state);
  });

  it('会话已结束时空格无副作用', () => {
    const { source, state } = freshWu();
    const finished: typeof state = { ...state, status: 'finished' };

    expect(confirmShortAnswer(finished, source)).toBe(finished);
  });
});
