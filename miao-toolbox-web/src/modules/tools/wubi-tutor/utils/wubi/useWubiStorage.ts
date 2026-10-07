/**
 * 学习数据持久化 Hook
 *
 * 把 WubiStorage 接入 React 生命周期：
 * - 按 userId 建立独立命名空间（取不到时用 anonymous）
 * - 提供会话结束 → 批量写入的入口
 * - 写入时机：会话结束 / 设置变更 / 复习答题（不在按键过程中写入）
 */

import { useMemo, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../../../../../contexts/AuthContext';
import {
  WubiStorage,
  exportData,
  importData,
  type ProgressData,
  type SettingsData,
  type DailyStat,
  type ReviewItem,
} from './storage';
import type { SessionResult } from './session';
import { createReviewItem } from './reviewScheduler';
import { toSummary, recordModeResult, type ModeRecord } from './sessionStats';
import { mergeUnlocked } from './achievements';
// 日期键全局唯一实现：本地时区。切勿在本文件另起一套（见 statsAggregation.toDateKey 注释）
import { todayKey } from './statsAggregation';

export function useWubiStorage() {
  const { state: authState } = useAuth();
  const userId = authState.userInfo?.id != null ? String(authState.userInfo.id) : 'anonymous';

  // 按 userId 缓存实例
  const storageRef = useRef<{ userId: string; instance: WubiStorage } | null>(null);
  if (!storageRef.current || storageRef.current.userId !== userId) {
    storageRef.current = { userId, instance: new WubiStorage(userId) };
  }
  const storage = storageRef.current.instance;

  const isPersistent = useMemo(() => storage.isPersistent, [storage]);

  /** 读取指定模式的历史记录（会话开始前调用，用于对比） */
  const getModeRecord = useCallback((modeKey: string): ModeRecord | undefined => {
    try {
      return storage.loadAll().progress.modeRecords[modeKey];
    } catch {
      return undefined;
    }
  }, [storage]);

  /**
   * 会话结束：一次性写入日统计 + 错题本 + 该模式成绩记录。
   *
   * 注意：必须在读取「上一次同类成绩」之后再调用，
   * 否则本次成绩会先覆盖 last，导致对比差值恒为 0。
   *
   * @param modeKey 练习模式标识；传入时才会写入成绩记录
   * @param options.enqueueWrongChars 是否把错字重新入队（默认 true）。
   *   复习会话必须传 `false`：它的错题回写已由 reviewScheduler 完成
   *   （见 `ReviewTab.answerReviewBatch`），这里再走一次
   *   `upsertReviewItem` 会让 `wrongCount` 对每次答错**加两次**。
   */
  const recordSession = useCallback((
    result: SessionResult,
    modeKey?: string,
    options?: { enqueueWrongChars?: boolean },
  ) => {
    try {
      const now = Date.now();

      const stat: DailyStat = {
        date: todayKey(),
        totalKeystrokes: result.totalKeystrokes,
        errorKeystrokes: result.errorKeystrokes,
        // 真实汉字数，不是题数 —— 键位/字根类练习为 0，词组按长度计
        correctChars: result.correctChars,
        sessionsCompleted: 1,
        practiceTimeSec: Math.round(result.durationSec),
        /*
         * 按键配对一并落盘：易混字根榜此前只活在会话状态里，
         * 结果面板一关就永久丢失（成绩页也就没法常驻展示）。
         */
        keyErrors: result.keyErrors,
      };
      storage.addDailyStat(stat);

      // 错字入队并回到第 1 级（10 分钟后首次复习）
      if (options?.enqueueWrongChars !== false) {
        for (const char of result.wrongChars) {
          storage.upsertReviewItem(createReviewItem(char, now, 'auto'));
        }
      }

      if (modeKey) {
        const progress = storage.loadAll().progress;
        storage.saveProgress({
          ...progress,
          modeRecords: recordModeResult(progress.modeRecords, modeKey, toSummary(result, now)),
        });
      }
    } catch (err) {
      // 持久化失败不应影响练习主流程
      console.error('[useWubiStorage] 会话落盘失败:', err);
    }
  }, [storage]);

  /** 读取进度 */
  const loadProgress = useCallback((): ProgressData => storage.loadAll().progress, [storage]);

  /** 读取全部日统计（按日聚合，Story 4.4 趋势用） */
  const loadStats = useCallback((): DailyStat[] => storage.loadAll().stats, [storage]);

  /** 读取全部错题条目（Story 4.2 错字清单用） */
  const loadReview = useCallback((): ReviewItem[] => storage.loadReview(), [storage]);

  /**
   * 解锁成就（只增不减，Story 4.4）。
   *
   * @returns 合并后的完整已解锁列表
   */
  const unlockAchievements = useCallback((ids: string[]): string[] => {
    try {
      const progress = storage.loadAll().progress;
      if (ids.length === 0) return progress.achievements;

      const merged = mergeUnlocked(progress.achievements, ids);
      // 无新增时不写盘，避免每次会话结束都触发一次 localStorage 写入
      if (merged.length === progress.achievements.length) return merged;

      storage.saveProgress({ ...progress, achievements: merged });
      return merged;
    } catch (err) {
      console.error('[useWubiStorage] 成就落盘失败:', err);
      return [];
    }
  }, [storage]);

  /** 保存进度 */
  const saveProgress = useCallback((progress: ProgressData) => {
    storage.saveProgress(progress);
  }, [storage]);

  /** 读取设置 */
  const loadSettings = useCallback((): SettingsData => storage.loadAll().settings, [storage]);

  /** 保存设置（整体覆盖） */
  const saveSettings = useCallback((settings: SettingsData) => {
    storage.saveSettings(settings);
  }, [storage]);

  /**
   * 更新部分设置：读 → 合并 → 写。
   *
   * `storage.saveSettings` 是整体覆盖，直接传 { lastTab } 会把其余设置清成
   * undefined；调用方也拿不到完整的 SettingsData，所以必须在这里补一次读。
   */
  const updateSettings = useCallback((patch: Partial<SettingsData>) => {
    storage.saveSettings({ ...storage.loadAll().settings, ...patch });
  }, [storage]);

  /** 获取到期复习项 */
  const getDueReview = useCallback(() => storage.getDueReviewItems(), [storage]);

  /** 中断现场：存 / 取 / 清（练习进行中的快照，不属于数据分区） */
  const saveInterruptedSession = useCallback((json: string) => {
    storage.saveInterruptedSession(json);
  }, [storage]);

  const loadInterruptedSession = useCallback(
    () => storage.loadInterruptedSession(),
    [storage],
  );

  const clearInterruptedSession = useCallback(() => {
    storage.clearInterruptedSession();
  }, [storage]);

  /** 导出全部数据 */
  const exportAll = useCallback(() => exportData(storage), [storage]);

  /** 导入数据（结构校验失败则拒绝） */
  const importAll = useCallback((json: string) => importData(storage, json), [storage]);

  // 非持久化环境（隐私模式/配额超限）时提示一次
  const warnedRef = useRef(false);
  useEffect(() => {
    if (!isPersistent && !warnedRef.current) {
      warnedRef.current = true;
      console.warn('[useWubiStorage] localStorage 不可用，进度将不会被保存');
    }
  }, [isPersistent]);

  return {
    storage,
    userId,
    isPersistent,
    recordSession,
    getModeRecord,
    loadProgress,
    saveProgress,
    loadStats,
    loadReview,
    unlockAchievements,
    loadSettings,
    saveSettings,
    updateSettings,
    saveInterruptedSession,
    loadInterruptedSession,
    clearInterruptedSession,
    getDueReview,
    exportAll,
    importAll,
  };
}
