/**
 * 挑战题源：**节奏递增**包装。
 *
 * 生存挑战要「越答越难」，但这件事不该改动任何既有题源 ——
 * 题源是纯出题器，加难度曲线会把它们的职责搞混，也会让既有单测全部失效。
 *
 * 这里用**组合**代替继承：按「已出题序号」在两个内层题源之间切换。
 *   阶段 0（前 N 题）：单字（短码常用字）—— 建立节奏
 *   阶段 1（第 N 题起）：词组 —— 码更长、更考验指法
 *
 * 切换点读的是 `state.index`（题源被抽题的序号，由会话状态机递增），
 * 因此是「已出题数」而不是「已答对数」：答错的题同样占掉一个位置，
 * 否则一直答错就会永远停在简单阶段，难度形同虚设。
 */

import {
  createCharCodeSource,
  createPhraseCodeSource,
  type QuestionSource,
  type QuestionState,
} from './questionSource';
import type { CharMap, PhraseMap } from './code';

/** 默认的「简单阶段」题数 */
export const DEFAULT_WARMUP_QUESTIONS = 8;

export interface ChallengeSourceConfig {
  charMap: CharMap;
  phraseMap: PhraseMap;
  /** 本轮题序种子（每日挑战传日期派生种子，其它模式传随机会话种子） */
  seed?: number;
  /** 前多少题用单字，之后切换到词组 */
  warmupQuestionCount?: number;
  /** 词组阶段取几字词（默认二字词，最常用） */
  phraseLength?: 2 | 3 | 4 | 'multi';
}

/** 该词组表里是否存在指定长度的词条 */
function hasPhrasesOfLength(map: PhraseMap, length: 2 | 3 | 4 | 'multi'): boolean {
  for (const [phrase] of map) {
    if (length === 'multi' ? phrase.length >= 5 : phrase.length === length) {
      return true;
    }
  }
  return false;
}

export function createChallengeSource(config: ChallengeSourceConfig): QuestionSource {
  const { charMap, phraseMap, seed, warmupQuestionCount = DEFAULT_WARMUP_QUESTIONS } = config;
  const phraseLength = config.phraseLength ?? 2;

  /*
   * 降级：词组表为空（或没有该长度）时只保留单字阶段。
   *
   * 题源必须能无条件构造成功 —— 与其它练习模式一致，
   * 「码表里没有可用题目」由 `init()` 抛错、由界面展示重试，
   * 而不是在这里静默出一个空题。
   */
  const usePhrases = hasPhrasesOfLength(phraseMap, phraseLength);

  /*
   * 相位错开：两个内层题源若用同一个种子，会各自走出同一条随机序列，
   * 「第 k 个单字」与「第 k 个词组」的抽取顺序产生可观测的相关性。
   * 异或一个不是种子的常数即可打散，且保持完全确定（可复现）。
   */
  const phraseSeed = seed === undefined ? undefined : (seed ^ 0x5bf03635) >>> 0;

  const charSource = createCharCodeSource({ count: null, seed }, charMap);
  const phraseSource = usePhrases
    ? createPhraseCodeSource({ length: phraseLength, count: null, seed: phraseSeed }, phraseMap)
    : null;

  interface Internal {
    charState: QuestionState;
    phraseState: QuestionState | null;
  }

  return {
    id: 'challenge-ladder',
    /*
     * 名义模式取内层主阶段。题目自身的 `mode` 仍由各自题源给出
     * （单字题是 char-code、词组题是 phrase-code），
     * 因为 `charCount`（字数统计）依赖它 —— 覆盖成同一个值会算错字数。
     */
    mode: 'char-code',
    // 挑战模式由「时长 / 命数 / 题量」外部终止，题源本身视为无限
    finite: false,

    init: () => {
      const charState = charSource.init();
      const phraseState = phraseSource ? phraseSource.init() : null;
      return { index: 0, total: null, internal: { charState, phraseState } as Internal };
    },

    next: (state) => {
      const internal = state.internal as Internal;
      const inPhraseStage = internal.phraseState !== null && state.index >= warmupQuestionCount;

      if (inPhraseStage && phraseSource) {
        const question = phraseSource.next(internal.phraseState!);
        internal.phraseState!.index += 1;
        return question;
      }

      const question = charSource.next(internal.charState);
      internal.charState.index += 1;
      return question;
    },
  };
}
