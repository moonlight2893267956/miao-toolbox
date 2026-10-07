/**
 * 五笔练习室 — 持久化存储层
 *
 * 独立命名空间：miao-wubi:v1:{userId}:{key}
 * !! 不得复用 shared/utils/tabPageStorage — TabContext 会在关页签时清除 !!
 *
 * 存储分区：
 * - progress: 阅读进度、练习进度（按日聚合）
 * - stats: 统计数据（按日聚合，保留 90 天）
 * - review: 错题/难字本（上限 500 条）
 * - settings: 用户设置
 * - meta: schemaVersion 等元信息
 *
 * 写入时机：会话结束 / 设置变更 / 复习答题（批量写入，不高频）
 * 读取时机：页面初始化
 *
 * 降级：localStorage 不可用时退为内存态 + 一次性 Toast
 */

// ─── 类型定义 ────────────────────────────────────────────

import type { CourseProgress } from './course';
import type { ModeRecords } from './sessionStats';
import type { KeyError } from './session';
// 仅类型导入（编译期擦除，不给存储层引入运行时依赖）
import type { WubiTabKey } from '../../types';

export type StorageKey = 'progress' | 'stats' | 'review' | 'settings' | 'meta';

export interface StorageMeta {
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface DailyStat {
  date: string;        // YYYY-MM-DD
  totalKeystrokes: number;
  errorKeystrokes: number;
  /**
   * 正确完成的**汉字数**（不是题数）。
   *
   * 词组题按词组长度计，文章题按整篇可打字数计；
   * 键位 / 字根类练习不涉及汉字，记 0。
   *
   * ⚠️ 历史数据遗留：本字段曾用「完成题数」填充，因此旧记录里
   * 键位 / 字根练习的字数被虚增、词组被少算。该偏差只影响历史累计值，
   * 不做迁移（迁移需要清空学习数据，代价大于收益）。
   */
  correctChars: number;
  sessionsCompleted: number;
  practiceTimeSec: number;
  /**
   * 当日的按键配对（期望键 → 实际按下的键），易混字根榜的数据来源。
   *
   * 可选：旧记录没有这个字段，读取时按空数组处理，因此**不需要版本迁移**。
   *
   * !! 为什么必须落盘 !!
   * 此前它只活在会话状态里 —— 结果面板一关，这份数据就永久没了，
   * 「易混字根榜」也就只能在每轮结束的那一刻看到一次。
   */
  keyErrors?: KeyError[];
}

export interface ReviewItem {
  char: string;
  wrongCount: number;
  lastSeen: number;
  nextReview: number;   // timestamp，间隔重复
  source: 'auto' | 'manual';
  /**
   * 间隔重复级别（0 = 第 1 级 / 10 分钟）。
   * 可选以兼容早期数据；缺省视为 0，由 reviewScheduler 归一。
   */
  level?: number;
}

export interface ProgressData {
  tutorialChapter: number;
  masteredKeys: string[];
  masteredRadicals: string[];
  level1Mastered: string[];  // 已掌握的一级简码
  /** 课程闯关进度（Story 4.1） */
  course: CourseProgress;
  /** 成就解锁记录（Story 4.4） */
  achievements: string[];
  /** 各练习模式的最近一次/最佳成绩（Story 4.2 对比用） */
  modeRecords: ModeRecords;
}

export interface SettingsData {
  showVirtualKeyboard: boolean;
  showFingerHint: boolean;
  showMetricsBar: boolean;
  practiceMode: 'drill' | 'lenient';
  soundFeedback: boolean;
  /**
   * 上次停留的顶层 Tab。
   *
   * 持久化它是为了「刷新后回到原来的地方」—— 否则在练习页刷新会直接
   * 跳回学习页，用户得重新点一遍（实测反馈）。
   */
  lastTab: WubiTabKey;
}

export interface WubiStorageData {
  progress: ProgressData;
  stats: DailyStat[];
  review: ReviewItem[];
  settings: SettingsData;
  meta: StorageMeta;
}

// ─── 常量 ────────────────────────────────────────────────

const SCHEMA_VERSION = 1;
const NAMESPACE_PREFIX = 'miao-wubi:v1';
const STATS_MAX_DAYS = 90;
const REVIEW_MAX_ITEMS = 500;
/**
 * 单日保留的按键配对上界。
 *
 * 一轮 20 题最多几百次误按，一天练五轮就上千条 —— 全量存进 localStorage
 * 没有意义（榜只取 Top 5），还会拖慢每次读写。
 * 截断取「最近」而非「最多」：混淆手感是当下的问题，近期样本更有代表性。
 */
const KEY_ERRORS_PER_DAY_MAX = 600;

/** 合并同一天的按键配对并截断到上界 */
function mergeKeyErrors(
  prev: KeyError[] | undefined,
  next: KeyError[] | undefined,
): KeyError[] {
  const merged = [...(prev ?? []), ...(next ?? [])];
  return merged.length > KEY_ERRORS_PER_DAY_MAX
    ? merged.slice(merged.length - KEY_ERRORS_PER_DAY_MAX)
    : merged;
}

/** 全部存储分区（迁移备份时遍历） */
const ALL_KEYS: StorageKey[] = ['progress', 'stats', 'review', 'settings', 'meta'];

/**
 * 中断现场（练习进行中的快照）。
 *
 * !! 刻意**不属于**上面五个数据分区 !!
 *
 * 1. 它是「刚才」而不是「用户数据」：不该被导出 / 导入带走 ——
 *    导进另一台机器后恢复出一轮对不上的练习，比丢掉更糟。
 * 2. 它自带 TTL、随时会被丢弃，掺进版本迁移与备份逻辑只会互相干扰。
 * 3. 它的写入频率远高于其它分区（练习过程中持续更新），
 *    单独一个键便于整体清理，也方便排障时一眼看清。
 */
const INTERRUPTED_SESSION_KEY = 'interrupted-session';

const DEFAULT_SETTINGS: SettingsData = {
  showVirtualKeyboard: true,
  showFingerHint: true,
  showMetricsBar: true,
  practiceMode: 'drill',
  soundFeedback: false,
  lastTab: 'learn',
};

const DEFAULT_PROGRESS: ProgressData = {
  tutorialChapter: 1,
  masteredKeys: [],
  masteredRadicals: [],
  level1Mastered: [],
  course: { freeMode: false, lessons: {} },
  achievements: [],
  modeRecords: {},
};

/**
 * 把存储里读到的 progress 补全为完整结构。
 *
 * 必须做字段级兜底：旧版本数据缺少 modeRecords / achievements 等字段时，
 * 直接用 `undefined` 会让下游 `.lessons[id]` / `.map()` 抛错。
 */
export function normalizeProgress(raw: Partial<ProgressData> | null | undefined): ProgressData {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PROGRESS };

  return {
    tutorialChapter: typeof raw.tutorialChapter === 'number' ? raw.tutorialChapter : 1,
    masteredKeys: Array.isArray(raw.masteredKeys) ? raw.masteredKeys : [],
    masteredRadicals: Array.isArray(raw.masteredRadicals) ? raw.masteredRadicals : [],
    level1Mastered: Array.isArray(raw.level1Mastered) ? raw.level1Mastered : [],
    course: {
      freeMode: raw.course?.freeMode === true,
      lessons: raw.course?.lessons && typeof raw.course.lessons === 'object'
        ? raw.course.lessons
        : {},
    },
    achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
    modeRecords: raw.modeRecords && typeof raw.modeRecords === 'object'
      ? raw.modeRecords
      : {},
  };
}

// ─── 内存降级 ────────────────────────────────────────────

const memoryStore = new Map<string, string>();

function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__wt_storage_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

// ─── Key 构建 ────────────────────────────────────────────

function buildKey(userId: string, key: string): string {
  const uid = userId || 'anonymous';
  return `${NAMESPACE_PREFIX}:${uid}:${key}`;
}

// ─── 读写原语 ────────────────────────────────────────────

function readRaw(userId: string, key: string): string | null {
  const fullKey = buildKey(userId, key);
  if (isLocalStorageAvailable()) {
    return localStorage.getItem(fullKey);
  }
  return memoryStore.get(fullKey) ?? null;
}

function writeRaw(userId: string, key: string, value: string): void {
  const fullKey = buildKey(userId, key);
  if (isLocalStorageAvailable()) {
    localStorage.setItem(fullKey, value);
  } else {
    memoryStore.set(fullKey, value);
  }
}

// ─── 设置兜底 ────────────────────────────────────────────

/**
 * 设置字段级兜底 —— 与 `normalizeProgress` 同理。
 *
 * ⚠️ **新增设置字段时必须在这里补一行**，否则老用户升级后读到的是
 * `undefined`：`progress` 早就有这层兜底，`settings` 一直漏着，
 * 于是任何新增字段都会在旧数据上直接崩。
 *
 * 这里只保证「有值 + 类型对」；像 lastTab 这种**取值**是否合法，
 * 交给 UI 层的 `normalizeTabKey`（以 WUBI_TABS 为唯一事实来源）。
 * 不在本文件校验取值，是为了让存储层保持零运行时依赖。
 */
function normalizeSettings(raw: Partial<SettingsData>): SettingsData {
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

  return {
    showVirtualKeyboard: bool(raw.showVirtualKeyboard, DEFAULT_SETTINGS.showVirtualKeyboard),
    showFingerHint: bool(raw.showFingerHint, DEFAULT_SETTINGS.showFingerHint),
    showMetricsBar: bool(raw.showMetricsBar, DEFAULT_SETTINGS.showMetricsBar),
    practiceMode: raw.practiceMode === 'lenient' ? 'lenient' : DEFAULT_SETTINGS.practiceMode,
    soundFeedback: bool(raw.soundFeedback, DEFAULT_SETTINGS.soundFeedback),
    lastTab: typeof raw.lastTab === 'string'
      ? (raw.lastTab as WubiTabKey)
      : DEFAULT_SETTINGS.lastTab,
  };
}

// ─── JSON 读写 + 容错 ────────────────────────────────────

function readJSON<T>(userId: string, key: StorageKey, fallback: T): T {
  const raw = readRaw(userId, key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    /*
     * 损坏的 JSON：把原始内容备份到独立的 `:backup` 键，再把主键重置为默认值。
     * !! 不能写回同一个键 !! 否则下次加载会解析出 {_backup,_error} 垃圾对象，
     * 导致 settings.showVirtualKeyboard 等字段为 undefined。
     */
    writeRaw(userId, `${key}:backup`, raw);
    writeRaw(userId, key, JSON.stringify(fallback));
    return fallback;
  }
}

function writeJSON(userId: string, key: StorageKey, value: unknown): void {
  writeRaw(userId, key, JSON.stringify(value));
}

// ─── Schema 迁移 ────────────────────────────────────────
//
// 目前只有 v1，无迁移路径：版本不匹配时由 `loadAll` 备份全部原始分区，
// 再重置为默认值（见下方 loadAll 内的处理）。
//
// 未来新增 v2 时，在此添加 `migrateV1toV2(raw)` 并在 loadAll 中调用。
// !! 不要加回恒等函数 !! —— 那只会制造「已经迁移过」的假象，
// 实际数据仍在被静默丢弃。

// ─── 公开 API ────────────────────────────────────────────

export class WubiStorage {
  private userId: string;
  private localStorageAvailable: boolean;

  constructor(userId: string) {
    this.userId = userId || 'anonymous';
    this.localStorageAvailable = isLocalStorageAvailable();
  }

  /** localStorage 是否可用（不可用时为内存降级模式） */
  get isPersistent(): boolean {
    return this.localStorageAvailable;
  }

  /** 读取全部数据 */
  loadAll(): WubiStorageData {
    const meta = readJSON<StorageMeta>(this.userId, 'meta', {
      schemaVersion: SCHEMA_VERSION,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Schema 迁移检查：无迁移路径时备份 + 重置
    if (meta.schemaVersion !== SCHEMA_VERSION) {
      /*
       * 原始数据逐个备份到 `${key}:backup` 独立键（不与主键冲突），
       * 然后写入全新默认数据，避免每次加载都重复触发迁移。
       */
      for (const k of ALL_KEYS) {
        const raw = readRaw(this.userId, k);
        if (raw) writeRaw(this.userId, `${k}:backup`, raw);
      }

      const fresh = this.getDefaultData();
      this.persistAll(fresh);
      return fresh;
    }

    return {
      // 字段级兜底：旧数据缺少 modeRecords 等新字段时补齐，避免下游 undefined 崩溃
      progress: normalizeProgress(
        readJSON<Partial<ProgressData>>(this.userId, 'progress', DEFAULT_PROGRESS),
      ),
      stats: readJSON(this.userId, 'stats', []),
      review: readJSON(this.userId, 'review', []),
      // 与 progress 一样走字段级兜底：旧数据的 settings 里没有后续新增的字段
      settings: normalizeSettings(
        readJSON<Partial<SettingsData>>(this.userId, 'settings', DEFAULT_SETTINGS),
      ),
      meta,
    };
  }

  /** 全量落盘（迁移重置时使用） */
  private persistAll(data: WubiStorageData): void {
    writeJSON(this.userId, 'progress', data.progress);
    writeJSON(this.userId, 'stats', data.stats);
    writeJSON(this.userId, 'review', data.review);
    writeJSON(this.userId, 'settings', data.settings);
    writeJSON(this.userId, 'meta', data.meta);
  }

  /** 写入进度 */
  saveProgress(progress: ProgressData): void {
    writeJSON(this.userId, 'progress', progress);
    this.touchMeta();
  }

  /** 写入设置 */
  saveSettings(settings: SettingsData): void {
    writeJSON(this.userId, 'settings', settings);
    this.touchMeta();
  }

  /** 写入中断现场（已序列化的快照，序列化由 sessionSnapshot.ts 负责） */
  saveInterruptedSession(json: string): void {
    writeRaw(this.userId, INTERRUPTED_SESSION_KEY, json);
  }

  /** 读取中断现场；没有则为 null */
  loadInterruptedSession(): string | null {
    return readRaw(this.userId, INTERRUPTED_SESSION_KEY) || null;
  }

  /**
   * 清除中断现场。
   * 写空串而非 removeItem：`readRaw` 对空值一律当作「没有」，
   * 复用现有读写原语即可，不必新增一条删除路径。
   */
  clearInterruptedSession(): void {
    writeRaw(this.userId, INTERRUPTED_SESSION_KEY, '');
  }

  /** 追加一条日统计（同日覆盖不追加） */
  addDailyStat(stat: DailyStat): void {
    const stats = readJSON<DailyStat[]>(this.userId, 'stats', []);
    const idx = stats.findIndex((s) => s.date === stat.date);
    if (idx >= 0) {
      // 同日覆盖（累加）
      stats[idx] = {
        date: stat.date,
        totalKeystrokes: stats[idx].totalKeystrokes + stat.totalKeystrokes,
        errorKeystrokes: stats[idx].errorKeystrokes + stat.errorKeystrokes,
        correctChars: stats[idx].correctChars + stat.correctChars,
        sessionsCompleted: stats[idx].sessionsCompleted + stat.sessionsCompleted,
        practiceTimeSec: stats[idx].practiceTimeSec + stat.practiceTimeSec,
        keyErrors: mergeKeyErrors(stats[idx].keyErrors, stat.keyErrors),
      };
    } else {
      stats.push(stat);
    }

    // 裁剪：保留最近 90 天（先按日期排序，避免乱序写入时删错条目）
    if (stats.length > STATS_MAX_DAYS) {
      stats.sort((a, b) => a.date.localeCompare(b.date));
      stats.splice(0, stats.length - STATS_MAX_DAYS);
    }

    writeJSON(this.userId, 'stats', stats);
    this.touchMeta();
  }

  /** 添加/更新错题 */
  upsertReviewItem(item: ReviewItem): void {
    const review = readJSON<ReviewItem[]>(this.userId, 'review', []);
    const idx = review.findIndex((r) => r.char === item.char);

    if (idx >= 0) {
      review[idx] = {
        ...review[idx],
        wrongCount: review[idx].wrongCount + 1,
        lastSeen: Date.now(),
        nextReview: item.nextReview,
        // 尊重调用方传入的级别（答错时由调度器降回第 1 级）
        level: item.level ?? review[idx].level ?? 0,
      };
    } else {
      review.push({ ...item, lastSeen: Date.now() });
    }

    // 裁剪：上限 500 条，按「到期最早 + 错误次数最多」保留
    if (review.length > REVIEW_MAX_ITEMS) {
      review.sort((a, b) => {
        if (a.nextReview !== b.nextReview) return a.nextReview - b.nextReview;
        return b.wrongCount - a.wrongCount;
      });
      review.length = REVIEW_MAX_ITEMS;
    }

    writeJSON(this.userId, 'review', review);
    this.touchMeta();
  }

  /** 获取到期需要复习的题目 */
  getDueReviewItems(): ReviewItem[] {
    const review = readJSON<ReviewItem[]>(this.userId, 'review', []);
    const now = Date.now();
    return review.filter((r) => r.nextReview <= now);
  }

  /** 读取全部错题条目 */
  loadReview(): ReviewItem[] {
    return readJSON<ReviewItem[]>(this.userId, 'review', []);
  }

  /** 整体覆盖错题队列（裁剪后写入） */
  saveReview(items: ReviewItem[]): void {
    const trimmed = items.length > REVIEW_MAX_ITEMS
      ? [...items].sort((a, b) => {
          if (a.nextReview !== b.nextReview) return a.nextReview - b.nextReview;
          return b.wrongCount - a.wrongCount;
        }).slice(0, REVIEW_MAX_ITEMS)
      : items;
    writeJSON(this.userId, 'review', trimmed);
    this.touchMeta();
  }

  /** 批量写入（会话结束时调用） */
  batchWrite(data: Partial<WubiStorageData>): void {
    if (data.progress) this.saveProgress(data.progress);
    if (data.settings) this.saveSettings(data.settings);
    if (data.stats) {
      for (const stat of data.stats) this.addDailyStat(stat);
    }
    if (data.review) {
      for (const item of data.review) this.upsertReviewItem(item);
    }
  }

  /** 获取默认数据 */
  getDefaultData(): WubiStorageData {
    return {
      progress: normalizeProgress(DEFAULT_PROGRESS),
      stats: [],
      review: [],
      settings: { ...DEFAULT_SETTINGS },
      meta: {
        schemaVersion: SCHEMA_VERSION,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };
  }

  /** 更新 meta.updatedAt */
  private touchMeta(): void {
    const meta = readJSON<StorageMeta>(this.userId, 'meta', {
      schemaVersion: SCHEMA_VERSION,
      createdAt: Date.now(),
      updatedAt: 0,
    });
    meta.updatedAt = Date.now();
    writeJSON(this.userId, 'meta', meta);
  }
}

// ─── 导入/导出 ──────────────────────────────────────────

export interface ExportData {
  schemaVersion: number;
  exportedAt: number;
  progress: ProgressData;
  stats: DailyStat[];
  review: ReviewItem[];
  settings: SettingsData;
}

/**
 * 导出全部数据为 JSON 字符串。
 */
export function exportData(storage: WubiStorage): string {
  const data = storage.loadAll();
  const exportPayload: ExportData = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    progress: data.progress,
    stats: data.stats,
    review: data.review,
    settings: data.settings,
  };
  return JSON.stringify(exportPayload, null, 2);
}

/**
 * 导入数据。
 * 结构校验失败则拒绝并返回错误信息，不做部分合并。
 */
export function importData(storage: WubiStorage, json: string): { ok: true } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON 格式错误，无法解析' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: '数据结构不正确：根对象不是对象' };
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.schemaVersion !== 'number') {
    return { ok: false, error: '缺少 schemaVersion 字段' };
  }
  if (!Array.isArray(obj.stats)) {
    return { ok: false, error: 'stats 字段不是数组' };
  }
  if (!Array.isArray(obj.review)) {
    return { ok: false, error: 'review 字段不是数组' };
  }
  if (typeof obj.settings !== 'object' || obj.settings === null) {
    return { ok: false, error: 'settings 字段不是对象' };
  }
  if (typeof obj.progress !== 'object' || obj.progress === null) {
    return { ok: false, error: 'progress 字段不是对象' };
  }

  // 校验通过，写入
  const data: WubiStorageData = {
    progress: normalizeProgress(obj.progress as Partial<ProgressData>),
    stats: obj.stats as DailyStat[],
    review: obj.review as ReviewItem[],
    // 导入的是别的版本导出的文件，字段可能比当前少 —— 同样走兜底
    settings: normalizeSettings(obj.settings as Partial<SettingsData>),
    meta: {
      schemaVersion: SCHEMA_VERSION,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };

  storage.batchWrite(data);
  return { ok: true };
}
