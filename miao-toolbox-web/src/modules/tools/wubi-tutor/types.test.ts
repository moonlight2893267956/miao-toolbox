/**
 * 顶层状态工具单测。
 *
 * 重点是「持久化值不可信」：activeTab 来自 localStorage，可能是旧版本写的、
 * 手改的、或类型系统管不到的非法值。原样塞进 state 的后果不是报错，而是
 * 内容区渲染成空白 —— 用户看到一个白屏，也不知道为什么。
 */

import { describe, it, expect } from 'vitest';
import {
  WUBI_TABS,
  INITIAL_WUBI_STATE,
  createInitialWubiState,
  normalizeTabKey,
  wubiReducer,
} from './types';

describe('normalizeTabKey', () => {
  it('合法 Tab 原样返回', () => {
    for (const tab of WUBI_TABS) {
      expect(normalizeTabKey(tab.key)).toBe(tab.key);
    }
  });

  it('非法值一律回退到默认 Tab', () => {
    const bads: unknown[] = ['practiceX', '', 'PRACTICE', 'tab', 3, null, undefined, {}, []];
    for (const bad of bads) {
      expect(normalizeTabKey(bad)).toBe(INITIAL_WUBI_STATE.activeTab);
    }
  });

  it('大小写敏感，不做宽容匹配', () => {
    // 'Practice' 不是合法 key。宽容匹配只会把「看起来能过」的值放进来，
    // 等到界面上找不到对应 Tab 时才发现。
    expect(normalizeTabKey('Practice')).toBe(INITIAL_WUBI_STATE.activeTab);
  });
});

describe('createInitialWubiState', () => {
  it('恢复持久化的 Tab', () => {
    expect(createInitialWubiState('practice').activeTab).toBe('practice');
    expect(createInitialWubiState('stats').activeTab).toBe('stats');
  });

  it('瞬时状态一律回到默认（浮层不能跟着刷新一起恢复）', () => {
    const state = createInitialWubiState('review');

    expect(state.splitDemoChar).toBeNull();
    expect(state.cheatSheetOpen).toBe(false);
    expect(state.practiceScope).toBeNull();
  });

  it('没有持久化值时用默认 Tab', () => {
    expect(createInitialWubiState(undefined).activeTab).toBe('learn');
    expect(createInitialWubiState('不存在的 tab').activeTab).toBe('learn');
  });
});

describe('wubiReducer — 切 Tab', () => {
  it('WT_SET_TAB 只改 activeTab，不动其它状态', () => {
    const next = wubiReducer(
      { ...INITIAL_WUBI_STATE, splitDemoChar: '王', cheatSheetOpen: true },
      { type: 'WT_SET_TAB', payload: 'lookup' },
    );

    expect(next.activeTab).toBe('lookup');
    // 切 Tab 不负责关浮层（那是各自动作的事），顺手清掉会造成「切回来浮层没了」的错觉
    expect(next.splitDemoChar).toBe('王');
    expect(next.cheatSheetOpen).toBe(true);
  });
});
