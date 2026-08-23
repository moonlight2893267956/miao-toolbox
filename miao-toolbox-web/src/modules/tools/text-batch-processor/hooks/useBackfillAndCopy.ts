import { useState, useRef, useEffect, useCallback } from 'react';
import type { TbpAction } from '../types';

/**
 * 复用回填 + 复制交互逻辑。
 * - 回填后记录值，输入变化时自动复位 justBackfilled
 * - 复制后 1.5s 自动复位 copied
 */
export function useBackfillAndCopy(inputText: string, dispatch: React.Dispatch<TbpAction>) {
  const [justBackfilled, setJustBackfilled] = useState(false);
  const [copied, setCopied] = useState(false);
  const backfilledRef = useRef<string | null>(null);

  useEffect(() => {
    if (backfilledRef.current !== null && inputText !== backfilledRef.current) {
      backfilledRef.current = null;
      setJustBackfilled(false);
    }
  }, [inputText]);

  const handleBackfill = useCallback(
    (text: string) => {
      if (!text) return;
      dispatch({ type: 'TBP_BACKFILL', payload: text });
      backfilledRef.current = text;
      setJustBackfilled(true);
    },
    [dispatch],
  );

  const handleCopy = useCallback(async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, []);

  const handleUndoBackfill = useCallback(() => {
    dispatch({ type: 'TBP_UNDO_BACKFILL' });
    backfilledRef.current = null;
    setJustBackfilled(false);
  }, [dispatch]);

  return { justBackfilled, copied, handleBackfill, handleCopy, handleUndoBackfill };
}
