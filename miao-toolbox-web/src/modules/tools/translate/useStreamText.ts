import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 前端模拟流式文本输出（打字机效果）。
 *
 * 说明：
 * - 当前后端 /api/translate/enhance 仍返回完整 JSON，前端用此 hook 将完整结果
 *   按字符速度（默认 40 字/秒）逐字渲染，营造类 ChatGPT 的生成感。
 * - 支持停止、重置，并在切换风格或重新翻译时自动清理。
 */
interface UseStreamTextReturn {
  /** 当前已流式展示出的文本 */
  displayed: string;
  /** 是否正在流式输出中 */
  isStreaming: boolean;
  /** 启动流式输出，展示给定完整文本 */
  start: (text: string) => void;
  /** 停止流式输出，保留已展示内容 */
  stop: () => void;
  /** 清空状态 */
  reset: () => void;
}

export function useStreamText(speed = 40): UseStreamTextReturn {
  const [displayed, setDisplayed] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const rafRef = useRef<number | null>(null);
  const fullTextRef = useRef('');

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    fullTextRef.current = '';
    setDisplayed('');
  }, [stop]);

  const start = useCallback(
    (text: string) => {
      reset();
      fullTextRef.current = text;
      setIsStreaming(true);
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const charsToShow = Math.min(text.length, Math.floor((elapsed / 1000) * speed));
        const current = text.slice(0, charsToShow);
        setDisplayed(current);
        if (charsToShow < text.length) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          setIsStreaming(false);
          rafRef.current = null;
        }
      };

      rafRef.current = requestAnimationFrame(step);
    },
    [reset, speed],
  );

  useEffect(() => reset, [reset]);

  return { displayed, isStreaming, start, stop, reset };
}

export default useStreamText;
