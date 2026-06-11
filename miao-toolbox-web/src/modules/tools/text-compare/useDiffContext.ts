import { useContext } from 'react';
import { DiffContext } from './diffContext';
import type { DiffContextValue } from './diffContext';

/**
 * 使用文本对照上下文
 */
export const useDiffContext = (): DiffContextValue => {
  const ctx = useContext(DiffContext);
  if (!ctx) {
    throw new Error('useDiffContext must be used within DiffProvider');
  }
  return ctx;
};
