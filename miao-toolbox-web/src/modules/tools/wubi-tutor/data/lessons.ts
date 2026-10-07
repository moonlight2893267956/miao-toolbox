/**
 * 分区闯关课程结构
 *
 * 课程 = 5 个区 → 每区 5 个键位关卡 → 每关 3 个环节。
 * 关卡按 ZONE_COURSE 的数组顺序线性解锁。
 */

import { WUBI_KEYS, ZONE_LABELS, getKeysByZone, type WubiKey, type WubiZone } from './radicals';
import type { PracticeMode } from '../utils/wubi/questionSource';

// ─── 类型定义 ────────────────────────────────────────────

export type StageKind = 'recognize' | 'input' | 'chars';

export interface LessonStage {
  kind: StageKind;
  /** 对应的练习模式（复用 Epic 3 的题源） */
  mode: PracticeMode;
  label: string;
}

export interface Lesson {
  /** 关卡 id = 键位字母 */
  id: string;
  key: WubiKey;
  zone: WubiZone;
  /** 关卡标题，如「G · 王旁青头戋五一」 */
  title: string;
  /** 键名字，用于卡片展示 */
  keyNameChar: string;
  /** 该键全部字根字形 */
  radicals: string[];
  stages: LessonStage[];
}

export interface ZoneCourse {
  zone: WubiZone;
  label: string;
  /** 该区的键位（按物理顺序） */
  keys: WubiKey[];
  lessons: Lesson[];
}

// ─── 三环节定义 ──────────────────────────────────────────

export const LESSON_STAGES: LessonStage[] = [
  { kind: 'recognize', mode: 'radical-identify', label: '字根认知' },
  { kind: 'input', mode: 'radical-sequence', label: '字根编码' },
  { kind: 'chars', mode: 'char-code', label: '单字练习' },
];

/** 通关判定所依据的环节（单字练习） */
export const PASSING_STAGE: StageKind = 'chars';

// ─── 课程构建 ────────────────────────────────────────────

function buildLesson(key: WubiKey): Lesson {
  const meta = WUBI_KEYS.find((m) => m.key === key)!;
  return {
    id: key,
    key,
    zone: meta.zone,
    title: `${key.toUpperCase()} · ${meta.mnemonic}`,
    keyNameChar: meta.keyNameChar,
    radicals: meta.radicals.map((r) => r.glyph),
    stages: LESSON_STAGES.map((s) => ({ ...s })),
  };
}

const ZONE_ORDER: WubiZone[] = ['heng', 'shu', 'pie', 'na', 'zhe'];

export const ZONE_COURSE: ZoneCourse[] = ZONE_ORDER.map((zone) => {
  const keys = getKeysByZone(zone).map((m) => m.key);
  return {
    zone,
    label: ZONE_LABELS[zone],
    keys,
    lessons: keys.map(buildLesson),
  };
});

/** 关卡线性顺序（用于解锁判定） */
export const LESSON_ORDER: Lesson[] = ZONE_COURSE.flatMap((z) => z.lessons);

/** 关卡总数 */
export const TOTAL_LESSONS = LESSON_ORDER.length;

/** 按 id 获取关卡 */
export function getLesson(id: string): Lesson | undefined {
  return LESSON_ORDER.find((l) => l.id === id);
}

/** 获取某关卡在顺序中的下标（-1 表示不存在） */
export function getLessonIndex(id: string): number {
  return LESSON_ORDER.findIndex((l) => l.id === id);
}

/**
 * 截至某关卡（**含本关**）已学过的键位。
 *
 * 关卡不存在时返回空集合。
 */
export function getLearnedKeys(lessonId: string): Set<WubiKey> {
  const index = getLessonIndex(lessonId);
  if (index < 0) return new Set();
  return new Set(LESSON_ORDER.slice(0, index + 1).map((l) => l.key));
}

/** 获取某关卡所属的区课程 */
export function getZoneOfLesson(id: string): ZoneCourse | undefined {
  const lesson = getLesson(id);
  if (!lesson) return undefined;
  return ZONE_COURSE.find((z) => z.zone === lesson.zone);
}

/** 全键盘随机模式（全部关卡通关后解锁） */
export const FREE_PRACTICE_MODE = '全键盘随机';
