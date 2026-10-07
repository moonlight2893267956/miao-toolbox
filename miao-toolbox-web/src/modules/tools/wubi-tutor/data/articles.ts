/**
 * 内置练习文章
 *
 * 按难度分级：
 * - beginner（入门）：常用一二级字为主，短句
 * - intermediate（进阶）：含一般常用字
 * - challenge（挑战）：含难字与混合标点
 */

export type ArticleDifficulty = 'beginner' | 'intermediate' | 'challenge';

export interface Article {
  id: string;
  title: string;
  difficulty: ArticleDifficulty;
  text: string;
}

export const DIFFICULTY_LABELS: Record<ArticleDifficulty, string> = {
  beginner: '入门',
  intermediate: '进阶',
  challenge: '挑战',
};

export const ARTICLES: Article[] = [
  {
    id: 'art-1',
    title: '五笔入门',
    difficulty: 'beginner',
    text: '五笔字型是一种按字形编码的输入法。它把汉字拆成字根，每个字根对应一个键位。学会五笔以后，打字的速度会明显提高。',
  },
  {
    id: 'art-2',
    title: '学习的方法',
    difficulty: 'beginner',
    text: '学习任何一门技能，都需要时间和耐心。先把基础打牢，再一步一步向前走。每天练习一点，时间长了就会有明显的进步。',
  },
  {
    id: 'art-3',
    title: '春天的田野',
    difficulty: 'intermediate',
    text: '春天来了，田野里一片生机。远处的山峦披上嫩绿的新装，近处的小河静静流淌。农人忙着播种，孩子们在田埂上奔跑欢笑，到处是蓬勃的气象。',
  },
  {
    id: 'art-4',
    title: '城市与乡村',
    difficulty: 'intermediate',
    text: '城市有高耸的建筑和繁忙的街道，乡村有广阔的田野和宁静的黄昏。两种生活各有优劣：前者节奏快、机会多，后者空间大、人心静。选择哪一种，取决于你真正想要什么。',
  },
  {
    id: 'art-5',
    title: '论沉思之价值',
    difficulty: 'challenge',
    text: '在喧嚣的尘世中，沉思是一种稀缺的品质。当我们剥离表象的浮华，凝视事物的本质，方能洞悉那些幽微而深邃的真理。此非逃避，恰是最彻底的清醒——唯有静默，才配得上如此磅礴的思想。',
  },
  {
    id: 'art-6',
    title: '汉字之美',
    difficulty: 'challenge',
    text: '汉字之美，在于形、音、义的浑然一体。「淼」字以三水叠现浩渺，「懿」字借壹恣彰显德行美善。每一个笔画，都凝结着先民对天地万物的凝视与哲思。',
  },
];

/** 按难度分组 */
export function getArticlesByDifficulty(difficulty: ArticleDifficulty): Article[] {
  return ARTICLES.filter((a) => a.difficulty === difficulty);
}

/** 估算完成时间（分钟）：按每分钟 20 字粗估 */
export function estimateMinutes(text: string): number {
  return Math.max(1, Math.round(Array.from(text).length / 20));
}
