/**
 * 键盘捕获纯函数单测
 */

import { describe, it, expect } from 'vitest';
import {
  resolveKeyAction,
  hasModifierKey,
  shouldPreventDefault,
} from './keyboard';

// 构造模拟事件
function makeEvent(code: string, opts: Partial<{
  ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing: boolean;
}> = {}): Parameters<typeof resolveKeyAction>[0] {
  return {
    code,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    altKey: opts.altKey ?? false,
    isComposing: opts.isComposing ?? false,
  };
}

describe('resolveKeyAction — 字母键', () => {
  it('KeyA → answer a', () => {
    expect(resolveKeyAction(makeEvent('KeyA'))).toEqual({ type: 'answer', key: 'a' });
  });

  it('KeyG → answer g', () => {
    expect(resolveKeyAction(makeEvent('KeyG'))).toEqual({ type: 'answer', key: 'g' });
  });

  it('KeyY → answer y', () => {
    expect(resolveKeyAction(makeEvent('KeyY'))).toEqual({ type: 'answer', key: 'y' });
  });

  it('KeyZ → ignore（Z 不用于编码）', () => {
    expect(resolveKeyAction(makeEvent('KeyZ'))).toEqual({ type: 'ignore' });
  });
});

describe('resolveKeyAction — 控制键', () => {
  it('Space → space-confirm', () => {
    expect(resolveKeyAction(makeEvent('Space'))).toEqual({ type: 'space-confirm' });
  });

  it('Digit1 → select-candidate 1', () => {
    expect(resolveKeyAction(makeEvent('Digit1'))).toEqual({ type: 'select-candidate', index: 1 });
  });

  it('Digit5 → select-candidate 5', () => {
    expect(resolveKeyAction(makeEvent('Digit5'))).toEqual({ type: 'select-candidate', index: 5 });
  });

  it('Escape → escape', () => {
    expect(resolveKeyAction(makeEvent('Escape'))).toEqual({ type: 'escape' });
  });

  it('Tab → restart-round', () => {
    expect(resolveKeyAction(makeEvent('Tab'))).toEqual({ type: 'restart-round' });
  });
});

describe('resolveKeyAction — 修饰键', () => {
  it('Ctrl+Enter → skip', () => {
    expect(resolveKeyAction(makeEvent('Enter', { ctrlKey: true }))).toEqual({ type: 'skip' });
  });

  it('Cmd+Enter → skip', () => {
    expect(resolveKeyAction(makeEvent('Enter', { metaKey: true }))).toEqual({ type: 'skip' });
  });

  it('Ctrl+A → ignore（带修饰键）', () => {
    expect(resolveKeyAction(makeEvent('KeyA', { ctrlKey: true }))).toEqual({ type: 'ignore' });
  });

  it('Alt+G → ignore', () => {
    expect(resolveKeyAction(makeEvent('KeyG', { altKey: true }))).toEqual({ type: 'ignore' });
  });
});

describe('resolveKeyAction — IME', () => {
  it('isComposing=true 时忽略', () => {
    expect(resolveKeyAction(makeEvent('KeyA', { isComposing: true }))).toEqual({ type: 'ignore' });
  });

  it('isComposing=true 时即使 Space 也忽略', () => {
    expect(resolveKeyAction(makeEvent('Space', { isComposing: true }))).toEqual({ type: 'ignore' });
  });
});

describe('resolveKeyAction — 其他键', () => {
  it('Enter（无修饰键）→ ignore', () => {
    expect(resolveKeyAction(makeEvent('Enter'))).toEqual({ type: 'ignore' });
  });

  it('ShiftLeft → ignore', () => {
    expect(resolveKeyAction(makeEvent('ShiftLeft'))).toEqual({ type: 'ignore' });
  });

  it('ArrowUp → ignore', () => {
    expect(resolveKeyAction(makeEvent('ArrowUp'))).toEqual({ type: 'ignore' });
  });

  it('Digit6 → ignore（超出重码范围 1~5）', () => {
    expect(resolveKeyAction(makeEvent('Digit6'))).toEqual({ type: 'ignore' });
  });

  it('Digit0 → ignore', () => {
    expect(resolveKeyAction(makeEvent('Digit0'))).toEqual({ type: 'ignore' });
  });
});

describe('hasModifierKey', () => {
  it('无修饰键返回 false', () => {
    expect(hasModifierKey({ ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
  });

  it('Ctrl 返回 true', () => {
    expect(hasModifierKey({ ctrlKey: true, metaKey: false, altKey: false })).toBe(true);
  });

  it('Meta 返回 true', () => {
    expect(hasModifierKey({ ctrlKey: false, metaKey: true, altKey: false })).toBe(true);
  });

  it('Alt 返回 true', () => {
    expect(hasModifierKey({ ctrlKey: false, metaKey: false, altKey: true })).toBe(true);
  });
});

describe('shouldPreventDefault', () => {
  it('answer 需要 preventDefault', () => {
    expect(shouldPreventDefault({ type: 'answer', key: 'g' })).toBe(true);
  });

  it('space-confirm 需要 preventDefault', () => {
    expect(shouldPreventDefault({ type: 'space-confirm' })).toBe(true);
  });

  it('restart-round 需要 preventDefault', () => {
    expect(shouldPreventDefault({ type: 'restart-round' })).toBe(true);
  });

  it('escape 不需要 preventDefault', () => {
    expect(shouldPreventDefault({ type: 'escape' })).toBe(false);
  });

  it('skip 不需要 preventDefault', () => {
    expect(shouldPreventDefault({ type: 'skip' })).toBe(false);
  });

  it('ignore 不需要 preventDefault', () => {
    expect(shouldPreventDefault({ type: 'ignore' })).toBe(false);
  });

  it('select-candidate 不需要 preventDefault', () => {
    expect(shouldPreventDefault({ type: 'select-candidate', index: 1 })).toBe(false);
  });
});
