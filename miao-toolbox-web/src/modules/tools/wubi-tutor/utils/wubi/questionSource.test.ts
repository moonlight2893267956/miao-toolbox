/**
 * 题源实现单测（字根类 / 简码 / 词组 / 文章）
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createRadicalIdentifySource,
  createRadicalSequenceSource,
  createSimplifiedCodeSource,
  createPhraseCodeSource,
  createArticleSource,
  createRadicalCodeSource,
  getLessonCharPool,
  isPracticableChar,
} from './questionSource';
import { buildCharMap, buildPhraseMap, type CharMap, type PhraseMap } from './code';
import { WUBI_KEYS, type WubiKey } from '../../data/radicals';
import { LESSON_ORDER, getLearnedKeys } from '../../data/lessons';

// [字, 全码, 简码等级, 简码?]
const CHAR_MAP: CharMap = buildCharMap([
  ['一', 'ggll', 1, 'g'], ['地', 'fbn', 1, 'f'], ['在', 'dhfd', 1, 'd'],
  ['要', 'svf', 1, 's'], ['工', 'aaaa', 1, 'a'],
  ['上', 'hhgg', 1, 'h'], ['是', 'jghu', 1, 'j'], ['中', 'khk', 1, 'k'],
  ['国', 'lgyi', 1, 'l'], ['同', 'mgkd', 1, 'm'],
  ['大', 'dddd', 2, 'dd'], ['到', 'gcfg', 2, 'gc'],
  ['你', 'wqiy', 2, 'wq'], ['好', 'vbg', 2, 'vb'],
  ['会', 'wfcu', 3, 'wfc'], ['学', 'ipbf', 3, 'ipb'],
  ['啊', 'kbsk', 0],
]);

const PHRASE_MAP: PhraseMap = buildPhraseMap([
  ['中国', 'khlg'], ['我们', 'trwh'], ['你好', 'wqvb'],
  ['计算机', 'ytsm'], ['为什么', 'owtc'],
  ['五笔字型', 'gtpg'], ['中文信息', 'kywt'],
  ['中华人民共和国', 'kwwl'], ['不好意思', 'dgvu'],
]);

describe('createRadicalIdentifySource — 正向', () => {
  it('出题包含字根和正确键位', () => {
    const source = createRadicalIdentifySource({
      direction: 'forward', scope: 'all', count: 10,
    });
    const qState = source.init();
    const question = source.next(qState);

    expect(question.mode).toBe('radical-identify');
    expect(question.prompt).toBeTruthy();
    expect(question.answerKeys).toHaveLength(1);
    expect(question.answerKeys[0]).toMatch(/^[a-y]$/);
  });

  it('限定单键只出该键字根', () => {
    const source = createRadicalIdentifySource({
      direction: 'forward', scope: 'key', key: 'g', count: 20,
    });
    const qState = source.init();

    for (let i = 0; i < 20; i++) {
      const question = source.next(qState);
      expect(question.answerKeys[0]).toBe('g');
      qState.index++;
    }
  });

  it('限定分区只出该区字根', () => {
    const source = createRadicalIdentifySource({
      direction: 'forward', scope: 'zone', zone: 'heng', count: 20,
    });
    const qState = source.init();
    const hengKeys = ['g', 'f', 'd', 's', 'a'];

    for (let i = 0; i < 20; i++) {
      const question = source.next(qState);
      expect(hengKeys).toContain(question.answerKeys[0]);
      qState.index++;
    }
  });
});

describe('createRadicalIdentifySource — 反向（4 选 1）', () => {
  it('生成 4 个选项', () => {
    const source = createRadicalIdentifySource({
      direction: 'backward', scope: 'all', count: 10,
    });
    const qState = source.init();
    const question = source.next(qState);

    expect(question.choices).toBeDefined();
    expect(question.choices).toHaveLength(4);
  });

  it('选项不重复', () => {
    const source = createRadicalIdentifySource({
      direction: 'backward', scope: 'all', count: 20,
    });
    const qState = source.init();

    for (let i = 0; i < 20; i++) {
      const question = source.next(qState);
      const unique = new Set(question.choices);
      expect(unique.size).toBe(question.choices!.length);
      qState.index++;
    }
  });

  it('正确答案必在选项中', () => {
    const source = createRadicalIdentifySource({
      direction: 'backward', scope: 'key', key: 'g', count: 30,
    });
    const qState = source.init();

    const gMeta = WUBI_KEYS.find((m) => m.key === 'g')!;
    const gGlyphs = gMeta.radicals.map((r) => r.glyph);

    for (let i = 0; i < 30; i++) {
      const question = source.next(qState);
      // 正确答案应是 g 键某个字根，且必须在选项中
      const hasCorrect = question.choices!.some((c) => gGlyphs.includes(c));
      expect(hasCorrect).toBe(true);
      qState.index++;
    }
  });
});

describe('createRadicalSequenceSource', () => {
  it('出题包含 3~6 个键位', () => {
    const source = createRadicalSequenceSource({ count: 10 });
    const qState = source.init();

    for (let i = 0; i < 10; i++) {
      const question = source.next(qState);
      expect(question.answerKeys.length).toBeGreaterThanOrEqual(3);
      expect(question.answerKeys.length).toBeLessThanOrEqual(6);
      expect(question.prompt.split(' ')).toHaveLength(question.answerKeys.length);
      qState.index++;
    }
  });

  it('自定义长度范围生效', () => {
    const source = createRadicalSequenceSource({ count: 10, minLen: 2, maxLen: 3 });
    const qState = source.init();

    for (let i = 0; i < 10; i++) {
      const question = source.next(qState);
      expect(question.answerKeys.length).toBeGreaterThanOrEqual(2);
      expect(question.answerKeys.length).toBeLessThanOrEqual(3);
      qState.index++;
    }
  });

  it('所有键位合法（a~y）', () => {
    const source = createRadicalSequenceSource({ count: 10 });
    const qState = source.init();

    for (let i = 0; i < 10; i++) {
      const question = source.next(qState);
      for (const key of question.answerKeys) {
        expect(key).toMatch(/^[a-y]$/);
      }
      qState.index++;
    }
  });
});

describe('createSimplifiedCodeSource', () => {
  it('一级简码：单键答案', () => {
    const source = createSimplifiedCodeSource({ level: 1, count: 5 }, CHAR_MAP);
    const qState = source.init();
    const question = source.next(qState);

    expect(question.mode).toBe('simplified-code');
    expect(question.answerKeys).toHaveLength(1);
    expect(question.hint).toContain('一级简码');
  });

  it('二级简码：两键答案', () => {
    const source = createSimplifiedCodeSource({ level: 2, count: 5 }, CHAR_MAP);
    const qState = source.init();
    const question = source.next(qState);

    expect(question.answerKeys).toHaveLength(2);
  });

  it('三级简码：三键答案', () => {
    const source = createSimplifiedCodeSource({ level: 3, count: 5 }, CHAR_MAP);
    const qState = source.init();
    const question = source.next(qState);

    expect(question.answerKeys).toHaveLength(3);
  });

  it('level=all 混合各级简码', () => {
    const source = createSimplifiedCodeSource({ level: 'all', count: 20 }, CHAR_MAP);
    const qState = source.init();

    for (let i = 0; i < 20; i++) {
      const question = source.next(qState);
      expect(question.answerKeys.length).toBeGreaterThanOrEqual(1);
      expect(question.answerKeys.length).toBeLessThanOrEqual(3);
      qState.index++;
    }
  });

  it('无匹配级别时抛错', () => {
    const emptyMap = buildCharMap([['啊', 'kbsk', 0]]);
    const source = createSimplifiedCodeSource({ level: 1, count: 5 }, emptyMap);
    const qState = source.init();

    expect(() => source.next(qState)).toThrow();
  });

  it('level=all 能覆盖「全码为 4 位」的一级简码（回归）', () => {
    // 只放一级简码，且全码都是 4 位——旧实现用 c.code.length < 4 会全部漏掉
    const onlyLevel1 = buildCharMap([
      ['一', 'ggll', 1, 'g'],
      ['的', 'rqyy', 1, 'r'],
      ['工', 'aaaa', 1, 'a'],
    ]);
    const source = createSimplifiedCodeSource({ level: 'all', count: 10 }, onlyLevel1);
    const qState = source.init();

    const q = source.next(qState);
    expect(q.answerKeys).toHaveLength(1);
    expect(['g', 'r', 'a']).toContain(q.answerKeys[0]);
  });

  it('level=all 抽取 100 题能覆盖多个一级简码', () => {
    const onlyLevel1 = buildCharMap([
      ['一', 'ggll', 1, 'g'],
      ['的', 'rqyy', 1, 'r'],
      ['工', 'aaaa', 1, 'a'],
      ['上', 'hhgg', 1, 'h'],
      ['是', 'jghu', 1, 'j'],
    ]);
    const source = createSimplifiedCodeSource({ level: 'all', count: 100 }, onlyLevel1);
    const qState = source.init();

    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(source.next(qState).prompt);
      qState.index++;
    }
    // 5 个字中至少抽到 4 个（概率上极稳）
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe('createPhraseCodeSource', () => {
  it('二字词：出题为 2 字词组', () => {
    const source = createPhraseCodeSource({ length: 2, count: 5 }, PHRASE_MAP);
    const qState = source.init();
    const question = source.next(qState);

    expect(question.mode).toBe('phrase-code');
    expect(Array.from(question.prompt)).toHaveLength(2);
  });

  it('三字词：出题为 3 字词组', () => {
    const source = createPhraseCodeSource({ length: 3, count: 5 }, PHRASE_MAP);
    const qState = source.init();
    const question = source.next(qState);

    expect(Array.from(question.prompt)).toHaveLength(3);
  });

  it('四字词：出题为 4 字词组', () => {
    const source = createPhraseCodeSource({ length: 4, count: 5 }, PHRASE_MAP);
    const qState = source.init();
    const question = source.next(qState);

    expect(Array.from(question.prompt)).toHaveLength(4);
  });

  it('多字词：≥5 字', () => {
    const source = createPhraseCodeSource({ length: 'multi', count: 5 }, PHRASE_MAP);
    const qState = source.init();
    const question = source.next(qState);

    expect(Array.from(question.prompt).length).toBeGreaterThanOrEqual(5);
  });

  it('答案编码长度符合规则', () => {
    const source = createPhraseCodeSource({ length: 2, count: 10 }, PHRASE_MAP);
    const qState = source.init();

    for (let i = 0; i < 10; i++) {
      const question = source.next(qState);
      expect(question.answerKeys.length).toBeGreaterThan(0);
      qState.index++;
    }
  });

  it('无匹配长度时抛错', () => {
    const source = createPhraseCodeSource({ length: 2, count: 5 }, PHRASE_MAP);
    const qState = source.init();
    // multi 词不存在于 2 字筛选，但这里用空 map 验证
    const emptySource = createPhraseCodeSource({ length: 'multi', count: 5 }, buildPhraseMap([['中国', 'khlg']]));
    const emptyState = emptySource.init();

    expect(() => emptySource.next(emptyState)).toThrow();
    expect(source).toBeDefined();
    expect(qState).toBeDefined();
  });
});

describe('createArticleSource', () => {
  it('出题包含可打字符序列', () => {
    const source = createArticleSource({
      scope: 'custom',
      text: '中国你好',
      skipUncodable: true,
    }, CHAR_MAP);
    const qState = source.init();
    const question = source.next(qState);

    expect(question.mode).toBe('article');
    expect(question.answerKeys.length).toBeGreaterThan(0);
    expect(question.tokens).toBeDefined();
  });

  it('跳过无编码字符', () => {
    const source = createArticleSource({
      scope: 'custom',
      text: '中国，你好！',
      skipUncodable: true,
    }, CHAR_MAP);
    const qState = source.init();
    const question = source.next(qState);

    // 只有 4 个可打字符（中国你好），标点被跳过
    const codableTokens = question.tokens!.filter((t) => t.isCodable);
    expect(codableTokens).toHaveLength(4);
  });

  it('空文本抛错', () => {
    const source = createArticleSource({
      scope: 'custom',
      text: '',
      skipUncodable: true,
    }, CHAR_MAP);
    const qState = source.init();

    expect(() => source.next(qState)).toThrow();
  });

  it('hint 显示字数', () => {
    const source = createArticleSource({
      scope: 'custom',
      text: '中国你好',
      skipUncodable: true,
    }, CHAR_MAP);
    const qState = source.init();
    const question = source.next(qState);

    expect(question.hint).toContain('4 字');
  });
});

/*
 * 以下两组是「关卡练习不合理」的回归测试。
 *
 * 两个原始缺陷：
 * 1. 字根编码环节用 createRadicalSequenceSource({keys:[lesson.key]})，
 *    答案取「字根所属键」→ 单键关卡下每个字根的 key 都是同一个字母，
 *    答案恒为 `gggg`，题面却显示「王 青 戋 五」。
 * 2. 单字环节用 getKeyCharIndex（「编码含该键」）→ 把 g 当末笔识别码的
 *    字也算进来，且完全不看用户学没学过其余字根。
 */

describe('createRadicalCodeSource — 字根真实编码（回归）', () => {
  const MAP = buildCharMap([
    ['王', 'gggg', 0], // 键名字
    ['五', 'gghg', 0], // 成字字根：键名码 + 首笔 + 次笔 + 末笔
    ['一', 'ggll', 1, 'g'], // 笔画不足，末位补 l
  ]);

  /** 收满 count 题，按题面归并出「字根 → 编码」 */
  const collect = (count: number) => {
    const source = createRadicalCodeSource({ keys: ['g' as WubiKey], count }, MAP);
    const qState = source.init();
    const byGlyph = new Map<string, string[]>();
    for (let i = 0; i < count; i++) {
      const q = source.next(qState);
      byGlyph.set(q.prompt, q.answerKeys);
    }
    return byGlyph;
  };

  it('答案是字根的真实编码，而不是「所属键重复 4 次」', () => {
    const byGlyph = collect(9);

    expect(byGlyph.get('王')).toEqual(['g', 'g', 'g', 'g']);
    expect(byGlyph.get('五')).toEqual(['g', 'g', 'h', 'g']);
    expect(byGlyph.get('一')).toEqual(['g', 'g', 'l', 'l']);
  });

  it('同一关内的答案不全都相同（旧实现恒为 gggg）', () => {
    const answers = new Set(
      [...collect(9).values()].map((keys) => keys.join('')),
    );

    expect(answers.size).toBeGreaterThan(1);
  });

  it('字根不是「字」，charCount 为 0（不计入累计字数）', () => {
    const source = createRadicalCodeSource({ keys: ['g' as WubiKey], count: 1 }, MAP);

    expect(source.next(source.init()).charCount).toBe(0);
  });

  it('本键没有可独立成字的字根时 init 抛错（由调用方显示为启动失败）', () => {
    const onlyApiChar = buildCharMap([['啊', 'kbsk', 0]]);
    const source = createRadicalCodeSource({ keys: ['k' as WubiKey], count: 5 }, onlyApiChar);

    expect(() => source.init()).toThrow();
  });
});

describe('getLessonCharPool — 关卡单字池（回归）', () => {
  const MAP = buildCharMap([
    ['王', 'gggg', 0], // G 键名字
    ['五', 'gghg', 0], // G 成字字根
    ['一', 'ggll', 1, 'g'], // G 成字字根（笔画不足补 l）
    ['班', 'gytg', 0], // 首码 g，但要用未学的 t/y
    ['到', 'gcfg', 2, 'gc'], // 首码 g，但含未学的 c/f
    ['上', 'hhgg', 1, 'h'], // 首码 h：g 只是第 3、4 码
    ['心', 'nyny', 0], // g 是末笔识别码，根本不含 G 键字根
    ['䜣', 'yrh', 0], // 扩展区汉字
  ]);

  // 第一关（G）：已学 = {g}
  const gPool = () => getLessonCharPool(
    LESSON_ORDER[0].key,
    getLearnedKeys(LESSON_ORDER[0].id),
    MAP,
  );

  it('本关字根中能独立成字者**无条件**收录（这就是本关要学的内容）', () => {
    const pool = gPool();

    expect(pool).toContain('王');
    expect(pool).toContain('五');
    // 一 = ggll 要用 l，但它仍是本关字根，必须能练到
    expect(pool).toContain('一');
  });

  it('本关字根排在其他字之前', () => {
    // MAP 里 G 的字根按「王 青 戋 五 一」出现，能查到编码的是 王/五/一
    expect(gPool().slice(0, 3)).toEqual(['王', '五', '一']);
  });

  it('其余字只收「首码 = 本键 且 编码键位全属已学键」', () => {
    const pool = gPool();

    expect(pool).not.toContain('班'); // gytg 要用 t/y（未学）
    expect(pool).not.toContain('到'); // gcfg 要用 c/f（未学）
  });

  it('排除首码不是本键的字（旧实现只看「编码里有没有 g」）', () => {
    const pool = gPool();

    expect(pool).not.toContain('上'); // hhgg
    expect(pool).not.toContain('心'); // nyny，g 只是识别码
  });

  it('排除扩展区 / 兼容汉字', () => {
    expect(gPool()).not.toContain('䜣');
  });

  it('已学键扩展后，只用这些键就能打出的字会被收录', () => {
    const map = buildCharMap([['土', 'ffff', 0], ['二', 'fgg', 0]]);

    // F 关：已学 = {g, f}
    const pool = getLessonCharPool(
      LESSON_ORDER[1].key,
      getLearnedKeys(LESSON_ORDER[1].id),
      map,
    );

    expect(pool).toContain('土'); // F 键成字字根
    expect(pool).toContain('二'); // 编码 fgg ⊆ {g, f}
  });
});

describe('isPracticableChar', () => {
  it('接受 BMP 常用汉字', () => {
    expect(isPracticableChar('王')).toBe(true);
    expect(isPracticableChar('啊')).toBe(true);
  });

  it('拒绝扩展区 / 兼容汉字与代理对', () => {
    expect(isPracticableChar('䜣')).toBe(false); // 扩展 A
    expect(isPracticableChar('㣺')).toBe(false); // 扩展 A
    expect(isPracticableChar('𩂊')).toBe(false); // 扩展 B（代理对）
  });

  it('拒绝空串与多字串', () => {
    expect(isPracticableChar('')).toBe(false);
    expect(isPracticableChar('中国')).toBe(false);
  });
});

describe('关卡单字池（真实码表）', () => {
  let realMap: CharMap;

  beforeAll(async () => {
    const chars = (await import('../../data/generated/chars.json')).default as unknown as {
      entries: [string, string, number, string?][];
    };
    realMap = buildCharMap(chars.entries);
  });

  it('每个关卡的池子都非空', () => {
    const empty = LESSON_ORDER.filter(
      (l) => getLessonCharPool(l.key, getLearnedKeys(l.id), realMap).length === 0,
    );

    expect(empty.map((l) => l.id)).toEqual([]);
  });

  it('第一关（只学了 G）练的就是 G 的字根本身', () => {
    const pool = getLessonCharPool(
      LESSON_ORDER[0].key,
      getLearnedKeys(LESSON_ORDER[0].id),
      realMap,
    );

    console.log(`  [pool] G 关 ${pool.length} 字：${pool.join('')}`);
    // G 的成字字根：王（键名字）、五、戋、一
    expect(pool).toContain('王');
    expect(pool).toContain('五');
    expect(pool).toContain('一');
    // 「青头」在数据里记作 '青'，但 青 = gef 要用 月(E)、土(F) —— 不是成字字根
    expect(pool).not.toContain('青');
  });

  it('池中任何字的编码都不会用到未学键（核心保证：不出现没学过的字根）', () => {
    // 允许的键 = 已学键 ∪「成字字根取码规则」用键（五个首笔键 + 补位键 L）
    const RULE_KEYS = new Set(['g', 'h', 't', 'y', 'n', 'l']);
    const offenders: string[] = [];

    for (const lesson of LESSON_ORDER) {
      const learned = getLearnedKeys(lesson.id);

      for (const char of getLessonCharPool(lesson.key, learned, realMap)) {
        const code = realMap.get(char)!.code;
        const unlearned = [...code].filter((k) => !learned.has(k as WubiKey) && !RULE_KEYS.has(k));
        if (unlearned.length > 0) {
          offenders.push(`${lesson.id}/${char}(${code}) 未学键 ${unlearned.join('')}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('池中不含扩展区 / 兼容汉字', () => {
    const bad: string[] = [];

    for (const lesson of LESSON_ORDER) {
      for (const char of getLessonCharPool(lesson.key, getLearnedKeys(lesson.id), realMap)) {
        if (!isPracticableChar(char)) bad.push(`${lesson.id}/${char}`);
      }
    }

    expect(bad).toEqual([]);
  });
});

describe('getLearnedKeys — 课程键集合', () => {
  it('已学键按课程顺序累积', () => {
    const [first, second] = LESSON_ORDER;

    expect(getLearnedKeys(first.id).size).toBe(1);
    expect(getLearnedKeys(second.id).size).toBe(2);
    expect(getLearnedKeys(second.id).has(second.key)).toBe(true);
  });

  it('第一关只学过本关一个键（不额外放开笔画键）', () => {
    const learned = getLearnedKeys(LESSON_ORDER[0].id);

    expect(learned.size).toBe(1);
    expect(learned.has(LESSON_ORDER[0].key)).toBe(true);
  });

  it('最后一关时全部键都已学', () => {
    expect(getLearnedKeys(LESSON_ORDER[LESSON_ORDER.length - 1].id).size)
      .toBe(LESSON_ORDER.length);
  });

  it('不存在的关卡返回空集合', () => {
    expect(getLearnedKeys('不存在的关卡').size).toBe(0);
  });
});

/*
 * 题序可复现性。
 *
 * 「刷新后接着上一轮继续」不序列化任何题源内部状态（`internal.used` 是 Set，
 * 存不进 JSON），而是靠**同一种子重建题源 + 空转到第 N 题**来复原。
 * 所以「同一种子 ⇒ 同一题序」是那个机制成立的前提，必须逐源锁住。
 *
 * 顺带也验证了「抽样顺序只由种子与调用次数决定」—— 如果某个源在
 * 非随机的地方引入了不稳定性（比如依赖 Date），这里会红。
 */
describe('题序可复现（种子）', () => {
  /** 抽 n 题，压成可比对的字符串 */
  const draw = (source: ReturnType<typeof createRadicalIdentifySource>, n: number) => {
    const state = source.init();
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const q = source.next({ ...state, index: i });
      out.push(`${q.prompt}|${q.answerKeys.join('')}`);
    }
    return out;
  };

  it('字根定位：同一种子题序完全一致', () => {
    const make = () => createRadicalIdentifySource({
      direction: 'forward', scope: 'all', count: 20, seed: 20261006,
    });
    expect(draw(make(), 20)).toEqual(draw(make(), 20));
  });

  it('字根定位：不同种子题序不同', () => {
    const a = createRadicalIdentifySource({
      direction: 'forward', scope: 'all', count: 20, seed: 1,
    });
    const b = createRadicalIdentifySource({
      direction: 'forward', scope: 'all', count: 20, seed: 2,
    });
    expect(draw(a, 20)).not.toEqual(draw(b, 20));
  });

  it('字根序列：同一种子题序一致（该源有三处内联随机）', () => {
    const make = () => createRadicalSequenceSource({ count: 20, seed: 42 });
    expect(draw(make(), 20)).toEqual(draw(make(), 20));
  });

  it('字根定位反向：选项（choices）顺序也随种子固定', () => {
    const make = () => createRadicalIdentifySource({
      direction: 'backward', scope: 'all', count: 20, seed: 555,
    });
    const choicesOf = (s: ReturnType<typeof createRadicalIdentifySource>) => {
      const state = s.init();
      return Array.from({ length: 20 }, (_, i) => s.next({ ...state, index: i }).choices?.join(','));
    };
    expect(choicesOf(make())).toEqual(choicesOf(make()));
  });

  it('简码 / 词组：同一种子题序一致', () => {
    const simplified = () => createSimplifiedCodeSource(
      { level: 'all', count: 15, seed: 77 }, CHAR_MAP,
    );
    expect(draw(simplified(), 15)).toEqual(draw(simplified(), 15));

    const phrase = () => createPhraseCodeSource(
      { length: 2, count: 10, seed: 88 }, PHRASE_MAP,
    );
    expect(draw(phrase(), 10)).toEqual(draw(phrase(), 10));
  });

  it('空转到第 N 题 == 直接抽 N 题（恢复机制依赖这一点）', () => {
    /*
     * 恢复现场的做法是：重建题源后用同一个种子空转 N 次，再取第 N+1 题。
     * 这里直接对比「空转后取到的题」与「连抽后取到的同一题」。
     */
    const first = createRadicalIdentifySource({
      direction: 'forward', scope: 'all', count: 10, seed: 31337,
    });
    const second = createRadicalIdentifySource({
      direction: 'forward', scope: 'all', count: 10, seed: 31337,
    });

    const s1 = first.init();
    const s2 = second.init();
    for (let i = 0; i < 6; i++) first.next({ ...s1, index: i });
    const seventh = first.next({ ...s1, index: 6 });

    let seventhDirect = second.next({ ...s2, index: 0 });
    for (let i = 1; i <= 6; i++) seventhDirect = second.next({ ...s2, index: i });

    expect(seventh.prompt).toBe(seventhDirect.prompt);
    expect(seventh.answerKeys).toEqual(seventhDirect.answerKeys);
  });
});
