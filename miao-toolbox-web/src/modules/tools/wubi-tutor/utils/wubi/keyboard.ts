/**
 * 键盘捕获纯函数
 *
 * 从 KeyboardEvent 提取可测的判定逻辑，与 Hook 分离。
 * Hook 只负责挂载/卸载监听，实际判定调用这里的纯函数。
 */

// ─── 类型定义 ────────────────────────────────────────────

export type KeyAction =
  | { type: 'answer'; key: string }
  | { type: 'space-confirm' }
  | { type: 'select-candidate'; index: number }
  | { type: 'escape' }
  | { type: 'restart-round' }
  | { type: 'skip' }
  | { type: 'ignore' };

// ─── 纯函数 ──────────────────────────────────────────────

/**
 * 判断事件是否带有修饰键（Ctrl/Meta/Alt）。
 * 带修饰键的事件应被忽略，保留浏览器快捷键。
 */
export function hasModifierKey(e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}

/**
 * 将 event.code 映射为五笔键位字母或控制动作。
 *
 * 规则：
 * - KeyA~KeyY → 小写字母（a~y），KeyZ → null（Z 不用于编码）
 * - Space → 空格确认
 * - Digit1~Digit5 → 重码选择（1~5）
 * - Escape → 退出练习
 * - Tab → 重开本轮
 * - Ctrl/Cmd+Enter → 跳过当前字
 * - 其他 → ignore
 *
 * IME 组合中的事件（isComposing）返回 ignore。
 * 带修饰键的事件（Ctrl/Meta/Alt）返回 ignore（但 Ctrl/Cmd+Enter 例外）。
 */
export function resolveKeyAction(e: {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
}): KeyAction {
  // IME 组合中：忽略
  if (e.isComposing) return { type: 'ignore' };

  // Ctrl/Cmd+Enter：跳过
  if ((e.ctrlKey || e.metaKey) && e.code === 'Enter') {
    return { type: 'skip' };
  }

  // 其他带修饰键的事件：忽略
  if (hasModifierKey(e)) return { type: 'ignore' };

  // 字母键 KeyA~KeyY
  const letterMatch = /^Key([A-Y])$/.exec(e.code);
  if (letterMatch) {
    return { type: 'answer', key: letterMatch[1].toLowerCase() };
  }

  // Z 键不用于编码
  if (e.code === 'KeyZ') {
    return { type: 'ignore' };
  }

  // 空格：简码确认
  if (e.code === 'Space') {
    return { type: 'space-confirm' };
  }

  // 数字键 Digit1~Digit5：重码选择
  const digitMatch = /^Digit([1-5])$/.exec(e.code);
  if (digitMatch) {
    return { type: 'select-candidate', index: parseInt(digitMatch[1], 10) };
  }

  // Escape：退出
  if (e.code === 'Escape') {
    return { type: 'escape' };
  }

  // Tab：重开本轮
  if (e.code === 'Tab') {
    return { type: 'restart-round' };
  }

  // 其他键：忽略
  return { type: 'ignore' };
}

/**
 * 判断某动作是否需要 preventDefault。
 *
 * - Space：需要（防止页面滚动）
 * - Tab：需要（防止焦点跳转）
 * - answer：需要（防止任何副作用）
 * - 其他：不需要
 */
export function shouldPreventDefault(action: KeyAction): boolean {
  return action.type === 'space-confirm'
    || action.type === 'restart-round'
    || action.type === 'answer';
}

/**
 * 判断是否应该在窄屏上挂载键盘监听。
 *
 * 窄屏（< 1024px）不挂载键盘监听。
 */
export function shouldAttachKeyboard(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(min-width: 1024px)').matches;
}
