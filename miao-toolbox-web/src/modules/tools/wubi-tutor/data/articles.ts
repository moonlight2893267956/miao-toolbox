/**
 * 内置练习文章
 *
 * 按难度分级：
 * - beginner（入门）：常用一二级字为主，短句
 * - intermediate（进阶）：含一般常用字
 * - challenge（挑战）：含难字与混合标点
 *
 * ── 内容配比（每档四篇，正好对应四种风格）──
 *
 * 1. wubi-topic（五笔主题）：讲字根 / 键位 / 简码，和字根知识互相印证
 * 2. classic（经典）：**公有领域**篇目，语料真实优美
 * 3. high-freq（高频字）：刻意重复一二级高频字，熟练度导向
 * 4. modern（现代）：贴近日常阅读
 *
 * ── 写文章时的两条硬约束 ──
 *
 * 1. **不要用 `——` / `……`**：它们落在 General Punctuation 区，
 *    既不属于 CJK 符号区（U+3000-303F）也不属于 ASCII 标点区，
 *    会被 articleTokenizer 判成「无编码汉字」→ 渲染成跳过态、计入缺码字数。
 *    安全标点：`、。！？；：（）《》「」`（全部落在 U+3000-303F / 全角区）。
 *    现有的 art-5 用了「——」，属于挑战档可接受的例外（实测正好 2 个缺码字）。
 *
 * 2. **难度靠生僻字、不靠缺码字**：码表收录 12452 字，绝大多数难字都有码。
 *    挑战档应用「有码但生僻」的字拉开差距，而不是靠缺码字假难度。
 *    实测：入门档生僻字 2~5 个，进阶 4~10 个，挑战 6~10 个。
 *
 * 分级是**人工判断**；`data/articles.test.ts` 只负责客观校验
 * （缺码字数、生僻字数、常用度分位、字数区间），防止以后新增文章越界。
 * 实测「平均码长」无法区分档位（3.64/3.68/3.68），故不作为分级依据 —— 详见
 * `utils/wubi/articleAnalysis.ts` 顶部说明。
 */

import type { WubiKey } from './radicals';

export type ArticleDifficulty = 'beginner' | 'intermediate' | 'challenge';

/** 文章风格；classic 一律为公有领域篇目，必须填 author */
export type ArticleStyle = 'wubi-topic' | 'classic' | 'high-freq' | 'modern';

export interface Article {
  id: string;
  title: string;
  difficulty: ArticleDifficulty;
  style: ArticleStyle;
  text: string;
  /** 公有领域篇目的作者 / 出处，便于核对与后续替换 */
  author?: string;
  /** 选填：给「五笔主题」这类文章标注关联键位 */
  relatedKeys?: WubiKey[];
}

export const DIFFICULTY_LABELS: Record<ArticleDifficulty, string> = {
  beginner: '入门',
  intermediate: '进阶',
  challenge: '挑战',
};

export const STYLE_LABELS: Record<ArticleStyle, string> = {
  'wubi-topic': '五笔主题',
  classic: '经典',
  'high-freq': '高频字',
  modern: '现代',
};

/** 分组的固定顺序：入门 → 进阶 → 挑战（UI 直接 map，不要依赖数组顺序） */
export const DIFFICULTY_ORDER: ArticleDifficulty[] = [
  'beginner',
  'intermediate',
  'challenge',
];

export const ARTICLES: Article[] = [
  // ── 入门 ──
  {
    id: 'art-1',
    title: '五笔入门',
    difficulty: 'beginner',
    style: 'wubi-topic',
    text: '五笔字型是一种按字形编码的输入法。它把汉字拆成字根，每个字根对应一个键位。学会五笔以后，打字的速度会明显提高。',
  },
  {
    id: 'art-2',
    title: '学习的方法',
    difficulty: 'beginner',
    style: 'high-freq',
    text: '学习任何一门技能，都需要时间和耐心。先把基础打牢，再一步一步向前走。每天练习一点，时间长了就会有明显的进步。',
  },
  {
    id: 'art-7',
    title: '五个区，二十五个键',
    difficulty: 'beginner',
    style: 'wubi-topic',
    relatedKeys: ['g', 'h', 'l', 'n'],
    text:
      '五笔把键盘分成五个区，每区五个键，一共二十五个键。每个键都有一个名字：横区是王字，竖区是日月。用手指记住位置，看到字就能想到键，这是五笔的第一步。',
  },
  {
    id: 'art-8',
    title: '静夜思',
    author: '李白',
    difficulty: 'beginner',
    style: 'classic',
    text: '床前明月光，疑是地上霜。举头望明月，低头思故乡。',
  },
  {
    id: 'art-9',
    title: '一个平常的早上',
    difficulty: 'beginner',
    style: 'high-freq',
    text:
      '早上起来，先把窗子打开。新鲜的空气进来，一天就开始了。我烧一壶水，泡一杯茶，坐在桌前看外面。街上人来人往，谁都在赶时间。我不想赶，今天只做一件事：把这几行字慢慢打完。',
  },
  {
    id: 'art-10',
    title: '越来越薄的手机',
    difficulty: 'beginner',
    style: 'modern',
    text:
      '现在的手机越来越轻，屏幕却越来越大。我们用手指在玻璃上点一点，就能找到想看的东西。消息来得很快，新闻也是。快是好事，只是有时候会让人忘了慢下来想一想。',
  },

  // ── 进阶 ──
  {
    id: 'art-3',
    title: '春天的田野',
    difficulty: 'intermediate',
    style: 'modern',
    text:
      '春天来了，田野里一片生机。远处的山峦披上嫩绿的新装，近处的小河静静流淌。农人忙着播种，孩子们在田埂上奔跑欢笑，到处是蓬勃的气象。',
  },
  {
    id: 'art-4',
    title: '城市与乡村',
    difficulty: 'intermediate',
    style: 'modern',
    text:
      '城市有高耸的建筑和繁忙的街道，乡村有广阔的田野和宁静的黄昏。两种生活各有优劣：前者节奏快、机会多，后者空间大、人心静。选择哪一种，取决于你真正想要什么。',
  },
  {
    id: 'art-11',
    title: '认识字根',
    difficulty: 'intermediate',
    style: 'wubi-topic',
    relatedKeys: ['a', 'm', 'q'],
    text:
      '字根是构成汉字的基本部件。一个字往往可以拆成两到四个字根，每个字根都在某个键上。记住字根的位置，看到字就能拆出编码。常用的字根并不多，反复练熟了，速度自然就上来了。',
  },
  {
    id: 'art-12',
    title: '春（节选）',
    author: '朱自清《春》',
    difficulty: 'intermediate',
    style: 'classic',
    text:
      '盼望着，盼望着，东风来了，春天的脚步近了。一切都像刚睡醒的样子，焕然一新。山朗润起来了，水涨起来了，太阳的脸红起来了。小草偷偷地从土里钻出来，嫩嫩的，绿绿的。',
  },
  {
    id: 'art-13',
    title: '外婆的菜地',
    difficulty: 'intermediate',
    style: 'high-freq',
    text:
      '小时候住在外婆家，院子后面有一片菜地。外婆每天天不亮就起来，先浇水，再施肥，然后蹲在田埂上摘菜。我总跟在她身后，想学她手里的动作，可总是学不像。有一年春天，她病了，我第一次拿起小锄头，把杂草一根根拔掉。那天我忽然明白，照顾一件事，原来需要这么多耐心。',
  },
  {
    id: 'art-14',
    title: '文字是怎么打出去的',
    difficulty: 'intermediate',
    style: 'modern',
    text:
      '上网的时候，我们输入的文字要先经过输入法，再变成可以传输的编码。五笔就是其中一种。它不依赖词库，只看字形：把字拆成字根，给每个字根一个键位，最多四键就能打完一个字。看起来慢，练熟之后却比拼音快得多。计算设备愿意为你的熟练付账，这就是练习的意义。',
  },

  // ── 挑战 ──
  {
    id: 'art-5',
    title: '论沉思之价值',
    difficulty: 'challenge',
    style: 'modern',
    text:
      '在喧嚣的尘世中，沉思是一种稀缺的品质。当我们剥离表象的浮华，凝视事物的本质，方能洞悉那些幽微而深邃的真理。此非逃避，恰是最彻底的清醒——唯有静默，才配得上如此磅礴的思想。',
  },
  {
    id: 'art-6',
    title: '汉字之美',
    difficulty: 'challenge',
    style: 'wubi-topic',
    text:
      '汉字之美，在于形、音、义的浑然一体。「淼」字以三水叠现浩渺，「懿」字借壹恣彰显德行美善。每一个笔画，都凝结着先民对天地万物的凝视与哲思。',
  },
  {
    id: 'art-15',
    title: '简码与识别码',
    difficulty: 'challenge',
    style: 'wubi-topic',
    relatedKeys: ['x', 'y'],
    text:
      '有些字只取前两个键就够了，这叫简码；可有些字拆到最后，笔画都对不上，那就得看识别码。识别码是最后一键，交代这个字的长短和左右结构。遇到「淼」「懿」这样的生僻字，与其死记硬背，不如回到字根表，把它的部件一个一个认出来。',
  },
  {
    id: 'art-16',
    title: '定风波',
    author: '苏轼《定风波》',
    difficulty: 'challenge',
    style: 'classic',
    text:
      '莫听穿林打叶声，何妨吟啸且徐行。竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。料峭春风吹酒醒，微冷，山头斜照却相迎。回首向来萧瑟处，归去，也无风雨也无晴。',
  },
  {
    id: 'art-17',
    title: '河边的那条路',
    difficulty: 'challenge',
    style: 'high-freq',
    text:
      '下班以后，我常常去河边走一走。河边的柳树刚长出新叶，风一吹就轻轻摇。有人在跑步，有人推着车慢慢走，还有人停下来看水里的倒影。我不着急，只是把手插在口袋里，一步一步地走。日子就是这样一天天过的，没必要每一分钟都安排得满满当当。',
  },
  {
    id: 'art-18',
    title: '读机器写的字',
    difficulty: 'challenge',
    style: 'modern',
    text:
      '人工智能写出来的文字，有时候读起来很顺，仔细看却经不起推敲。它把词组拼得很准，却不理解一个词在句子里的分量。人写文章会犹豫、会改口、会在夜里推翻白天想好的一切，这种反复才是思考的痕迹。所以读东西的时候，别只看它说了什么，也要看它在哪些地方含糊过去。',
  },
];

/** 按难度分组 */
export function getArticlesByDifficulty(difficulty: ArticleDifficulty): Article[] {
  return ARTICLES.filter((a) => a.difficulty === difficulty);
}

/**
 * 按难度分组，顺序由 DIFFICULTY_ORDER 固定。
 *
 * UI 直接 map 这个结果即可渲染分组列表 —— 不依赖 ARTICLES 的数组顺序，
 * 以后有人在数组中间插文章也不会打乱分组的先后。
 */
export interface ArticleGroup {
  difficulty: ArticleDifficulty;
  label: string;
  items: Article[];
}

export function groupArticlesByDifficulty(): ArticleGroup[] {
  return DIFFICULTY_ORDER.map((difficulty) => ({
    difficulty,
    label: DIFFICULTY_LABELS[difficulty],
    items: getArticlesByDifficulty(difficulty),
  })).filter((group) => group.items.length > 0);
}

/** 估算完成时间（分钟）：按每分钟 20 字粗估 */
export function estimateMinutes(text: string): number {
  return Math.max(1, Math.round(Array.from(text).length / 20));
}