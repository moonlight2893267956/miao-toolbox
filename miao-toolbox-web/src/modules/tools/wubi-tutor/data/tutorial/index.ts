/**
 * 教程元信息与动态 import 表
 *
 * 每章正文以 Markdown 字符串存于独立模块，按章懒加载。
 * 自定义标记 `[[根:亻]]` / `[[字:照]]` 由渲染层解析为可交互元素。
 *
 * !! 禁止 dangerouslySetInnerHTML — 全部经 react-markdown 渲染 !!
 */

export interface TutorialChapter {
  /** 章节编号（1~9） */
  id: number;
  /** 章节标题 */
  title: string;
  /** 一句话目标：读完你应该能做什么 */
  goal: string;
  /** 对应练习 scope（点击「去练习」跳转时携带） */
  practiceScope: string;
  /** 预计阅读时间（分钟） */
  readTime: number;
  /** 动态 import 函数（返回 Markdown 字符串） */
  load: () => Promise<string>;
}

export const TUTORIAL_CHAPTERS: TutorialChapter[] = [
  {
    id: 1,
    title: '五笔是什么',
    goal: '理解五笔字型的基本原理：为什么用字根而不是拼音',
    practiceScope: 'key-position',
    readTime: 3,
    load: () => import('./ch01.md?raw').then((m) => m.default),
  },
  {
    id: 2,
    title: '键盘分区与指法',
    goal: '记住 5 区 25 键的物理位置与标准指法',
    practiceScope: 'key-position',
    readTime: 4,
    load: () => import('./ch02.md?raw').then((m) => m.default),
  },
  {
    id: 3,
    title: '五种笔画与字根分布规律',
    goal: '掌握「横竖撇捺折」五区划分与字根起笔对应关系',
    practiceScope: 'radical',
    readTime: 5,
    load: () => import('./ch03.md?raw').then((m) => m.default),
  },
  {
    id: 4,
    title: '拆字五原则',
    goal: '能按「书写顺序、取大优先、兼顾直观、能连不交、能散不连」拆字',
    practiceScope: 'single-char',
    readTime: 6,
    load: () => import('./ch04.md?raw').then((m) => m.default),
  },
  {
    id: 5,
    title: '单字取码规则',
    goal: '按「键名字 / 单笔画 / 成字字根 / 合体字」四类，分别说出取码方式',
    practiceScope: 'single-char',
    readTime: 8,
    load: () => import('./ch05.md?raw').then((m) => m.default),
  },
  {
    id: 6,
    title: '识别码',
    goal: '掌握末笔笔画 × 字型结构 → 识别码键位的推导方法',
    practiceScope: 'single-char',
    readTime: 6,
    load: () => import('./ch06.md?raw').then((m) => m.default),
  },
  {
    id: 7,
    title: '简码体系',
    goal: '理解一级、二级、三级简码的规则与使用场景',
    practiceScope: 'simplified',
    readTime: 4,
    load: () => import('./ch07.md?raw').then((m) => m.default),
  },
  {
    id: 8,
    title: '词组规则',
    goal: '掌握二字、三字、四字及多字词组的取码方法',
    practiceScope: 'phrase',
    readTime: 5,
    load: () => import('./ch08.md?raw').then((m) => m.default),
  },
  {
    id: 9,
    title: '重码与 Z 键',
    goal: '了解重码处理方式与 Z 键的万能学习键功能',
    practiceScope: 'single-char',
    readTime: 3,
    load: () => import('./ch09.md?raw').then((m) => m.default),
  },
];

/** 获取章节数量 */
export const CHAPTER_COUNT = TUTORIAL_CHAPTERS.length;

/** 按 id 获取章节元信息 */
export function getChapter(id: number): TutorialChapter | undefined {
  return TUTORIAL_CHAPTERS.find((c) => c.id === id);
}
