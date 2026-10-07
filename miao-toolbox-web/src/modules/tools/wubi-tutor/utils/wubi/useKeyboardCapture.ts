/**
 * 键盘捕获 Hook
 *
 * 在练习会话 running 时挂载 window 级 keydown 监听。
 * IME 组合时显示警告浮层。
 * 离开练习 Tab 或页面卸载时移除监听。
 * 窄屏不挂载。
 *
 * !! 一次按键只 dispatch 一个 action !!
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  resolveKeyAction,
  shouldPreventDefault,
  shouldAttachKeyboard,
} from './keyboard';

export interface KeyboardCaptureHandlers {
  onAnswer: (key: string) => void;
  onSpaceConfirm: () => void;
  onSelectCandidate: (index: number) => void;
  onEscape: () => void;
  onRestartRound: () => void;
  onSkip: () => void;
}

export function useKeyboardCapture(
  active: boolean,
  handlers: KeyboardCaptureHandlers,
) {
  const [imeComposing, setImeComposing] = useState(false);
  /**
   * 键盘监听是否真正挂载（调用方据此向用户暴露失败原因）。
   *
   * 直接由条件算出来，不用 state 在 effect 里同步 —— 它就是
   * 「会话在跑 且 屏够宽」，与 effect 的挂载条件同源。
   * 用 state 同步要多一次级联渲染，React 也不建议在 effect 里同步 setState。
   */
  const attached = active && shouldAttachKeyboard();
  const handlersRef = useRef(handlers);

  /*
   * 始终保持最新 handlers —— 但必须写在 effect 里，不能在渲染期赋值。
   *
   * 「渲染期给 ref 赋值」是老写法：React 明确禁止在渲染期读写 ref，
   * 因为渲染可能被丢弃后重跑，那时写 ref 就成了渲染的副作用。
   *
   * 移到 effect 不会漏按键：用户按键必然发生在 effect 之后
   * （effect 在渲染提交后立刻执行，键盘事件来自之后的用户交互），
   * 且首次挂载时 useRef 的初始值就是第一份 handlers。
   */
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // IME 检测
    if (e.isComposing) {
      setImeComposing(true);
      return;
    }

    const action = resolveKeyAction(e);

    if (shouldPreventDefault(action)) {
      e.preventDefault();
    }

    const h = handlersRef.current;
    switch (action.type) {
      case 'answer':
        h.onAnswer(action.key);
        break;
      case 'space-confirm':
        h.onSpaceConfirm();
        break;
      case 'select-candidate':
        h.onSelectCandidate(action.index);
        break;
      case 'escape':
        h.onEscape();
        break;
      case 'restart-round':
        h.onRestartRound();
        break;
      case 'skip':
        h.onSkip();
        break;
      case 'ignore':
        // 不做任何事
        break;
    }
  }, []);

  // composition 事件监听
  const handleCompositionStart = useCallback(() => {
    setImeComposing(true);
  }, []);

  const handleCompositionEnd = useCallback(() => {
    setImeComposing(false);
  }, []);

  useEffect(() => {
    // 不满足挂载条件（会话未运行 / 窄屏）就不订阅：
    // 窄屏由调用方读 attached 展示提示，避免「按键无反应」的静默失败
    if (!attached) return;

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('compositionstart', handleCompositionStart);
    window.addEventListener('compositionend', handleCompositionEnd);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true } as EventListenerOptions);
      window.removeEventListener('compositionstart', handleCompositionStart);
      window.removeEventListener('compositionend', handleCompositionEnd);
    };
  }, [attached, handleKeyDown, handleCompositionStart, handleCompositionEnd]);

  return { imeComposing, attached };
}
