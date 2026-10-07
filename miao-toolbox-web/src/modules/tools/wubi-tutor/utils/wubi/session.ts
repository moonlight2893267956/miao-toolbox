/**
 * 练习会话状态机纯函数
 *
 * 状态流转：idle → running → (correct? advance | wrong? feedback) → finished
 *
 * drill 模式：答错必须修正后才能进入下一题
 * lenient 模式：答错跳过并记录
 */

import type { Question, QuestionState, QuestionSource } from './questionSource';

// ─── 类型定义 ────────────────────────────────────────────

export type SessionStatus = 'idle' | 'running' | 'feedback' | 'finished';

/**
 * 一次错误击键的「期望键 → 实际按下键」记录。
 *
 * 与 `wrongKeys`（去重后的错误键集合）不同：
 * 这里保留**重复次数与配对关系**，是易混字根榜的数据来源。
 * 例：期望按 g（王旁）却按了 f（土旁）→ { expected: 'g', actual: 'f' }
 */
export interface KeyError {
  expected: string;
  actual: string;
}

export interface SessionState {
  status: SessionStatus;
  /** 当前题目 */
  currentQuestion: Question | null;
  /** 已输入的键位序列 */
  inputKeys: string[];
  /** 题源状态 */
  questionState: QuestionState | null;
  /** 已完成题数 */
  completedCount: number;
  /** 总击键数 */
  totalKeystrokes: number;
  /** 错误击键数 */
  errorKeystrokes: number;
  /**
   * 可复习的错字（去重，**仅单字**）。
   *
   * 只收录能进错题本的单字。字根 / 键位 / 词组 / 文章模式的
   * `question.prompt` 不是单字，过滤规则见 `toReviewChar`。
   */
  wrongChars: string[];
  /** 本次实际练过的单字（按完成顺序，含答错后修正的） */
  attemptedChars: string[];
  /**
   * 正确完成的**汉字数**累计（键位 / 字根类题 charCount = 0，天然不计入）。
   *
   * 注意是「字」不是「题」：词组算 2~6 字，文章算整篇可打字数。
   * drill 模式下「完成」即代表最终打对（错误必须修正才能前进），
   * 所以它同时是「练过的字数」与「打对的字数」。
   */
  correctCharCount: number;
  /**
   * 出过错的**题目数**（同一题错多次只记 1 次）。
   *
   * 必须与 `wrongChars` 解耦：准确率要按「题」算，而 `wrongChars`
   * 只收单字。此前直接拿 `wrongChars.length` 当错题数，导致
   * 字根 / 键位 / 词组模式的准确率整体失真（文章模式更是整篇只算 1 题）。
   */
  wrongQuestionCount: number;
  /** 错误的键位列表（去重） */
  wrongKeys: string[];
  /** 错误的键位配对（含重复，供易混字根分析） */
  keyErrors: KeyError[];
  /** 连击正确数 */
  combo: number;
  /** 最大连击 */
  maxCombo: number;
  /** 是否处于错误修正态（drill 模式） */
  inErrorState: boolean;
  /** 当前题的错误次数 */
  currentQuestionErrors: number;
}

export interface SessionResult {
  totalQuestions: number;
  correctQuestions: number;
  wrongQuestions: number;
  /**
   * 正确完成的**汉字数**（不是题数）。
   *
   * 词组题算 2~6 字，文章题算整篇可打字数；
   * 键位 / 字根类练习不涉及汉字，恒为 0。
   * 「累计字数」「字/分钟」「通关字数」一律以它为准。
   */
  correctChars: number;
  totalKeystrokes: number;
  errorKeystrokes: number;
  /** 可复习的错字（**仅单字**；字根 / 词组 / 文章模式不产生条目） */
  wrongChars: string[];
  /** 本次实际练过的单字（供复习调度回写） */
  attemptedChars: string[];
  /** 错误的键位列表（去重） */
  wrongKeys: string[];
  /** 错误的键位配对（含重复，供易混字根分析） */
  keyErrors: KeyError[];
  accuracy: number;
  speedPerMinute: number;
  maxCombo: number;
  /** 有效击键率（正确击键 / 总击键） */
  validKeystrokeRate: number;
  /** 会话时长（秒），用于日统计累计练习时长 */
  durationSec: number;
}

export type SessionMode = 'drill' | 'lenient';

// ─── 纯函数 ──────────────────────────────────────────────

export function createInitialSessionState(): SessionState {
  return {
    status: 'idle',
    currentQuestion: null,
    inputKeys: [],
    questionState: null,
    completedCount: 0,
    totalKeystrokes: 0,
    errorKeystrokes: 0,
    wrongChars: [],
    attemptedChars: [],
    wrongQuestionCount: 0,
    correctCharCount: 0,
    wrongKeys: [],
    keyErrors: [],
    combo: 0,
    maxCombo: 0,
    inErrorState: false,
    currentQuestionErrors: 0,
  };
}

/**
 * 开始会话。
 *
 * 不接收 `mode`：模式只影响「按键如何处理」，由 `handleAnswerKey` 每次传入。
 * 此前这里收了一个从不使用的 `mode` 参数，让调用方误以为它会写入会话状态。
 */
/**
 * 恢复会话时原样搬运的累计量。
 *
 * 只包含「已经发生的事实」。
 *
 * `inputKeys`（当前题的半截输入）不在这里：它是「当下题目」的状态，
 * 而且**文章模式的全部进度都在它里面**，所以在 `resumeSession` 里
 * 单独作为参数恢复，不走这个结构。
 */
export interface SessionCounters {
  completedCount: number;
  totalKeystrokes: number;
  errorKeystrokes: number;
  wrongChars: string[];
  attemptedChars: string[];
  correctCharCount: number;
  wrongQuestionCount: number;
  wrongKeys: string[];
  keyErrors: KeyError[];
  maxCombo: number;
}

/**
 * 会话启动 / 恢复共用的清场逻辑（**不含题源推进**）。
 *
 * 抽出来是因为 `source.init()` 只能调用一次：题序发生器的闭包建在题源
 * 构造处而非 `init()` 内，重复调用会重置内部 `used` 却让发生器继续往前走，
 * 题序就错位了。所以恢复路径不能复用 `startSession`，只能共用这一小段。
 */
function beginSession(
  state: SessionState,
  question: Question,
  questionState: QuestionState,
): SessionState {
  return {
    ...state,
    status: 'running',
    currentQuestion: question,
    inputKeys: [],
    questionState,
    completedCount: 0,
    totalKeystrokes: 0,
    errorKeystrokes: 0,
    wrongChars: [],
    attemptedChars: [],
    wrongQuestionCount: 0,
    correctCharCount: 0,
    wrongKeys: [],
    keyErrors: [],
    combo: 0,
    maxCombo: 0,
    inErrorState: false,
    currentQuestionErrors: 0,
  };
}

export function startSession(
  state: SessionState,
  source: QuestionSource,
): SessionState {
  const questionState = source.init();
  const question = source.next(questionState);
  questionState.index++;

  return beginSession(state, question, questionState);
}

/**
 * 从中断现场恢复会话。
 *
 * ── 怎么做到的 ──
 *
 * 题序由种子决定（见 `utils/wubi/rng.ts`），所以「重建题源 → 空转到第 N 题」
 * 得到的题目与内部 `used` 集合，与刷新前那一份**完全一致**，不必序列化任何
 * 题源内部结构。空转次数 = 已完成题数 + 1（最后一次抽的是当前题）。
 *
 * ── 为什么有的状态不恢复 ──
 *
 * - `combo` 归零、但 `maxCombo` 保留：刷新确实断了连击，假装没断是自欺；
 *   而「本轮最高连击」是已经发生的事实，应当留下。
 * - `inputKeys` **要恢复**（见下），`inErrorState` 清空。
 * - 计时不含离开时长（由调用方传 `elapsedMs` 决定起点）。
 *
 * ── 为什么 inputKeys 必须恢复 ──
 *
 * 它是**文章模式的全部进度**：文章题源把整篇作为一道题（`total: 1`），
 * 逐字推进的位置完全由 `inputKeys` 决定（见 `articleCursor.ts`：
 * `totalTyped = inputKeys.length`）。
 * 曾经这里一律重置 inputKeys，结果是「文章打了一半刷新，继续后从头开始」——
 * 对 char-code 只是丢几个键，对文章等于进度全丢。
 *
 * @param inputKeys 中断时当前题已输入的键；与题目对不上时按空处理
 * @returns 无法恢复时返回 `null`（题量已打满 / 已完成数越界），调用方应视为「没有中断现场」
 */
export function resumeSession(
  state: SessionState,
  source: QuestionSource,
  completed: number,
  counters: SessionCounters,
  inputKeys: string[] = [],
): SessionState | null {
  const questionState = source.init();
  const total = questionState.total;

  // 越界一律拒绝：快照与题源对不上（模式参数被改过、或数据版本变了）
  if (!Number.isInteger(completed) || completed < 0) return null;
  if (total !== null && completed >= total) return null;

  // 空转 completed 题（这些已完成），再抽一题作为当前题
  let question = source.next(questionState);
  questionState.index++;
  for (let i = 0; i < completed; i++) {
    question = source.next(questionState);
    questionState.index++;
  }

  return {
    ...beginSession(state, question, questionState),
    ...counters,
    /*
     * 已输入的键只在「确实是当前题的合法前缀」时才接受。
     *
     * 快照来自 localStorage，可能被改过或对不上（模式参数变了）；
     * 而半截输入若不是合法前缀，界面会显示出一串永远打不完的槽位 ——
     * 宁可退回「这题从头打」，也不要恢复出一个打不通的状态。
     */
    inputKeys: isPlausibleInput(question, inputKeys) ? [...inputKeys] : [],
    // combo 归零需在 counters 之后覆盖：刷新断了连击是事实
    combo: 0,
    inErrorState: false,
    currentQuestionErrors: 0,
  };
}

/**
 * 半截输入是否是这道题的合法前缀。
 *
 * 与 `isCorrectKey` 同一套判定口径：逐位比对答案或任一别名编码。
 * 词组 / 文章题用的是「整题答案序列」，所以文章打到第 37 个键时，
 * 这 37 个键必须正好是整篇编码的前 37 位 —— 对得上才恢复。
 */
function isPlausibleInput(question: Question, inputKeys: string[]): boolean {
  if (inputKeys.length === 0) return true;

  const candidates = [question.answerKeys, ...(question.altAnswers ?? [])];
  return candidates.some(
    (code) =>
      inputKeys.length <= code.length && inputKeys.every((k, i) => k === code[i]),
  );
}

/** 单个 CJK 统一表意文字 */
const SINGLE_HANZI_RE = /^[\u4e00-\u9fff]$/;

/**
 * 取该题可作为「错题本条目」的单字；不是单字则返回 null。
 *
 * !! 不是所有模式的 prompt 都是单字 !!
 * - `char-code` / `simplified-code`：prompt 就是单字 ✓
 * - `radical-identify`：prompt 是字根 glyph（多为单字，可用）✓
 * - `phrase-code`：prompt 是 2~4 字词组 ✗
 * - `key-drill` / `radical-sequence`：prompt 是大写键名如 "G" ✗
 * - `article`：prompt 是前 50 字摘要 + '…' ✗✗
 *
 * 缺少这层过滤时，`recordSession` 会把「G」「中国」「整段文章」
 * 写进错题本：复习时 `createCharCodeSource` 在码表里查不到它们，
 * 对应条目**永远无法被复习清掉**，「待复习 N」只增不减。
 */
export function toReviewChar(question: Question): string | null {
  return SINGLE_HANZI_RE.test(question.prompt) ? question.prompt : null;
}

/**
 * 取当前位「期望按下的键」（主答案）。
 * 用于错误配对记录；越界时返回空串。
 */
export function getExpectedKey(question: Question, inputLength: number): string {
  return question.answerKeys[inputLength] ?? '';
}

/**
 * 判断输入键是否正确（当前位）。
 */
export function isCorrectKey(question: Question, inputKeys: string[], key: string): boolean {
  const position = inputKeys.length;
  const expected = question.answerKeys[position];

  if (expected === key) return true;

  // 检查备选答案（简码）
  if (question.altAnswers) {
    for (const alt of question.altAnswers) {
      if (alt[position] === key) return true;
    }
  }

  return false;
}

/** 上屏时要写回的状态片段 */
interface AdvanceParams {
  inputKeys: string[];
  totalKeystrokes: number;
  combo: number;
  maxCombo: number;
}

/**
 * 当前题已答对 → 推进到下一题（或结束会话）。
 *
 * 抽出来是因为有**两条**上屏路径：
 * 1. 打满完整编码 —— `handleAnswerKey` 自动上屏
 * 2. 打完简码后按空格确认 —— `confirmShortAnswer`
 *
 * 两条路径的「完成」语义必须完全一致（字数累计 / 错字入队 / 连击 / 计数），
 * 否则同一个字因提交方式不同而统计出两套结果。
 */
function advanceAfterCorrect(
  base: SessionState,
  source: QuestionSource,
  question: Question,
  params: AdvanceParams,
): SessionState {
  const { inputKeys, totalKeystrokes, combo, maxCombo } = params;
  const newCompletedCount = base.completedCount + 1;

  // 只把单字计入「练过的字」，词组 / 键名 / 文章摘要一律跳过
  const reviewChar = toReviewChar(question);
  const newAttemptedChars = reviewChar
    ? [...base.attemptedChars, reviewChar]
    : base.attemptedChars;
  // 累计正确完成的汉字数（键位 / 字根类题 charCount = 0，不计入）
  const newCorrectCharCount = base.correctCharCount + (question.charCount ?? 0);

  /*
   * 错字入队 —— 本函数开头承诺的「两条路径语义一致」里就包含这一条。
   *
   * 判据是「本题错过至少一次」。`currentQuestionErrors` 在本题内只增不清
   * （`retryCurrentQuestion` 只清错误态、不动计数），直到上屏才归零，
   * 所以此刻它正好等于「这一题错了几次」。
   *
   * ── 这里曾经整个漏掉，是个真 bug ──
   *
   * drill 模式下按错键**永远不会**进错题本，只有「跳过」才入队。
   * 而练习与复习**都**用 drill（PracticeTab / ReviewTab 均传 mode: 'drill'），
   * 于是：错得再多，复习页永远是空的 —— 用户实际反馈的问题。
   *
   * lenient 分支（错误即跳题时记录）与 `skipCurrentQuestion` 都写了这段，
   * 唯独 drill 的上屏路径没有，两条路径的语义就此分叉。
   */
  const newWrongChars = reviewChar
    && base.currentQuestionErrors > 0
    && !base.wrongChars.includes(reviewChar)
    ? [...base.wrongChars, reviewChar]
    : base.wrongChars;

  // 会话结束
  if (source.finite && base.questionState && newCompletedCount >= (base.questionState.total ?? 0)) {
    return {
      ...base,
      inputKeys,
      totalKeystrokes,
      combo,
      maxCombo,
      attemptedChars: newAttemptedChars,
      wrongChars: newWrongChars,
      correctCharCount: newCorrectCharCount,
      inErrorState: false,
      currentQuestionErrors: 0,
      status: 'finished',
      completedCount: newCompletedCount,
    };
  }

  // 进入下一题
  const nextQuestionState = base.questionState!;
  const nextQuestion = source.next(nextQuestionState);
  nextQuestionState.index++;

  return {
    ...base,
    currentQuestion: nextQuestion,
    inputKeys: [],
    questionState: nextQuestionState,
    completedCount: newCompletedCount,
    totalKeystrokes,
    combo,
    maxCombo,
    attemptedChars: newAttemptedChars,
    wrongChars: newWrongChars,
    correctCharCount: newCorrectCharCount,
    inErrorState: false,
    currentQuestionErrors: 0,
    status: 'running',
  };
}

/**
 * 用「简码 + 确认键（空格）」提交当前题。
 *
 * 五笔里打完一级简码（一 = G）或二三级简码（五 = GG）后需要按空格出字，
 * 只有打满全码才自动上屏 —— 本练习照此办理。
 *
 * 为什么必须支持这条路径：`altAnswers` 只做「逐位备选」，
 * **短答案在结构上无法提交**。界面提示「有二级简码 gg」，用户打完 gg
 * 却被要求继续打第 3 位（H）并判为「按错了」—— 提示与实现互相矛盾。
 *
 * @returns 当前输入不是任何简码时**原样返回**（空格在其它情况下无副作用）
 */
export function confirmShortAnswer(
  state: SessionState,
  source: QuestionSource,
): SessionState {
  if (state.status === 'finished' || state.status === 'idle') return state;

  /*
   * 错误态下提示是「按任意键重新作答」——空格也算。
   * 否则用户按空格毫无反应，会以为界面卡住了。此处只清错误态、不推进输入。
   */
  if (state.status === 'feedback' || state.inErrorState) {
    return retryCurrentQuestion(state);
  }

  const question = state.currentQuestion;
  if (!question || state.inputKeys.length === 0) return state;

  // 已打满全码：留给 handleAnswerKey 的自动上屏路径，此处不重复处理
  if (state.inputKeys.length >= question.answerKeys.length) return state;

  const isShortAnswer = question.altAnswers?.some(
    (alt) => alt.length === state.inputKeys.length
      && alt.every((k, i) => k === state.inputKeys[i]),
  );
  if (!isShortAnswer) return state;

  // 空格不计入击键数：准确率衡量的是编码字母，不是确认键
  const newCombo = state.combo + 1;
  return advanceAfterCorrect(state, source, question, {
    inputKeys: [...state.inputKeys],
    totalKeystrokes: state.totalKeystrokes,
    combo: newCombo,
    maxCombo: Math.max(state.maxCombo, newCombo),
  });
}

/**
 * 处理一次按键输入。
 *
 * 返回新的状态。
 * - 正确：追加到 inputKeys，若已完整则进入下一题
 * - 错误：drill 模式进入 errorState，lenient 模式跳过并记录
 */
export function handleAnswerKey(
  state: SessionState,
  source: QuestionSource,
  mode: SessionMode,
  key: string,
): SessionState {
  if (state.status !== 'running' && state.status !== 'feedback') return state;
  if (!state.currentQuestion) return state;

  /*
   * drill 模式：上一键按错后再次按键 = 重新作答。
   * 清空本轮已输入（错误计数保留），本次按键从第 1 位重新判定。
   * 若在此直接 return，用户会被永久困在错误态（按键全部无效）。
   */
  const base = (state.inErrorState && mode === 'drill')
    ? retryCurrentQuestion(state)
    : state;

  const question = base.currentQuestion!;
  const correct = isCorrectKey(question, base.inputKeys, key);

  const newTotalKeystrokes = base.totalKeystrokes + 1;

  if (correct) {
    const newInputKeys = [...base.inputKeys, key];
    const newCombo = base.combo + 1;
    const newMaxCombo = Math.max(base.maxCombo, newCombo);

    // 完整编码打完 → 自动上屏
    if (newInputKeys.length >= question.answerKeys.length) {
      return advanceAfterCorrect(base, source, question, {
        inputKeys: newInputKeys,
        totalKeystrokes: newTotalKeystrokes,
        combo: newCombo,
        maxCombo: newMaxCombo,
      });
    }

    // 正确但未完成
    return {
      ...base,
      inputKeys: newInputKeys,
      totalKeystrokes: newTotalKeystrokes,
      combo: newCombo,
      maxCombo: newMaxCombo,
      status: 'running',
    };
  }

  // ── 错误 ──
  const newErrorKeystrokes = base.errorKeystrokes + 1;
  const newWrongKeys = base.wrongKeys.includes(key) ? base.wrongKeys : [...base.wrongKeys, key];
  const newCombo = 0; // 连击中断
  const newCurrentErrors = base.currentQuestionErrors + 1;

  /*
   * 出过错的「题目数」：同一题只记 1 次。
   * `currentQuestionErrors === 0` 即本题首次出错 —— drill 模式下重试
   * 不会清零该计数（见 retryCurrentQuestion），lenient 模式首错即跳题，
   * 因此同一个判据对两种模式都成立。
   */
  const newWrongQuestionCount =
    base.wrongQuestionCount + (base.currentQuestionErrors === 0 ? 1 : 0);

  // 记录「期望键 → 实际按下键」配对（易混字根榜的数据来源）
  const expectedKey = getExpectedKey(question, base.inputKeys.length);
  const newKeyErrors = expectedKey
    ? [...base.keyErrors, { expected: expectedKey, actual: key }]
    : base.keyErrors;

  if (mode === 'lenient') {
    // 宽松模式：记录错误并跳到下一题
    const reviewChar = toReviewChar(question);
    const newWrongChars = reviewChar && !base.wrongChars.includes(reviewChar)
      ? [...base.wrongChars, reviewChar]
      : base.wrongChars;
    const newCompletedCount = base.completedCount + 1;
    const newAttemptedChars = reviewChar
      ? [...base.attemptedChars, reviewChar]
      : base.attemptedChars;

    if (source.finite && base.questionState && newCompletedCount >= (base.questionState.total ?? 0)) {
      return {
        ...base,
        totalKeystrokes: newTotalKeystrokes,
        errorKeystrokes: newErrorKeystrokes,
        wrongChars: newWrongChars,
        attemptedChars: newAttemptedChars,
        wrongQuestionCount: newWrongQuestionCount,
        wrongKeys: newWrongKeys,
        keyErrors: newKeyErrors,
        combo: newCombo,
        currentQuestionErrors: newCurrentErrors,
        status: 'finished',
        completedCount: newCompletedCount,
      };
    }

    const nextQuestionState = base.questionState!;
    const nextQuestion = source.next(nextQuestionState);
    nextQuestionState.index++;

    return {
      ...base,
      currentQuestion: nextQuestion,
      inputKeys: [],
      questionState: nextQuestionState,
      completedCount: newCompletedCount,
      totalKeystrokes: newTotalKeystrokes,
      errorKeystrokes: newErrorKeystrokes,
      wrongChars: newWrongChars,
      attemptedChars: newAttemptedChars,
      wrongQuestionCount: newWrongQuestionCount,
      wrongKeys: newWrongKeys,
      keyErrors: newKeyErrors,
      combo: newCombo,
      currentQuestionErrors: 0,
      inErrorState: false,
      status: 'running',
    };
  }

  // drill 模式：进入错误态（等待用户再次按键重新作答）
  return {
    ...base,
    totalKeystrokes: newTotalKeystrokes,
    errorKeystrokes: newErrorKeystrokes,
    wrongQuestionCount: newWrongQuestionCount,
    wrongKeys: newWrongKeys,
    keyErrors: newKeyErrors,
    combo: newCombo,
    currentQuestionErrors: newCurrentErrors,
    inErrorState: true,
    status: 'feedback',
  };
}

/**
 * drill 模式错误修正：清除错误态，**保留已经打对的编码**。
 *
 * ── 为什么不再回退输入 ──
 *
 * 这里曾经算出一个「回退位置」并把 inputKeys 截断到该位置
 * （文章模式回退到当前字符起点，单字 / 词组模式回退到 0，即整题重打）。
 * 但它与错误提示条**互相矛盾**：提示条给出的是**出错那一位**的正确键
 * （`getExpectedKey`），用户照着按下去，那一键会被拿去和第 1 位比较 ——
 * 于是立刻再次判错、字符再次标红，同时已打对的前缀也被清掉。
 *
 * 实测复现（「筒」tmgk）：打对 T → 第 2 位按错 → 提示「正确是 M」→
 * 按 M 后提示变成「正确是 T」，槽位全部清空。
 *
 * 现在只清错误态：按错的那一键本来就不会进 inputKeys，所以输入位置
 * 原地不动，用户接着按提示的键即可继续。文章模式同样受益 ——
 * 连当前字都不必重打。
 */
export function retryCurrentQuestion(state: SessionState): SessionState {
  return {
    ...state,
    inErrorState: false,
    status: 'running',
  };
}

/**
 * 跳过当前题（Ctrl/Cmd+Enter），标记为不会。
 */
export function skipCurrentQuestion(
  state: SessionState,
  source: QuestionSource,
): SessionState {
  if (!state.currentQuestion) return state;

  const question = state.currentQuestion;
  const reviewChar = toReviewChar(question);
  const newWrongChars = reviewChar && !state.wrongChars.includes(reviewChar)
    ? [...state.wrongChars, reviewChar]
    : state.wrongChars;
  const newCompletedCount = state.completedCount + 1;
  const newAttemptedChars = reviewChar
    ? [...state.attemptedChars, reviewChar]
    : state.attemptedChars;
  // 跳过 = 这题不会，计入错题数
  const newWrongQuestionCount = state.wrongQuestionCount + 1;

  if (source.finite && state.questionState && newCompletedCount >= (state.questionState.total ?? 0)) {
    return {
      ...state,
      wrongChars: newWrongChars,
      attemptedChars: newAttemptedChars,
      wrongQuestionCount: newWrongQuestionCount,
      completedCount: newCompletedCount,
      status: 'finished',
    };
  }

  const nextQuestionState = state.questionState!;
  const nextQuestion = source.next(nextQuestionState);
  nextQuestionState.index++;

  return {
    ...state,
    currentQuestion: nextQuestion,
    inputKeys: [],
    questionState: nextQuestionState,
    completedCount: newCompletedCount,
    wrongChars: newWrongChars,
    attemptedChars: newAttemptedChars,
    wrongQuestionCount: newWrongQuestionCount,
    inErrorState: false,
    currentQuestionErrors: 0,
    status: 'running',
  };
}

/**
 * 计算会话结果。
 */
export function computeSessionResult(state: SessionState, durationSec: number): SessionResult {
  const totalQuestions = state.completedCount;
  /*
   * 错题数必须取自 wrongQuestionCount，不能再用 wrongChars.length：
   * 后者是「去重后的单字集合」，而字根 / 键位 / 词组 / 文章模式的
   * prompt 不进这个集合 → 会算出「全对」的假象。
   */
  const wrongCount = state.wrongQuestionCount;
  // 钳到 0：极端情况下（最后一题出错后直接结束）错题数可能超过完成题数
  const correctQuestions = Math.max(0, totalQuestions - wrongCount);
  const accuracy = totalQuestions > 0 ? correctQuestions / totalQuestions : 0;

  /*
   * 速度口径：优先按「字」算。
   * 词组题是 2~6 字、文章题是整篇，按题算会把这些模式的速度压低好几倍。
   *
   * 键位 / 字根类练习 charCount 恒为 0（本就不涉及汉字），
   * 此时回退到「题/分钟」——否则它们的速度会永远显示 0。
   */
  const correctChars = state.correctCharCount;
  const speedBase = correctChars > 0 ? correctChars : correctQuestions;
  const speedPerMinute = durationSec > 0 ? (speedBase / durationSec) * 60 : 0;
  const validKeystrokeRate = state.totalKeystrokes > 0
    ? (state.totalKeystrokes - state.errorKeystrokes) / state.totalKeystrokes
    : 0;

  return {
    totalQuestions,
    correctQuestions,
    wrongQuestions: wrongCount,
    correctChars,
    totalKeystrokes: state.totalKeystrokes,
    errorKeystrokes: state.errorKeystrokes,
    wrongChars: [...state.wrongChars],
    attemptedChars: [...state.attemptedChars],
    wrongKeys: [...state.wrongKeys],
    keyErrors: [...state.keyErrors],
    accuracy,
    speedPerMinute,
    maxCombo: state.maxCombo,
    validKeystrokeRate,
    durationSec,
  };
}
