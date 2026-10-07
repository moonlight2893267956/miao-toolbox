/**
 * 错题本与复习队列 Hook
 *
 * 基于 reviewScheduler 的纯函数操作队列并落盘。
 */

import { useState, useCallback, useMemo } from 'react';
import { useWubiStorage } from './useWubiStorage';
import {
  getDueItems,
  summarize,
  applyAnswer,
  applyAnswers,
  removeItem,
  removeMastered,
  createReviewItem,
  upsertItem,
  type ReviewStats,
  type ReviewAnswer,
} from './reviewScheduler';
import type { ReviewItem } from './storage';

export function useReview() {
  const { storage } = useWubiStorage();

  const [items, setItems] = useState<ReviewItem[]>(() => storage.loadReview());
  const [now, setNow] = useState(() => Date.now());

  /** 落盘并同步内存态 */
  const persist = useCallback((next: ReviewItem[]) => {
    storage.saveReview(next);
    setItems(next);
  }, [storage]);

  /** 重新从存储读取（进入 Tab / 会话结束后） */
  const refresh = useCallback(() => {
    setItems(storage.loadReview());
    setNow(Date.now());
  }, [storage]);

  /** 待复习条目（按优先级排序） */
  const dueItems = useMemo(() => getDueItems(items, now), [items, now]);

  /** 队列统计 */
  const stats: ReviewStats = useMemo(() => summarize(items, now), [items, now]);

  /** 记录一次复习作答：答对升级、答错降级 */
  const answerReview = useCallback((char: string, correct: boolean) => {
    const next = applyAnswer(items, char, correct, Date.now());
    persist(next);
  }, [items, persist]);

  /**
   * 批量回写一轮作答结果（推荐入口）。
   *
   * 一轮复习涉及多个字，必须一次性合并后落盘；
   * 循环调用 answerReview 会因闭包快照导致只有最后一字生效。
   */
  const answerReviewBatch = useCallback((answers: ReviewAnswer[]) => {
    if (answers.length === 0) return;
    persist(applyAnswers(items, answers, Date.now()));
  }, [items, persist]);

  /**
   * 手动把字加入难字本（Story 4.3「加入难字本」入口）。
   *
   * 与错题自动入队的区别：source 标记为 'manual'，便于区分主动收藏与被动出错。
   *
   * @returns 是否新增成功（已存在则返回 false）
   */
  const addManual = useCallback((char: string): boolean => {
    if (!char) return false;
    if (items.some((it) => it.char === char)) return false;

    persist(upsertItem(items, createReviewItem(char, Date.now(), 'manual')));
    return true;
  }, [items, persist]);

  /** 移除单个字 */
  const remove = useCallback((char: string) => {
    persist(removeItem(items, char));
  }, [items, persist]);

  /** 清空所有已掌握的字 */
  const removeAllMastered = useCallback(() => {
    persist(removeMastered(items));
  }, [items, persist]);

  return {
    items,
    dueItems,
    stats,
    /**
     * 当前时刻（随 refresh 更新，每 30 秒一次）。
     *
     * 界面判断「单项是否到期」要用它，**不要在渲染里调用 Date.now()**：
     * 那会让渲染结果取决于挂钟而非状态（同样的 props/state 渲染出不同 UI），
     * 也与这里的 dueItems / stats 口径不一致 —— 它们都按这个 now 算。
     */
    now,
    refresh,
    answerReview,
    answerReviewBatch,
    addManual,
    remove,
    removeAllMastered,
  };
}
