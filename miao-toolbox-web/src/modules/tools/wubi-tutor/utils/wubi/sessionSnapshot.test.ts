/**
 * 中断现场（快照）单测。
 *
 * 这份数据的来源是 localStorage：可能被用户改过、被旧版本写过、被并发页签
 * 写坏。**一个字段越界就能让恢复出来的会话错乱**（比如 completed 大于总题数），
 * 而那时界面看起来完全正常 —— 所以宁可当作没有，也不能「尽力恢复」。
 */

import { describe, it, expect } from 'vitest';
import {
  SNAPSHOT_VERSION,
  SNAPSHOT_TTL_MS,
  buildSnapshot,
  serializeSnapshot,
  parseSnapshot,
  isRestorableKind,
  type BuildSnapshotInput,
  type SnapshotCounters,
} from './sessionSnapshot';

const NOW = 1_700_000_000_000;

const COUNTERS: SnapshotCounters = {
  completedCount: 7,
  totalKeystrokes: 42,
  errorKeystrokes: 3,
  wrongChars: ['的'],
  attemptedChars: ['的', '一'],
  correctCharCount: 7,
  wrongQuestionCount: 2,
  wrongKeys: ['g'],
  keyErrors: [{ expected: 'g', actual: 'f' }],
  maxCombo: 5,
};

const input = (over: Partial<BuildSnapshotInput> = {}): BuildSnapshotInput => ({
  modeKind: 'char-code',
  params: {},
  seed: 20261006,
  completed: 7,
  inputKeys: [],
  counters: COUNTERS,
  elapsedMs: 61_000,
  now: NOW,
  ...over,
});

describe('buildSnapshot', () => {
  it('可恢复的模式能构造出快照', () => {
    const snapshot = buildSnapshot(input());
    expect(snapshot).not.toBeNull();
    expect(snapshot!.version).toBe(SNAPSHOT_VERSION);
    expect(snapshot!.completed).toBe(7);
  });

  it('不可恢复的模式返回 null（而不是写一份将来恢复不了的垃圾）', () => {
    // 课程闯关不在白名单内
    expect(buildSnapshot(input({ modeKind: 'course' }))).toBeNull();
    expect(buildSnapshot(input({ modeKind: '不存在的模式' }))).toBeNull();
  });

  it('种子 / 用时 / 已完成数非法时返回 null', () => {
    expect(buildSnapshot(input({ seed: NaN }))).toBeNull();
    expect(buildSnapshot(input({ elapsedMs: Infinity }))).toBeNull();
    expect(buildSnapshot(input({ completed: -1 }))).toBeNull();
    expect(buildSnapshot(input({ completed: 1.5 }))).toBeNull();
  });
});

describe('isRestorableKind', () => {
  it('白名单内的模式为真，课程为假', () => {
    expect(isRestorableKind('char-code')).toBe(true);
    expect(isRestorableKind('article')).toBe(true);
    expect(isRestorableKind('course')).toBe(false);
  });
});

describe('parseSnapshot', () => {
  const roundTrip = (over: Partial<BuildSnapshotInput> = {}) => {
    const snapshot = buildSnapshot(input(over))!;
    return parseSnapshot(serializeSnapshot(snapshot), NOW + 1000);
  };

  it('序列化后再解析，字段完整', () => {
    const parsed = roundTrip();
    expect(parsed).not.toBeNull();
    expect(parsed!.modeKind).toBe('char-code');
    expect(parsed!.completed).toBe(7);
    expect(parsed!.counters).toEqual(COUNTERS);
    // keyErrors 必须一起带回来：易混字根分析（成绩页）靠它出数据，
    // 漏掉不会崩，只会让刷新过的会话给出偏少的配对 —— 属于静默失真
    expect(parsed!.counters.keyErrors).toEqual([{ expected: 'g', actual: 'f' }]);
  });

  it('空 / 损坏的 JSON 返回 null', () => {
    expect(parseSnapshot(null, NOW)).toBeNull();
    expect(parseSnapshot('', NOW)).toBeNull();
    expect(parseSnapshot('{ 不是 json', NOW)).toBeNull();
    expect(parseSnapshot('"字符串"', NOW)).toBeNull();
    expect(parseSnapshot('[]', NOW)).toBeNull();
  });

  it('版本不符一律丢弃（不做尽力兼容）', () => {
    const snapshot = { ...buildSnapshot(input())!, version: SNAPSHOT_VERSION + 1 };
    expect(parseSnapshot(JSON.stringify(snapshot), NOW)).toBeNull();
  });

  it('超过 TTL 视为过期', () => {
    const snapshot = buildSnapshot(input())!;
    const json = serializeSnapshot(snapshot);

    expect(parseSnapshot(json, NOW + SNAPSHOT_TTL_MS - 1000)).not.toBeNull();
    expect(parseSnapshot(json, NOW + SNAPSHOT_TTL_MS + 1000)).toBeNull();
  });

  it('时钟回拨（savedAt 在未来）也不可信', () => {
    const snapshot = buildSnapshot(input())!;
    expect(parseSnapshot(serializeSnapshot(snapshot), NOW - 5 * 60_000)).toBeNull();
  });

  it('counters 缺字段 / 类型不对时丢弃', () => {
    const base = buildSnapshot(input())!;

    const missing = { ...base, counters: { ...COUNTERS, keyErrors: undefined } };
    expect(parseSnapshot(JSON.stringify(missing), NOW)).toBeNull();

    const wrongType = { ...base, counters: { ...COUNTERS, completedCount: '7' } };
    expect(parseSnapshot(JSON.stringify(wrongType), NOW)).toBeNull();

    const notList = { ...base, counters: { ...COUNTERS, wrongChars: '的' } };
    expect(parseSnapshot(JSON.stringify(notList), NOW)).toBeNull();
  });

  it('params 只接受原始类型（恢复时要能原样喂给 buildSource）', () => {
    const base = buildSnapshot(input())!;

    const nested = { ...base, params: { text: { deep: '对象' } } };
    expect(parseSnapshot(JSON.stringify(nested), NOW)).toBeNull();

    const ok = { ...base, params: { zoneScope: 'all', chars: ['的', '一'], seed: 1, flag: true } };
    expect(parseSnapshot(JSON.stringify(ok), NOW)).not.toBeNull();
  });

  it('inputKeys 缺失即判无效（不当作空）', () => {
    /*
     * 空与缺失在文章模式下完全是两回事：空 = 从头开始，缺失 = 旧版本写的快照。
     * 若把缺失当作空，恢复它等于**悄悄抹掉用户的文章进度** ——
     * 界面看起来正常（就是从头），用户只会以为「刷新后进度没了」。
     */
    const base = buildSnapshot(input())!;
    const noKeys = { ...base } as Record<string, unknown>;
    delete noKeys.inputKeys;

    expect(parseSnapshot(JSON.stringify(noKeys), NOW)).toBeNull();
  });

  it('inputKeys 元素不是单字符时丢弃', () => {
    const base = buildSnapshot(input())!;

    for (const bad of [['gg'], ['g', 1], ['g', null], 'ggll', [['g']]]) {
      expect(parseSnapshot(JSON.stringify({ ...base, inputKeys: bad }), NOW)).toBeNull();
    }

    // 正常的长序列要能通过：文章可以有几百个字
    const long = Array.from({ length: 4000 }, () => 'g');
    expect(parseSnapshot(JSON.stringify({ ...base, inputKeys: long }), NOW)).not.toBeNull();
  });

  it('negative elapsedMs 被拒绝（否则已用时会从负数开始）', () => {
    const base = buildSnapshot(input())!;
    const negative = { ...base, elapsedMs: -1000 };
    expect(parseSnapshot(JSON.stringify(negative), NOW)).toBeNull();
  });
});
