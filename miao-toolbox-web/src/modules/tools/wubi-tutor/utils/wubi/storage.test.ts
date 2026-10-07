/**
 * 存储层单测
 *
 * 覆盖：读写往返、Schema 迁移、损坏 JSON 容错、容量裁剪、导入校验
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WubiStorage,
  exportData,
  importData,
  type ReviewItem,
  type SettingsData,
  type ProgressData,
} from './storage';
import { toDateKey, todayKey } from './statsAggregation';

// 模拟 localStorage
const mockStore = new Map<string, string>();

const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStore.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => mockStore.set(key, value)),
  removeItem: vi.fn((key: string) => mockStore.delete(key)),
  clear: vi.fn(() => mockStore.clear()),
};

beforeEach(() => {
  mockStore.clear();
  mockLocalStorage.getItem.mockClear();
  mockLocalStorage.setItem.mockClear();
  vi.stubGlobal('localStorage', mockLocalStorage);
});

describe('WubiStorage — 基本读写', () => {
  it('加载空数据返回默认值', () => {
    const storage = new WubiStorage('test-user');
    const data = storage.loadAll();

    expect(data.progress.tutorialChapter).toBe(1);
    expect(data.stats).toHaveLength(0);
    expect(data.review).toHaveLength(0);
    expect(data.settings.showVirtualKeyboard).toBe(true);
    expect(data.meta.schemaVersion).toBe(1);
  });

  it('写入设置后能读回', () => {
    const storage = new WubiStorage('test-user');
    const settings: SettingsData = {
      showVirtualKeyboard: false,
      showFingerHint: false,
      showMetricsBar: true,
      practiceMode: 'lenient',
      soundFeedback: true,
      lastTab: 'practice',
    };

    storage.saveSettings(settings);
    const data = storage.loadAll();

    expect(data.settings).toEqual(settings);
  });

  it('写入进度后能读回', () => {
    const storage = new WubiStorage('test-user');
    const progress: ProgressData = {
      tutorialChapter: 5,
      masteredKeys: ['g', 'f', 'd'],
      masteredRadicals: ['王', '土'],
      level1Mastered: ['一', '地'],
      course: { freeMode: true, lessons: {} },
      achievements: ['first-10'],
      modeRecords: {},
    };

    storage.saveProgress(progress);
    const data = storage.loadAll();

    expect(data.progress).toEqual(progress);
  });

  it('旧数据缺少新字段时补齐默认值（不返回 undefined）', () => {
    const storage = new WubiStorage('legacy-user');
    // 模拟 Story 4.1 之前写入的 progress：没有 course / achievements / modeRecords
    storage.saveProgress({
      tutorialChapter: 3,
      masteredKeys: ['g'],
      masteredRadicals: [],
      level1Mastered: [],
    // 故意写入缺字段的旧结构，验证读取时会被补齐（需绕过类型检查）
    } as unknown as ProgressData);

    const { progress } = storage.loadAll();

    expect(progress.tutorialChapter).toBe(3);
    expect(progress.course).toEqual({ freeMode: false, lessons: {} });
    expect(progress.achievements).toEqual([]);
    expect(progress.modeRecords).toEqual({});
  });

  it('不同 userId 数据隔离', () => {
    const s1 = new WubiStorage('user-1');
    const s2 = new WubiStorage('user-2');

    s1.saveSettings({ ...s1.loadAll().settings, soundFeedback: true });
    s2.saveSettings({ ...s2.loadAll().settings, soundFeedback: false });

    expect(s1.loadAll().settings.soundFeedback).toBe(true);
    expect(s2.loadAll().settings.soundFeedback).toBe(false);
  });

  it('userId 为空时使用 anonymous 命名空间', () => {
    const storage = new WubiStorage('');
    storage.saveSettings({ ...storage.loadAll().settings, practiceMode: 'lenient' });

    // 验证 key 中包含 anonymous
    const raw = mockLocalStorage.setItem.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('anonymous'),
    );
    expect(raw).toBeDefined();
  });
});

describe('WubiStorage — 日统计', () => {
  it('同日写入累加不追加', () => {
    const storage = new WubiStorage('test-user');
    const today = todayKey();

    storage.addDailyStat({
      date: today,
      totalKeystrokes: 100,
      errorKeystrokes: 10,
      correctChars: 90,
      sessionsCompleted: 1,
      practiceTimeSec: 60,
    });

    storage.addDailyStat({
      date: today,
      totalKeystrokes: 50,
      errorKeystrokes: 5,
      correctChars: 45,
      sessionsCompleted: 1,
      practiceTimeSec: 30,
    });

    const data = storage.loadAll();
    expect(data.stats).toHaveLength(1);
    expect(data.stats[0].totalKeystrokes).toBe(150);
    expect(data.stats[0].sessionsCompleted).toBe(2);
  });

  it('不同日追加新条目', () => {
    const storage = new WubiStorage('test-user');

    storage.addDailyStat({
      date: '2026-09-14',
      totalKeystrokes: 100,
      errorKeystrokes: 10,
      correctChars: 90,
      sessionsCompleted: 1,
      practiceTimeSec: 60,
    });

    storage.addDailyStat({
      date: '2026-09-15',
      totalKeystrokes: 200,
      errorKeystrokes: 20,
      correctChars: 180,
      sessionsCompleted: 2,
      practiceTimeSec: 120,
    });

    const data = storage.loadAll();
    expect(data.stats).toHaveLength(2);
  });

  it('超过 90 天裁剪最旧', () => {
    const storage = new WubiStorage('test-user');

    for (let i = 0; i < 95; i++) {
      const date = toDateKey(new Date(2026, 0, i + 1));
      storage.addDailyStat({
        date,
        totalKeystrokes: 10,
        errorKeystrokes: 1,
        correctChars: 9,
        sessionsCompleted: 1,
        practiceTimeSec: 10,
      });
    }

    const data = storage.loadAll();
    expect(data.stats.length).toBeLessThanOrEqual(90);
  });
});

describe('WubiStorage — 错题本', () => {
  it('添加新错题', () => {
    const storage = new WubiStorage('test-user');
    const item: ReviewItem = {
      char: '啊',
      wrongCount: 1,
      lastSeen: Date.now(),
      nextReview: Date.now() + 86400000,
      source: 'auto',
    };

    storage.upsertReviewItem(item);
    const data = storage.loadAll();

    expect(data.review).toHaveLength(1);
    expect(data.review[0].char).toBe('啊');
  });

  it('重复错题累加 wrongCount', () => {
    const storage = new WubiStorage('test-user');

    storage.upsertReviewItem({
      char: '啊',
      wrongCount: 1,
      lastSeen: Date.now(),
      nextReview: Date.now(),
      source: 'auto',
    });

    storage.upsertReviewItem({
      char: '啊',
      wrongCount: 1,
      lastSeen: Date.now(),
      nextReview: Date.now() + 86400000,
      source: 'auto',
    });

    const data = storage.loadAll();
    expect(data.review).toHaveLength(1);
    expect(data.review[0].wrongCount).toBe(2);
  });

  it('超过 500 条裁剪', () => {
    const storage = new WubiStorage('test-user');

    for (let i = 0; i < 550; i++) {
      storage.upsertReviewItem({
        char: `字${i}`,
        wrongCount: 1,
        lastSeen: Date.now(),
        nextReview: Date.now() + i * 1000,
        source: 'auto',
      });
    }

    const data = storage.loadAll();
    expect(data.review.length).toBeLessThanOrEqual(500);
  });

  it('getDueReviewItems 返回到期题目', () => {
    const storage = new WubiStorage('test-user');
    const now = Date.now();

    storage.upsertReviewItem({
      char: '到',
      wrongCount: 1,
      lastSeen: now,
      nextReview: now - 1000,
      source: 'auto',
    });

    storage.upsertReviewItem({
      char: '未',
      wrongCount: 1,
      lastSeen: now,
      nextReview: now + 86400000,
      source: 'auto',
    });

    const due = storage.getDueReviewItems();
    expect(due).toHaveLength(1);
    expect(due[0].char).toBe('到');
  });
});

describe('WubiStorage — 损坏 JSON 容错', () => {
  it('损坏的 JSON 返回默认值不崩溃', () => {
    const storage = new WubiStorage('test-user');

    // 直接写入损坏 JSON
    mockStore.set('miao-wubi:v1:test-user:settings', '{invalid json}}}');

    const data = storage.loadAll();
    expect(data.settings.showVirtualKeyboard).toBe(true); // 回退到默认值
  });

  it('损坏的 JSON：原始内容备份到 :backup 键，主键重置为默认值', () => {
    const storage = new WubiStorage('test-user');
    mockStore.set('miao-wubi:v1:test-user:settings', '{invalid json}}}');

    storage.loadAll();

    // 原始内容保留在独立备份键
    expect(mockStore.get('miao-wubi:v1:test-user:settings:backup')).toBe('{invalid json}}}');
    // 主键被重置为合法 JSON（而非垃圾对象）
    const main = mockStore.get('miao-wubi:v1:test-user:settings');
    expect(main).toBeTruthy();
    expect(JSON.parse(main!).showVirtualKeyboard).toBe(true);
  });

  it('损坏 JSON 后第二次读取仍返回合法数据（回归）', () => {
    const storage = new WubiStorage('test-user');
    mockStore.set('miao-wubi:v1:test-user:settings', '{invalid json}}}');

    storage.loadAll(); // 第 1 次：触发备份 + 重置
    const data2 = storage.loadAll(); // 第 2 次：不得读到 {_backup,_error} 垃圾对象

    expect(typeof data2.settings.showVirtualKeyboard).toBe('boolean');
    expect(data2.settings.practiceMode).toBe('drill');
  });
});

describe('WubiStorage — Schema 迁移', () => {
  it('版本不匹配时备份原始数据并重置', () => {
    const storage = new WubiStorage('test-user');

    mockStore.set(
      'miao-wubi:v1:test-user:meta',
      JSON.stringify({ schemaVersion: 0, createdAt: 1, updatedAt: 1 }),
    );
    mockStore.set('miao-wubi:v1:test-user:progress', JSON.stringify({ tutorialChapter: 5 }));

    const data = storage.loadAll();

    // 返回全新默认数据
    expect(data.progress.tutorialChapter).toBe(1);
    // 原始数据被备份到独立键
    expect(mockStore.get('miao-wubi:v1:test-user:progress:backup')).toContain('tutorialChapter');
  });

  it('迁移只发生一次（重置后的数据被持久化）', () => {
    const storage = new WubiStorage('test-user');

    mockStore.set(
      'miao-wubi:v1:test-user:meta',
      JSON.stringify({ schemaVersion: 0, createdAt: 1, updatedAt: 1 }),
    );

    storage.loadAll(); // 第 1 次：迁移
    const metaAfterFirst = mockStore.get('miao-wubi:v1:test-user:meta')!;
    expect(JSON.parse(metaAfterFirst).schemaVersion).toBe(1);

    storage.loadAll(); // 第 2 次：不应再迁移

    const metaAfterSecond = mockStore.get('miao-wubi:v1:test-user:meta')!;
    // meta 不应再被嵌套备份对象覆盖
    expect(JSON.parse(metaAfterSecond).schemaVersion).toBe(1);
    expect(metaAfterSecond).not.toContain('_backup');
  });
});

describe('WubiStorage — 日统计乱序裁剪', () => {
  it('乱序写入超过 90 天后仍保留最新 90 天', () => {
    const storage = new WubiStorage('test-user');

    // 先写一个较新的日期
    storage.addDailyStat({
      date: '2026-09-15', totalKeystrokes: 10, errorKeystrokes: 1,
      correctChars: 9, sessionsCompleted: 1, practiceTimeSec: 10,
    });

    // 再补一批更旧的日期，制造乱序
    for (let i = 0; i < 95; i++) {
      const date = toDateKey(new Date(2026, 0, i + 1));
      storage.addDailyStat({
        date, totalKeystrokes: 1, errorKeystrokes: 0,
        correctChars: 1, sessionsCompleted: 1, practiceTimeSec: 1,
      });
    }

    const stats = storage.loadAll().stats;
    expect(stats.length).toBeLessThanOrEqual(90);

    // 最新的日期必须在保留集合中
    expect(stats.some((s) => s.date === '2026-09-15')).toBe(true);
  });
});

describe('WubiStorage — 导入导出', () => {
  it('导出再导入数据一致', () => {
    const storage = new WubiStorage('test-user');

    storage.saveSettings({
      showVirtualKeyboard: false,
      showFingerHint: true,
      showMetricsBar: false,
      practiceMode: 'lenient',
      soundFeedback: true,
      lastTab: 'stats',
    });

    storage.saveProgress({
      tutorialChapter: 7,
      masteredKeys: ['g', 'f'],
      masteredRadicals: ['王'],
      level1Mastered: ['一'],
      course: { freeMode: false, lessons: {} },
      achievements: [],
      modeRecords: {},
    });

    const exported = exportData(storage);
    expect(() => JSON.parse(exported)).not.toThrow();

    // 导入到新存储
    const storage2 = new WubiStorage('test-user-2');
    const result = importData(storage2, exported);

    expect(result.ok).toBe(true);
    const data = storage2.loadAll();
    expect(data.settings.showVirtualKeyboard).toBe(false);
    expect(data.progress.tutorialChapter).toBe(7);
  });

  it('导入损坏 JSON 被拒绝', () => {
    const storage = new WubiStorage('test-user');
    const result = importData(storage, '{invalid}');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('JSON 格式错误');
  });

  it('导入缺少字段被拒绝', () => {
    const storage = new WubiStorage('test-user');
    const result = importData(storage, JSON.stringify({
      schemaVersion: 1,
      // 缺少 stats, review, settings, progress
    }));

    expect(result.ok).toBe(false);
  });

  it('导入非对象根被拒绝', () => {
    const storage = new WubiStorage('test-user');
    const result = importData(storage, '"just a string"');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('根对象不是对象');
  });
});

describe('WubiStorage — 内存降级', () => {
  it('localStorage 不可用时退为内存态', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => { throw new Error('not available'); }),
      setItem: vi.fn(() => { throw new Error('not available'); }),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

    const storage = new WubiStorage('test-user');
    expect(storage.isPersistent).toBe(false);

    // 内存态仍可读写（不崩溃）
    storage.saveSettings({
      showVirtualKeyboard: false,
      showFingerHint: true,
      showMetricsBar: true,
      practiceMode: 'drill',
      soundFeedback: false,
      lastTab: 'learn',
    });
    // 内存态不持久化，读回默认值
    const data = storage.loadAll();
    expect(data).toBeDefined();
  });
});

/*
 * 设置字段级兜底。
 *
 * `progress` 一直有 normalizeProgress 兜底，`settings` 却没有 —— 于是任何
 * 后续新增的设置字段，在老用户的数据里都是 undefined。activeTab 这类值一旦
 * 是 undefined，界面会直接渲染成空白，而不是报错，排查成本很高。
 */
describe('WubiStorage — 设置字段级兜底', () => {
  const settingsKey = (userId: string) => `miao-wubi:v1:${userId}:settings`;

  it('旧数据缺少后加的字段时补齐默认值，不产出 undefined', () => {
    // 模拟上个版本写下的 settings：没有 lastTab
    mockStore.set(settingsKey('legacy-user'), JSON.stringify({
      showVirtualKeyboard: false,
      showFingerHint: true,
      showMetricsBar: true,
      practiceMode: 'lenient',
      soundFeedback: true,
    }));

    const storage = new WubiStorage('legacy-user');
    const { settings } = storage.loadAll();

    // 旧字段保留原值
    expect(settings.showVirtualKeyboard).toBe(false);
    expect(settings.practiceMode).toBe('lenient');
    // 新字段补默认，而不是 undefined
    expect(settings.lastTab).toBe('learn');
  });

  it('字段类型不对时回退默认值', () => {
    mockStore.set(settingsKey('bad-user'), JSON.stringify({
      showVirtualKeyboard: 'yes',
      practiceMode: 'whatever',
      lastTab: 42,
    }));

    const storage = new WubiStorage('bad-user');
    const { settings } = storage.loadAll();

    expect(settings.showVirtualKeyboard).toBe(true);
    expect(settings.practiceMode).toBe('drill');
    expect(settings.lastTab).toBe('learn');
  });

  it('导入缺少 lastTab 的旧导出文件不会失败', () => {
    const storage = new WubiStorage('import-user');
    const payload = {
      schemaVersion: 1,
      exportedAt: Date.now(),
      progress: {},
      stats: [],
      review: [],
      // 旧版本导出的文件：settings 里没有 lastTab
      settings: { showVirtualKeyboard: true, soundFeedback: false },
    };

    const result = importData(storage, JSON.stringify(payload));

    expect(result.ok).toBe(true);
    expect(storage.loadAll().settings.lastTab).toBe('learn');
  });
});
