import { useContext } from 'react';
import { TranslateStateContext, TranslateDispatchContext } from './TranslateProvider';
import type { TranslateState, TranslateAction } from './translateContext';

/**
 * 访问翻译工具框架状态与变更方法。
 * 必须在 `<TranslateProvider>` 内使用，否则抛出错误。
 */
export function useTranslateContext(): { state: TranslateState; dispatch: (action: TranslateAction) => void } {
  const state = useContext(TranslateStateContext);
  const dispatch = useContext(TranslateDispatchContext);

  if (state === null || dispatch === null) {
    throw new Error('useTranslateContext 必须在 <TranslateProvider> 内使用');
  }

  return { state, dispatch };
}
